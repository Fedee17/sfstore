import type { NextConfig } from "next";

import { YARA_ROSA } from "./lib/products/yara-rosa-consolidation";

const nextConfig: NextConfig = {
  async redirects() {
    return [{
      source: `/producto/${YARA_ROSA.archivedSlug}`,
      destination: `/producto/${YARA_ROSA.canonicalSlug}`,
      permanent: true,
    }];
  },
  allowedDevOrigins: [
    "192.168.56.1",
    "disposition-points-arena-everything.trycloudflare.com",
  ],

  experimental: {
    serverActions: {
      // El importador valida archivos de hasta 5 MB; multipart agrega overhead.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
