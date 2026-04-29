import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const LOCAL_FALLBACK = "postgres://workfully:workfully@localhost:5432/workfully";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      process.env.STORAGE_DATABASE_URL ??
      process.env.POSTGRES_URL ??
      LOCAL_FALLBACK,
  },
  strict: true,
  verbose: true,
});
