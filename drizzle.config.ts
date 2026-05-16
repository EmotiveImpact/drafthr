import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't auto-load .env.local — invoke via `npx dotenv -e
// .env.local -- npx drizzle-kit <cmd>` (or pass DATABASE_URL_UNPOOLED inline).
// We read the UNPOOLED url because migrations need direct session features
// (DDL, advisory locks) that the PgBouncer pooler doesn't expose.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
