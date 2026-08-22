// Words that cannot be somebody's public name.
//
// ── What this is, and what it is not ───────────────────────────────────────
//
// It is a speed bump. It stops the lazy and the obvious. It will not stop a
// determined person, because no list can: spelling is infinite, new slang
// arrives weekly, and the worst names are often ordinary words pointed at a
// specific person.
//
// The real defence is a report button and `user.suspended_at`, which is why both
// exist in the schema from the start. This exists so the first thing a stranger
// sees is not the failure of that defence to have run yet.
//
// Treat every miss as expected rather than as a bug. Treat a FALSE POSITIVE as
// the more serious failure: refusing somebody their own surname is a thing they
// experience personally. "Scunthorpe" is the canonical reminder, and this app is
// full of people called Hitchcock, Cockburn and Van Dyke.
//
// ── Why this file contains the words it contains ───────────────────────────
//
// A filter has to name what it filters. There is no way to write one that does
// not, and a euphemistic list would simply not work.
//
// ── THREE tiers, because there are three different failure modes ───────────
//
// ANYWHERE: long and unambiguous. Matched as a substring, accepting the rare
// false positive, because these have no innocent use and get smuggled inside
// longer names.
//
// EXACT: short, or a fragment of common English. `abo` lives inside "about",
// "sabotage" and "collaborate"; `nip` lives inside "manipulate" and "turnip";
// `jap` lives inside "japan". Substring-matching these would refuse more
// innocent people than guilty ones, so they are blocked only when they are the
// WHOLE name. Somebody determined can defeat this by adding a letter. That is
// the deliberate trade, and the report button is the backstop.
//
// CODES: numeric and alphanumeric hate signals. Checked BEFORE folding, because
// `foldForMatching` maps digits to letters and would turn 1488 into "iabb". Bare
// `88` and `14` are deliberately NOT here: 88 is a birth year, and refusing
// every @sam88 to catch one person is the wrong trade.

/**
 * Fold the tricks people use to smuggle a word past a list.
 *
 * Digits to the letters they imitate, everything else away. Deliberately NOT
 * reversible and never shown to anybody: this is a comparison key, not a name.
 * `s_h_1_t`, `sh1t` and `shit` all normalise to the same thing.
 */
export function foldForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/[@]/g, "a")
    .replace(/[$]/g, "s")
    .replace(/[!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/6/g, "g")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/[^a-z]/g, "");
}

/** Lowercase, separators gone, DIGITS KEPT. For the numeric codes below. */
function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Hate signals that survive as numbers, and the alphanumeric ones beside them.
 *
 * Long enough to be unambiguous. `1488` and `14words` are Nazi numerology,
 * `6mwe` is Holocaust denial, `c18`/`combat18` and `rahowa`/`wpww` are white
 * supremacist organisations and slogans, `109`/`110 countries` is the expulsion
 * meme, `1350` is the crime-statistic meme.
 */
const CODES: readonly string[] = [
  "1488", "8814", "14words", "fourteenwords", "88hh", "hh88", "heil88",
  "6mwe", "sixmwe", "14w88",
  "combat18", "c188", "blood andhonour", "bloodandhonour", "bloodhonour",
  "rahowa", "wpww", "siegheil", "heilhitler", "sieg88",
  // NOT "zog": three letters, and it lives inside Herzog and Mizoguchi. A film
  // app that refuses Werner Herzog his own name has the trade backwards. It is
  // on the EXACT list instead, so it is blocked only as a whole name.
  // NOT "109c" / "110c" either, for the same reason at a smaller scale.
  "109countries", "110countries",
  "1350", "13over50", "1352",
  "whitepower", "whitepride", "purityspiral",
  "atomwaffen", "totenkopf", "sonnenrad", "schutzstaffel",
];

/**
 * Matched ANYWHERE inside a name. Long and unambiguous.
 *
 * Kept as fragments so the obvious suffixes and plurals are covered without
 * listing every one: `nigg` catches the -er and -a forms together.
 */
