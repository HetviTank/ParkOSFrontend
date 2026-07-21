import type { NextConfig } from "next";

// TEMPORARY, for testing via https://storage.googleapis.com/www.parkos.space/...
// — that URL serves the bucket name as a path segment, so every asset/page
// path must include it too. This MUST be reverted to "" once the real custom
// domain (www.parkos.space, via DNS CNAME) is live, or that domain will look
// for assets under /www.parkos.space/www.parkos.space/... and 404.
const basePath = "/www.parkos.space";

const nextConfig: NextConfig = {
  // Static export — the app is deployed as plain static files to a GCS bucket
  // (see cloudbuild.yaml), not run behind a Node server.
  output: "export",
  // GCS's website serving only auto-resolves "index.html" for a trailing-slash
  // request (e.g. /dashboard/) — without this, export emits flat dashboard.html
  // files that GCS can never reach via a clean /dashboard URL.
  trailingSlash: true,
  basePath,
  env: {
    // Mirrors `basePath` above for the handful of call sites (src/lib/auth.ts)
    // that navigate via a raw `window.location.href` instead of next/link or
    // next/navigation, which resolve basePath automatically on their own.
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
