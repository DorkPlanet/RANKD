// The database client every route imports. Uses the standard postgres.js driver
// (not the Neon serverless driver) so one code path connects to local Docker and
// to Neon alike.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { requireDatabaseUrl } from "./env";
import * as schema from "./schema";

// A single connection instance per process; postgres.js manages its own pool.
// Next dev reloads modules on every edit, so the instance is stashed on
// `globalThis` — without it a long dev session opens a new pool per reload and
// eventually exhausts Postgres' connection limit.
const globalForDb = globalThis as unknown as { rankdDb?: ReturnType<typeof postgres> };
const client = globalForDb.rankdDb ?? postgres(requireDatabaseUrl());
if (process.env.NODE_ENV !== "production") globalForDb.rankdDb = client;

export const db = drizzle(client, { schema });

export { client };
export * from "./schema";