const ANYWHERE: readonly string[] = [
  // Anti-black.
  "nigg", "nigr", "niqq", "knigger", "jigaboo", "porchmonkey", "tarbaby",
  "picaninny", "pickaninny", "sambo", "mandingo", "buckwheat", "groid",
  "dindu", "niglet", "cottonpicker", "negroid",
  // Anti-Asian.
  "chink", "chinky", "chingchong", "slanteye", "slopehead", "yellowperil",
  "zipperhead", "riceni", "gookk",
  // Anti-South-Asian.
  "pajeet", "currymuncher", "streetshitter", "dothead", "sandni",
  // Anti-Hispanic.
  "wetback", "beaner", "spicc", "greaser", "border hopper", "borderhopper",
  // Antisemitic.
  "kike", "heeb", "hymie", "shylock", "jewrat", "ovendodger", "gaschamber",
  "holohoax", "zionazi", "juden",
  // Anti-Muslim / anti-Arab.
  "raghead", "towelhead", "sandnigger", "cameljockey", "muzzie", "muzzrat",
  "goatfucker",
  // Anti-Roma / anti-traveller.
  "gyppo", "gypo", "pikey", "gippo",
  // Anti-Indigenous.
  "redskin", "injun", "prairienigger", "boongs", "coonass",
  // Homophobic and transphobic.
  "faggot", "fagget", "fggot", "phaggot", "batty boy", "battyboy",
  "poofter", "shirtlifter", "tranny", "trannie", "troon", "shemale",
  "ladyboy", "heshe", "attackhelicopter", "cocksucker",
  // Ableist.
  "retard", "retrd", "windowlicker", "mongoloid", "spastic", "sped kid",
  "cripple",
  // Other ethnic and national.
  "kaffir", "kafir", "kaffer", "paki", "paky", "gollywog", "golliwog",
  "halfbreed", "mudblood", "mudshark", "octoroon", "mulatto", "quadroon",
  // Extremism, terror, hate movements.
  "hitler", "adolfh", "nazi", "neonazi", "kkk", "kuklux", "klansman",
  "lynchem", "gasthe", "killall", "genocid", "isisis", "aryanb",
  "hailvictory", "whitesonly", "racewar",
  // Self-harm and violence directed at a person.
  "killyourself", "killurself", "neckyourself", "neckurself", "hangyourself",
  "drinkbleach", "shootupa", "schoolshoot",
  // Sexual abuse.
  "rapist", "raperape", "childrape", "molester", "paedo", "pedoph", "pedobear",
  "nonce", "cheesepizza", "childporn", "cp0rn", "jailbait", "lolicon",
  "bestiality", "zoophil", "necrophil", "incest",
  // Old-internet shock.
  "goatse", "tubgirl", "lemonparty", "meatspin", "bluewaffle", "twogirlsone",
  "hentaii",
];

/**
 * Blocked only when it is the WHOLE name.
 *
 * Every one of these is a fragment of ordinary English or of a real surname, so
 * substring-matching them would refuse more innocent people than guilty ones.
 * See the header. Adding a letter defeats this, on purpose.
 */
const EXACT: readonly string[] = [
  // Short slurs that live inside common words.
  "abo", "abos", "coon", "coons", "wog", "wogs", "jap", "japs", "nip", "nips",
  "gook", "gooks", "spic", "spics", "wop", "wops", "dago", "dagos",
  "kraut", "krauts", "mick", "micks", "yid", "yids", "gyp", "gyps",
  "spade", "spades", "spook", "spooks", "sambos", "coloured", "colored",
  "homo", "homos", "fag", "fags", "dyke", "dykes", "poof", "poofs",
  "tard", "tards", "spaz", "spazz", "spags", "gimp", "gimps", "mong", "mongs",
  "cracker", "honky", "honkey", "gringo", "ching", "chong",
  // Self-harm shorthand.
  "kys", "kms", "kysrn",
  // Nazi shorthand that is a word rather than a number.
  "hh", "ss", "sieg", "aryan", "aryans", "reich", "fuhrer", "furher", "zog",
  // Bare profanity as an entire name.
  "sex", "porn", "xxx", "anal", "anus", "cum", "jizz", "hoe", "hoes",
  "ass", "arse", "tit", "tits", "kill", "rape", "nazi",
];

/**
 * Matched anywhere, but guarded by `INNOCENT` below.
 *
 * These are long enough that a substring match is usually right, and common
 * enough that the exceptions have to be listed.
 */
