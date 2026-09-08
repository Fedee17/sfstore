import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_PREVIEW_MODE: String(process.env.VERCEL_ENV === "preview"),
    ...(process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
      ? { NEXT_PUBLIC_SITE_URL: `https://${process.env.VERCEL_URL}` }
      : {}),
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
