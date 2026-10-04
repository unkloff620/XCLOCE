import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Native/WASM database drivers stay outside the server bundle.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
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