const PROFANITY: readonly string[] = [
  "fuck", "fuk", "phuck", "shit", "sh1te", "cunt", "kunt", "bitch", "biatch",
  "bastard", "wanker", "wank", "piss", "twat", "prick", "bollock", "bellend",
  "arsehole", "asshole", "assface", "dickhead", "dickface", "cockhead",
  "penis", "vagina", "pussy", "titties", "boobies", "clitoris", "scrotum",
  "slut", "whore", "skank", "hooker", "prostitut", "milf", "gangbang",
  "blowjob", "handjob", "rimjob", "cumshot", "creampie", "bukkake",
  "masturbat", "ejaculat", "orgasm", "fellatio", "cunnilingus",
  "motherfuck", "shitface", "shithead", "dumbass", "jackass", "smartass",
  "douchebag", "scumbag", "twatwaffle", "fucktard", "shitstain",
];

/**
 * Ordinary words, places and names that CONTAIN a fragment above.
 *
 * Checked FIRST, and a name matching one of these is cleared outright. Not
 * exhaustive and never will be. Add to it whenever somebody is wrongly refused,
 * and treat each addition as a bug report rather than a favour.
 *
 * The film-shaped entries are load-bearing. This is an app full of directors and
 * actors, and `hitchcock`, `vandyke` and `cockburn` are exactly the names its
 * users reach for.
 */
const INNOCENT: readonly string[] = [
  // Place names. The classics.
  "scunthorpe", "penistone", "clitheroe", "lightwater", "cockermouth",
  "sussex", "essex", "middlesex", "wessex", "cockfosters", "shitterton",
  "assens", "assisi", "cassino", "nazareth", "nazare",
  // Film people. cock / dyke / dick.
  "hitchcock", "cockburn", "babcock", "peacock", "hancock", "woodcock",
  "shuttlecock", "stopcock", "weathercock", "cocktail", "cockney", "cockpit",
  "cockatoo", "cockroach", "vandyke", "dykstra", "dyketon",
  "dickens", "dickinson", "dickson", "benedick", "dickie", "moby",
  // ass / arse.
  "assassin", "assassination", "assess", "assessment", "asset", "assign",
  "assist", "assistant", "associate", "association", "assume", "assumption",
  "assure", "assembl", "assert", "assign", "class", "classic", "glass",
  "grass", "brass", "bass", "pass", "passion", "compass", "embassy", "mass",
  "massive", "cassette", "carcass", "canvass", "harass", "molasses",
  "potassium", "sassafras", "lass", "morass", "surpass", "bypass", "chassis",
  "cassidy", "cassavetes", "kassel",
  // anal / anus.
  "analyse", "analyze", "analysis", "analyst", "analytic", "analog", "analogue",
  "analogy", "banal", "canal", "manual", "annual", "januar",
  // cum.
  "cumberland", "cumbria", "cucumber", "circumstance", "document", "accumulate",
  "cumulative", "incumbent", "scum", "vacuum", "cumming", "cumulus",
  // abo (about, sabotage, collaborate, laboratory, taboo).
  "about", "above", "abort", "abound", "labor", "labour", "elaborate",
  "collaborate", "sabotage", "taboo", "abode", "aboriginal", "laboratory",
  // nip (manipulate, turnip, snippet).
  "manipulat", "turnip", "parsnip", "snippet", "snipe", "nippon", "nipper",
  "unipol", "omnipot", "omnipres",
  // jap (japan).
  "japan", "japanese",
  // coon (raccoon, cocoon, tycoon).
  "raccoon", "racoon", "cocoon", "tycoon", "lagoon", "saskatoon",
  // spook (spooky).
  "spooky", "spooked", "spookier",
  // gook (gobbledygook).
  "gobbledygook", "gobbledegook",
  // spade / spa.
  "spadework", "spaghetti", "spatial", "sparrow",
  // homo (homogeneous, homage, homer).
  "homogen", "homophone", "homograph", "homer", "homeric", "homestead",
  "homeland", "homework", "homage",
  // mick / mic.
  "mickey", "mccormick", "mickelson", "limerick", "microphone", "micro",
  // tit (title, constitution).
  "title", "titan", "titanic", "constitution", "institut", "competitor",
  "petition", "appetite", "attitude", "multitude", "gratitude", "titular",
  "titmus", "titchmarsh",
  // hoe / shoe.
  "shoe", "tahoe", "hoedown", "phoenix", "hoefler",
  // sex.
  "sexton", "unisex", "sextant", "sextet",
  // kill (skill, killarney).
  "skill", "skillet", "killarney", "mckillop", "killian", "killigrew",
  // rape (grape, therapist, drape).
  "grape", "drape", "scrape", "trapeze", "therapy", "therapist", "grapefruit",
  "parapet",
  // pedo (torpedo, tuxedo).
  "torpedo", "tuxedo", "speedo",
  // ss / hh / reich (Nazi shorthand as substrings of ordinary words).
  "reichert", "austria", "kassel", "hasselhoff",
  // Misc.
  "shitake", "shiitake", "bollocks_no", "cockle", "hancocks",
  "assange", "cassandra", "wassily", "wasserman",
];

