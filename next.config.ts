import type { NextConfig } from "next";

import { YARA_ROSA } from "./lib/products/yara-rosa-consolidation";
import { RENAMED_PRODUCT_SLUGS } from "./lib/products/renamed-slugs";

const nextConfig: NextConfig = {
  // Review 21/11: do not advertise the framework.
  poweredByHeader: false,
  // Review 21/11: no page (order receipt, payment report) may be framed by another site; no full URLs leak by referrer.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
  async redirects() {
    return [
      { source: `/producto/${YARA_ROSA.archivedSlug}`, destination: `/producto/${YARA_ROSA.canonicalSlug}`, permanent: true },
      // Slug corrections approved 11/11/2026; the stored slugs change at deploy time.
      ...Object.entries(RENAMED_PRODUCT_SLUGS).map(([from, to]) => ({ source: `/producto/${from}`, destination: `/producto/${to}`, permanent: true })),
    ];
  },
  allowedDevOrigins: [
    "192.168.56.1",
    "disposition-points-arena-everything.trycloudflare.com",
  ],

  serverExternalPackages: ["xlsx"],
  outputFileTracingIncludes: {
    "/admin/productos/importar": ["./lib/product-import/parser-worker.mjs", "./node_modules/xlsx/**/*"],
  },
  experimental: {
    serverActions: {
      // 3 MiB of files + bounded fields/multipart, below Vercel 4.5 MB.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
