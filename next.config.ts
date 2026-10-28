import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Everything a page loads comes from this server, so the content policy allows only this origin. Next.js needs
 * inline scripts to start the page (and eval in development); the map draws in a worker it starts from a blob.
 */
const policy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Act, brand and place pictures come from Qloo's image host. This server fetches and resizes them, so visitors'
  // browsers load them from here (the content policy stays same-origin) and Qloo never sees who's looking.
  images: { remotePatterns: [{ protocol: "https", hostname: "images.qloo.com", pathname: "/**" }] },
  // The map's tiles, fonts and icons come from OpenFreeMap through this server, for the same reason.
  async rewrites() {
    return [{ source: "/map-tiles/:path*", destination: "https://tiles.openfreemap.org/:path*" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: policy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // Ignored over plain HTTP (local development); enforces HTTPS once deployed.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
