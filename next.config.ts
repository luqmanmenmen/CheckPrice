import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cegah browser (khususnya iOS Safari & PWA standalone) meng-cache HTML versi lama
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico|suko-logo.png|assets).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
