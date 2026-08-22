import { describe, expect, it } from "vitest";

import { foldForMatching, handleIsClean, textIsClean } from "@/lib/profanity";
import { validateHandle } from "@/lib/handles";

// A speed bump, not a solution. Guarded in BOTH directions, and the second
// matters more: a miss is expected and gets caught by reporting, while wrongly
// refusing somebody their own surname is a thing they experience personally.

describe("folding", () => {
  it("collapses the usual substitutions", () => {
    expect(foldForMatching("5h1t")).toBe("shit");
    expect(foldForMatching("f_u_c_k")).toBe("fuck");
    expect(foldForMatching("@ss")).toBe("ass");
    expect(foldForMatching("n1gg3r")).toBe("nigger");
    expect(foldForMatching("f4gg07")).toBe("faggot");
  });

  it("throws away separators and any digit it does not substitute", () => {
    // `9` imitates no letter well enough to be worth mapping, so it simply goes.
    expect(foldForMatching("sam_99")).toBe("sam");
  });
});

describe("hate codes", () => {
  // These have to be caught BEFORE folding. `foldForMatching` maps digits to
  // letters, so 1488 would become "iabb" and match nothing at all.
  it.each(["1488", "sam1488", "14_88_crew", "6mwe", "rahowa", "wpww", "combat18", "siegheil"])(
    "refuses %j",
    (handle) => {
      expect(handleIsClean(handle).clean).toBe(false);
    },
  );

  it("does NOT refuse a bare birth year", () => {
    // 88 is a birth year. Refusing every @sam88 to catch one person is the
    // wrong trade, and this is the single most likely false positive in the file.
    expect(handleIsClean("sam88").clean).toBe(true);
    expect(handleIsClean("dave1988").clean).toBe(true);
    expect(handleIsClean("born14").clean).toBe(true);
  });
});

describe("slurs and hate, refused anywhere in a name", () => {
  it.each([
    "fuckface", "sh1thead", "xxcuntxx",
    "n1gg3r", "xxniggaxx", "f_a_g_g_o_t", "phaggot",
    "kikelover", "chinkyeyes", "pajeet99", "wetbackxx",
    "ragheadxx", "gyppolife", "redskinxx",
    "trannyhater", "troonxx", "shemalexx",
    "retardxx", "mongoloidxx", "spasticxx",
    "hitler1", "neonazixx", "kukluxxx", "racewarnow",
    "killyourself", "drinkbleach",
    "pedobear", "cheesepizza", "childrape", "nonceman",
    "goatse99", "lemonparty",
  ])("refuses %j", (handle) => {
    expect(handleIsClean(handle).clean).toBe(false);
  });

  it("refuses through the front door too", () => {
    // The gate and the API both go through `validateHandle`, so the check has
    // to be reachable from there and not only from this module.
    expect(validateHandle("fuckface").ok).toBe(false);
    expect(validateHandle("n1gg3r").ok).toBe(false);
  });

  it("never repeats the word back, and never says which fragment matched", () => {
    // It would echo a slur at somebody who typed an innocent word, and it would
    // turn the field into an oracle you can tune against.
    const result = handleIsClean("n1gg3r");
    expect(result.clean).toBe(false);
    if (!result.clean) {
      expect(result.reason.toLowerCase()).not.toContain("nig");
      expect(result.reason).toBe("Pick a different name.");
    }
  });
});

describe("short slurs, refused only as a whole name", () => {
  it.each(["abo", "coon", "wog", "jap", "nip", "gook", "spic", "dago", "kys", "hh", "aryan"])(
    "refuses %j on its own",
    (handle) => {
      expect(handleIsClean(handle).clean).toBe(false);
    },
  );

  it("does not refuse the ordinary words they hide inside", () => {
    // The whole reason this tier exists. Substring-matching these would refuse
    // far more innocent people than guilty ones.
    for (const ok of ["about", "sabotage", "collaborate", "laboratory", "manipulate", "turnip", "japan", "raccoon", "tycoon", "gobbledygook"]) {
      expect(handleIsClean(ok), ok).toEqual({ clean: true });
    }
  });
});

