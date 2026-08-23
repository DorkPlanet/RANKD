// Client components must not reach a module that imports the database.
//
// This has now bitten twice, both times at BUILD time with "Can't resolve 'fs'",
// which is a slow and confusing way to find out:
//
//   · `FindPeople` imported `MIN_QUERY` from `people.ts` — fixed by splitting
//     the constant into `searchRules.ts`.
//   · `FeedScreen` imported `COMMENT_MAX` from `activity.ts` — fixed by moving
//     the shapes into `feed.ts`, which imports no database.
//
// Types are erased by the compiler and cost nothing. A VALUE is a real import
// and drags the whole module graph, Postgres driver included, into the browser.
//
// Deliberately parsed with string operations rather than a regex. The first
// version of this test used one, a shell heredoc quietly ate its backslashes,
// and it passed against a file that HAD the bug in it. A guard that cannot fail
// is worse than no guard, so this one avoids escaping altogether.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

/** Modules that reach the database, directly or one hop away. */
const DB_BACKED = [
  "@/lib/db",
  "@/lib/social/activity",
  "@/lib/social/people",
  "@/lib/social/follow",
  "@/lib/social/publicProfile",
  "@/lib/social/threads",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith(".tsx") || path.endsWith(".ts") ? [path] : [];
  });
}

/**
 * The value names one file imports from one module, ignoring erased types.
 *
 * Statements are split on `;` so a multi-line import is one unit, which is how
 * they are actually written in this codebase.
 */
function valueImports(source: string, module: string): string[] {
  const out: string[] = [];
  for (const statement of source.split(";")) {
    const text = statement.trim();
    if (!text.startsWith("import ")) continue;
    // Both quote styles, so a formatter change cannot blind this.
    if (!text.includes('"' + module + '"') && !text.includes("'" + module + "'")) continue;

    const from = text.lastIndexOf(" from ");
    if (from < 0) continue;
    const clause = text.slice("import ".length, from).trim();

    // `import type { A, B } from` — the whole clause is erased.
    if (clause.startsWith("type ")) continue;

    for (const name of clause.replace(/[{}]/g, " ").split(",")) {
      const trimmed = name.trim();
      // `import { type A, b }` — only `b` survives compilation.
      if (trimmed && !trimmed.startsWith("type ")) out.push(trimmed);
    }
  }
  return out;
}

describe("the browser bundle", () => {
  const clientFiles = walk(SRC).filter((f) => readFileSync(f, "utf8").startsWith('"use client"'));

  it("has client components to check", () => {
    // A guard on the guard: if this ever finds nothing, the rule below would
    // pass by looking at an empty set rather than by holding.
    expect(clientFiles.length).toBeGreaterThan(5);
  });

  it("can tell a value import from an erased one", () => {
    // And a guard on the PARSER, because the first version of it silently
    // matched nothing at all.
    const mod = "@/lib/social/activity";
    expect(valueImports(`import { feedFor } from "${mod}";`, mod)).toEqual(["feedFor"]);
    expect(valueImports(`import type { FeedItem } from "${mod}";`, mod)).toEqual([]);
    expect(valueImports(`import { type FeedItem } from "${mod}";`, mod)).toEqual([]);
    expect(valueImports(`import { type A, b } from "${mod}";`, mod)).toEqual(["b"]);
    expect(valueImports(`import { x } from "@/lib/other";`, mod)).toEqual([]);
  });

  it("never imports a VALUE from a database-backed module", () => {
    const offences: string[] = [];
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      for (const backed of DB_BACKED) {
        const values = valueImports(source, backed);
        if (values.length > 0) {
          offences.push(`${file.replace(SRC, "src")} imports ${values.join(", ")} from ${backed}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});
