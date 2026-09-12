import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { defineConfig } from "prisma/config";

const globalEnvPath = resolve(process.cwd(), "../../.env");

if (existsSync(globalEnvPath)) {
  loadEnvFile(globalEnvPath);
}

const directUrl = process.env.DIRECT_URL?.trim();
const databaseUrl = directUrl || process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Add it to the repository root .env file or your deployment environment.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
