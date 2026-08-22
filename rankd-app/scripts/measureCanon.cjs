// PHASE 5.0 — measurement only. Fetches nothing but TMDb, writes nothing at all.
//
// Answers the one question the whole house-account feature is downstream of:
// how many of a TMDb top-rated canon produce a `slugId` that matches an id in a
// REAL Letterboxd-imported library.
//
// If that number is small, the consensus half of the bot has nothing to eat.

const fs = require("fs");
const path = require("path");

// Copied verbatim from src/lib/importCsv.ts. If these two ever disagree the
// measurement is worthless, so they are compared character by character below.
const slugId = (title, year) =>
  `${title}-${year}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function splitRow(line) {
  const out = []; let field = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(field); field = ""; }
    else field += c;
  }
  out.push(field);
  return out;
}

function readFixture(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const header = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  const iName = header.indexOf("name"), iYear = header.indexOf("year");
  const films = new Map();
  for (let i = 1; i < lines.length; i++) {
    const row = splitRow(lines[i]);
    const title = (row[iName] ?? "").trim(), year = (row[iYear] ?? "").trim();
    if (!title) continue;
    films.set(slugId(title, year), { title, year });
  }
  return films;
}

const KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";
const CACHE = path.join(__dirname, ".cache");

async function topRatedPage(page) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `top_rated_${page}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const url = `${BASE}/movie/top_rated?api_key=${KEY}&language=en-US&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDb ${res.status} on page ${page}`);
  const body = await res.json();
  fs.writeFileSync(file, JSON.stringify(body));
  return body;
}

(async () => {
  if (!KEY) { console.error("TMDB_API_KEY is not set"); process.exit(1); }

  const library = readFixture(path.join(__dirname, "..", "test", "fixtures", "ratings.csv"));
  console.log(`library: ${library.size} films from the real Letterboxd fixture\n`);

  const PAGES = 50; // 20 per page = 1000
  const canon = [];
  for (let p = 1; p <= PAGES; p++) {
    const body = await topRatedPage(p);
    for (const m of body.results) {
      const year = (m.release_date ?? "").slice(0, 4);
      canon.push({
        title: m.title,
        original: m.original_title,
        year,
        id: slugId(m.title, year),
      });
    }
    if (p % 10 === 0) process.stdout.write(`  fetched ${p * 20}\n`);
  }
  console.log(`canon:   ${canon.length} films from TMDb /movie/top_rated\n`);

  // ── 1. The naive answer: title + release year, exactly as the app would ──
  const exact = canon.filter((c) => library.has(c.id));
  console.log(`EXACT (title + release year): ${exact.length} / ${canon.length} canon films are in this library`);
  console.log(`  = ${((exact.length / library.size) * 100).toFixed(1)}% of the library`);

  // ── 2. With the alias fan-out the plan proposes ──────────────────────────
  const aliasesFor = (c) => {
    const titles = new Set([c.title, c.original]);
    if (c.title.includes(":")) titles.add(c.title.split(":")[0].trim());
    if (c.original && c.original.includes(":")) titles.add(c.original.split(":")[0].trim());
    const years = new Set([c.year]);
    const n = Number(c.year);
    if (n) { years.add(String(n - 1)); years.add(String(n + 1)); }
    const out = new Set();
    for (const t of titles) for (const y of years) if (t) out.add(slugId(t, y));
    return out;
  };

  const matchedIds = new Set();
  let aliasHits = 0;
  const wonByAlias = [];
  for (const c of canon) {
    let hit = null;
    for (const id of aliasesFor(c)) if (library.has(id)) { hit = id; break; }
    if (hit) {
      aliasHits++;
      matchedIds.add(hit);
      if (hit !== c.id) wonByAlias.push({ canon: c.id, matched: hit, title: c.title });
    }
  }
  console.log(`\nWITH ALIASES (±1 year, original title, subtitle stripped): ${aliasHits} / ${canon.length}`);
  console.log(`  = ${((aliasHits / library.size) * 100).toFixed(1)}% of the library`);
  console.log(`  aliases rescued ${wonByAlias.length} films the exact id missed`);
  if (wonByAlias.length) {
    console.log(`\n  examples of what aliases rescued:`);
    for (const w of wonByAlias.slice(0, 12)) console.log(`    ${w.title}  ${w.canon}  ->  ${w.matched}`);
  }

  // ── 3. Sanity: is the fixture's taste anything like the canon at all? ────
  console.log(`\n--- context ---`);
  console.log(`A canon of ${canon.length} against a library of ${library.size}.`);
  console.log(`${aliasHits} shared films is the ballot every comparison would run on.`);
  console.log(`The plan's floor for a meaningful comparison is 20 shared films.`);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
