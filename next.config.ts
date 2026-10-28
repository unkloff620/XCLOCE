import type { NextConfig } from "next";

/** Commit of this build (Render, Vercel); "dev" locally. */
function buildVersion(): string {
  return process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || "dev";
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Native/WASM database drivers stay outside the server bundle.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
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
