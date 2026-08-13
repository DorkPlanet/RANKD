// Reads the Postgres connection string from the environment and fails fast with
// a clear message when it is missing. One code path serves local Docker and Neon
// in production — the only difference is the value of DATABASE_URL.
//
// Next.js loads .env.local automatically at runtime; standalone entry points
// (drizzle-kit) load it explicitly before importing this.

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local (the local " +
        "Docker Postgres values work as-is), or set DATABASE_URL to your Neon " +
        "connection string in production.",
    );
  }
  return url;
}
