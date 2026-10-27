import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/** Commit of this build: Vercel tells it; on Cloudflare Workers Builds (and other CI) it is read from the checkout. */
function buildVersion(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID;
  if (sha) return sha;
  if (process.env.WORKERS_CI || process.env.CI) {
    try {
      return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev";
    } catch {
      return "dev";
    }
  }
  return "dev";
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Native/WASM database drivers stay outside the server bundle.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  // Cloudflare build (OpenNext): pg loads its Workers socket driver only at runtime, so the file tracer must be told.
  outputFileTracingIncludes: {
    "**/*": ["./node_modules/pg-cloudflare/dist/**", "./node_modules/pg-cloudflare/esm/**"],
  },
  // the build's version, baked into both the server and the browser code: when they differ, the page is from an older
  // release and asks to be reloaded (src/client/update.tsx)
  env: { NEXT_PUBLIC_APP_VERSION: buildVersion() },
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
