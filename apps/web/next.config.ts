import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import type { NextConfig } from "next";

const globalEnvPath = resolve(process.cwd(), "../../.env");

if (existsSync(globalEnvPath)) {
  loadEnvFile(globalEnvPath);
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
