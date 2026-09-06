import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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