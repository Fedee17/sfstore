import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // El importador valida archivos de hasta 5 MB; multipart agrega overhead.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
