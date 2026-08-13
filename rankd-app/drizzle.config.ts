// Drizzle Kit config: generates versioned SQL migrations into `drizzle/` from
// `src/lib/db/schema.ts`, and applies them with `drizzle-kit migrate`. Loads
// .env.local so DATABASE_URL is available outside the Next.js runtime.

import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

import { requireDatabaseUrl } from "./src/lib/db/env";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: requireDatabaseUrl() },
});
