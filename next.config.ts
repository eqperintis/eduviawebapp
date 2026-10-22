import type { NextConfig } from "next";

// Admin pages must never be framed; the form endpoint (/f/*) is only ever
// POSTed to or opened directly, so it gets the same treatment. Hostinger's
// CDN rewrites Content-Security-Policy (see SEKOOL's next.config.ts), so
// X-Frame-Options is the header actually in force.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
