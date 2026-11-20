import type { NextConfig } from "next";

/**
 * Security headers (defense in depth for keys kept in localStorage).
 * - script-src allows 'self' plus 'unsafe-inline' because Next.js streams inline bootstrap
 *   scripts; a nonce would force every page to render dynamically. No 'unsafe-eval' in
 *   production, no third-party script hosts.
 * - connect-src is limited to this origin and the X Layer RPC endpoints the wallet code uses,
 *   so an injected script could not send keys to an outside server with fetch/XHR.
 * - frame-ancestors 'none' (and X-Frame-Options: DENY) stop clickjacking.
 */
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  `connect-src 'self' https://rpc.xlayer.tech https://xlayerrpc.okx.com https://testrpc.xlayer.tech https://xlayertestrpc.okx.com${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/propose", destination: "/demo", permanent: true }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /* config options here */
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
