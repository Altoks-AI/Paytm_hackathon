import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-tenant and dynamic, so prerendering/cache components are off.
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
