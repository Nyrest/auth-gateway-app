import { defineConfig } from "drizzle-kit";

// Schema generation is offline. Runtime and migration commands still require DATABASE_URL
// (or the Worker Hyperdrive binding).
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/auth_gateway";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