/**
 * The only words allowed to override the ANYWHERE tier.
 *
 * ── Why this list is tiny, and why it exists at all ────────────────────────
 *
 * `INNOCENT` above is checked AFTER the hate list, and that ordering was a bug
 * fix rather than a preference. Checked first, it cleared `childrape`, because
 * `drape` is on it and appears inside the word. An allowlist that can clear a
 * slur is worse than no allowlist: it is a documented way through.
 *
 * So the hate list wins by default, and only these three words get to argue with
 * it. `rapist` genuinely lives inside `therapist`, which is a real profession and
 * a name people would use. That is the entire collision. Anything added here has
 * to be worth the hole it opens, so the bar is: an ordinary English word that
 * fully CONTAINS an ANYWHERE entry, with no way to spell it differently.
 */
const ALWAYS_OK: readonly string[] = ["therapist", "therapy", "therapeutic"];

export type CleanCheck = { clean: true } | { clean: false; reason: string };

/**
 * The sentence somebody is shown.
 *
 * ── Why it never names what was matched ────────────────────────────────────
 *
 * Two reasons, and the second is load-bearing. It would repeat a slur back at
 * somebody who may have typed an innocent word. And it would turn the field into
 * an oracle: type, read which fragment tripped it, adjust, repeat until
 * something gets through. A vague refusal is slower to defeat and kinder to the
 * person who did nothing wrong.
 */
const REFUSAL = "Pick a different name.";

const refused: CleanCheck = { clean: false, reason: REFUSAL };

/**
 * Is this handle usable in public?
 *
 * Substring matching for the ANYWHERE tier, because a handle has no spaces to
 * find word boundaries in: `xfuckx` has to be caught and there is no boundary
 * in it to catch.
 */
export function handleIsClean(handle: string): CleanCheck {
  const raw = compact(handle);
  // Codes first, on the DIGIT-PRESERVING string. Folding would destroy them.
  if (CODES.some((code) => raw.includes(code))) return refused;

  const folded = foldForMatching(handle);
  if (!folded) return { clean: true };

  // ── Order is load-bearing. Do not rearrange this ────────────────────────
  //
  // The hate list runs BEFORE the allowlist, and only `ALWAYS_OK` may overrule
  // it. Running `INNOCENT` first cleared `childrape`, because `drape` is on it.
  // An allowlist that can clear a slur is a documented way through.
  if (!ALWAYS_OK.some((ok) => folded.includes(ok))) {
    if (ANYWHERE.some((bad) => folded.includes(bad))) return refused;
  }

  // Past the unambiguous list, an ordinary word or surname is cleared before it
  // reaches the two tiers that genuinely produce false positives.
  if (INNOCENT.some((word) => folded.includes(word))) return { clean: true };

  if (EXACT.includes(folded)) return refused;
  if (PROFANITY.some((bad) => folded.includes(bad))) return refused;
  return { clean: true };
}

/**
 * Is this free text usable in public? For display names and bios.
 *
 * WORD-AWARE rather than substring, which is the difference between this and the
 * handle check. A bio has spaces, so the boundaries genuinely exist, and using
 * them removes almost every false positive: "I analyse films" passes on its own
 * merits rather than because `analyse` is on a list.
 *
 * The ANYWHERE tier is still matched inside a word, because that is how those
 * get smuggled.
 */
export function textIsClean(text: string): CleanCheck {
  if (CODES.some((code) => compact(text).includes(code))) return refused;

  for (const word of text.split(/\s+/)) {
    const folded = foldForMatching(word);
    if (!folded) continue;
    // Same ordering rule as `handleIsClean`, and for the same reason.
    if (!ALWAYS_OK.some((ok) => folded.includes(ok))) {
      if (ANYWHERE.some((bad) => folded.includes(bad))) return refused;
    }
    if (INNOCENT.some((ok) => folded.includes(ok))) continue;
    if (EXACT.includes(folded)) return refused;
    // Whole word only, so a bio may contain "class" and "assessment" without
    // this having to know they exist.
    if (PROFANITY.includes(folded)) return refused;
  }
  return { clean: true };
}
