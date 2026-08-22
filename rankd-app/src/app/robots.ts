import type { MetadataRoute } from "next";

// ── Nothing is indexed yet, and that is a decision ─────────────────────────
//
// Public profiles are readable by anybody with the address. That is not the
// same as wanting them in a search engine, and the two get conflated by
// default because the default is to allow everything.
//
// Being listed is a thing a person should opt into. Somebody who makes their
// profile public so a friend can see their top ten has not asked to be the
// first result for their own name, and once Google has indexed a page,
// un-indexing it runs on Google's timetable rather than ours. Refusing now
// costs nothing and is fully reversible; allowing now is not.
//
// Revisit with a per-user setting, not with a blanket change here.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