describe("names that must NOT be refused", () => {
  // The false-positive list. Every one is a real name, place or word somebody
  // could reasonably want, and each contains a fragment from the lists above.
  it.each([
    "scunthorpe", "penistone", "sussex", "cockermouth",
    "hitchcock", "cockburn", "peacock", "hancock", "woodcock",
    "vandyke", "dykstra", "dickens", "dickinson", "cassavetes",
    "assassin", "analyst", "analogue", "class_act", "bassline", "chassis",
    "cucumber", "cumberland", "vacuum",
    "shoe", "phoenix", "title_card", "constitution",
    "therapist", "grapefruit", "skillet", "torpedo", "shiitake",
    "spooky", "spookyfilms", "homer", "homework", "mickey", "limerick",
    "sexton", "unisex", "japanese",
    "jarrad", "jarrad_b", "michaelmann", "sam88",
  ])("allows %j", (handle) => {
    expect(handleIsClean(handle), handle).toEqual({ clean: true });
  });

  it("allows an ordinary name end to end", () => {
    expect(validateHandle("jarrad_b")).toEqual({ ok: true, handle: "jarrad_b" });
  });
});

describe("the names THIS app's users will actually reach for", () => {
  // Rankd is full of directors and actors, so a filter that refuses somebody
  // their favourite film-maker's name is not a theoretical bug. Swept as a batch
  // so adding a fragment to any list gets caught here rather than by a user.
  const filmPeople = [
    "hitchcock", "kubrick", "scorsese", "tarantino", "coppola", "spielberg",
    "cassavetes", "kurosawa", "bergman", "fellini", "truffaut", "godard",
    "antonioni", "herzog", "lynch", "fincher", "nolan", "villeneuve",
    "aronofsky", "malick", "michaelmann", "refn", "gerwig", "bigelow",
    "campion", "varda", "akerman", "ozu", "mizoguchi", "kiarostami",
    "almodovar", "cuaron", "deltoro", "bongjoonho", "parkchanwook",
    "wongkarwai", "koreeda", "miyazaki", "takahata", "vandyke", "cusack",
    "cumberbatch", "cassel", "cage", "hanks", "bale", "dickinson",
    "peacock", "hancock", "woodcock", "cockburn", "babcock", "assante",
    "cassidy", "massey", "glasser", "grassle", "bassett", "pascal",
    "spacek", "sissyspacek", "titmuss", "homer", "mickey", "japanese",
  ];

  it.each(filmPeople)("allows %j", (name) => {
    expect(handleIsClean(name), name).toEqual({ clean: true });
  });

  it("allows every one of them, as a batch", () => {
    const refusedNames = filmPeople.filter((n) => !handleIsClean(n).clean);
    expect(refusedNames).toEqual([]);
  });
});

describe("the allowlist must never clear a slur", () => {
  it("refuses childrape even though 'drape' is on the innocent list", () => {
    // This was a real bug. `INNOCENT` ran first and cleared it, because `drape`
    // appears inside the word. An allowlist that can clear a slur is a
    // documented way through, so the hate list runs first now.
    expect(handleIsClean("childrape").clean).toBe(false);
  });

  it("still allows therapist, which is the one collision worth an exception", () => {
    expect(handleIsClean("therapist")).toEqual({ clean: true });
    expect(handleIsClean("filmtherapy")).toEqual({ clean: true });
  });
});

describe("free text", () => {
  it("allows words that merely CONTAIN a fragment", () => {
    // The difference between this and the handle check. A bio has spaces, so
    // the word boundaries are real and using them kills most false positives.
    expect(textIsClean("I analyse films and pass judgement on a class of them").clean).toBe(true);
    expect(textIsClean("Hitchcock, mostly. Some Cassavetes.").clean).toBe(true);
    expect(textIsClean("Spooky films about the laboratory").clean).toBe(true);
  });

  it("refuses a whole word", () => {
    expect(textIsClean("this app is shit").clean).toBe(false);
  });

  it("refuses a slur inside a word, because that is how they are smuggled", () => {
    expect(textIsClean("xxn1gg3rxx films").clean).toBe(false);
  });

  it("refuses a hate code in a bio", () => {
    expect(textIsClean("just a normal guy 1488").clean).toBe(false);
  });

  it("is fine with an empty bio", () => {
    expect(textIsClean("").clean).toBe(true);
  });
});
