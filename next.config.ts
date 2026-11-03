import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Artefak mandiri: hanya file yang dibutuhkan, hemat inode di server (lihat docs/DEPLOYMENT.md)
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
