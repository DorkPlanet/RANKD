// Getting one file out of a .zip, with no dependency.
//
// ── Why this exists ────────────────────────────────────────────────────────
//
// Letterboxd's export is a zip. The importer wants `ratings.csv`, which is one
// file inside it, and the step where people actually give up is getting that
// file out on a phone — where "open the zip, find the file, remember where it
// saved" is several minutes of fighting a file manager, and on some phones is
// not obviously possible at all.
//
// Accepting the zip directly deletes that step. It is the difference between an
// import that works and an import people abandon, which for this app is the
// difference between having a library and not.
//
// ── Why no library ─────────────────────────────────────────────────────────
//
// A zip reader sounds like a dependency and is not, any more. `deflate` is the
// only compression method any real zip writer uses for text, and the browser
// has had `DecompressionStream("deflate-raw")` natively for years. What is left
// is reading two small structures. That is ~100 lines against ~50KB of
// JavaScript for a file this app opens once per user.
//
// ── What is deliberately NOT handled ───────────────────────────────────────
//
// Encryption, spanned archives, zip64 (>4GB), and any compression method other
// than stored or deflate. A Letterboxd export is none of those, and a reader
// that quietly half-supports the exotic cases is worse than one that says it
// cannot: every failure here falls back to "pick the .csv instead", which
// always works.

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** One entry as the central directory describes it. */
interface Entry {
  name: string;
  /** 0 = stored, 8 = deflate. Anything else is refused. */
  method: number;
  compressedSize: number;
  /** Where this entry's LOCAL header starts. */
  offset: number;
}

/**
 * The End of Central Directory record, found by scanning backwards.
 *
 * It has to be scanned for rather than read at a fixed offset because it ends
 * with a variable-length comment. 64KB back is the whole possible comment
 * space, so this cannot miss one that exists.
 */
function findEocd(view: DataView): number | null {
  const max = Math.min(view.byteLength, 0xffff + 22);
  for (let i = 22; i <= max; i++) {
    const at = view.byteLength - i;
    if (at < 0) break;
    if (view.getUint32(at, true) === EOCD_SIG) return at;
  }
  return null;
}

function readCentralDirectory(view: DataView, eocd: number): Entry[] {
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const out: Entry[] = [];
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (at + 46 > view.byteLength || view.getUint32(at, true) !== CENTRAL_SIG) break;
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + at + 46, nameLen));
    out.push({ name, method, compressedSize, offset });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  // `deflate-raw`, not `deflate`: a zip entry carries the bare deflate stream
  // with no zlib header, and asking for the wrong one fails on byte one.
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Does this look like a zip rather than a CSV? Checked by content, not name. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  // "PK\x03\x04". A file picker on a phone reports all sorts of types for the
  // same file, and the first four bytes never lie.
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Pull one text file out of a zip, chosen by `want`.
 *
 * Returns null for anything it cannot read, rather than throwing — every caller
 * has the same fallback ("pick the csv instead") and a stack trace helps none of
 * them.
 *
 * `want` receives lowercased names WITHOUT their folder, because a Letterboxd
 * export nests everything one directory deep and nobody typing "ratings.csv"
 * means "at the root".
 */
export async function readFromZip(
  buffer: ArrayBuffer,
  want: (basename: string) => boolean,
): Promise<string | null> {
  try {
    const view = new DataView(buffer);
    const eocd = findEocd(view);
    if (eocd === null) return null;

    const entries = readCentralDirectory(view, eocd);
    const basename = (n: string) => n.slice(n.lastIndexOf("/") + 1).toLowerCase();
    const hit = entries.find((e) => want(basename(e.name)));
    if (!hit) return null;
    if (hit.method !== 0 && hit.method !== 8) return null;

    // The DATA starts after the local header, whose name and extra fields can
    // differ in length from the central directory's — so they are read again
    // here rather than reused. Sizes come from the central directory, which is
    // always populated; the local header's may be zero when a data descriptor
    // was used.
    const lh = hit.offset;
    if (lh + 30 > view.byteLength || view.getUint32(lh, true) !== LOCAL_SIG) return null;
    const nameLen = view.getUint16(lh + 26, true);
    const extraLen = view.getUint16(lh + 28, true);
    const start = lh + 30 + nameLen + extraLen;
    const raw = new Uint8Array(buffer, start, Math.min(hit.compressedSize, buffer.byteLength - start));

    const bytes = hit.method === 8 ? await inflate(raw) : raw;
    return new TextDecoder().decode(bytes);
  } catch {
    // Truncated, encrypted, zip64, or a compression method from 1994. The
    // caller falls back to asking for the csv.
    return null;
  }
}

/** The Letterboxd export's ratings file, wherever it sits in the archive. */
export const wantRatingsCsv = (basename: string): boolean => basename === "ratings.csv";
