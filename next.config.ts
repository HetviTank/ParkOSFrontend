import type { NextConfig } from "next";
 
const nextConfig: NextConfig = {
  // Static export — the app is deployed as plain static files to a GCS bucket
  // (see cloudbuild.yaml), not run behind a Node server.
  output: "export",
  // GCS's website serving only auto-resolves "index.html" for a trailing-slash
  // request (e.g. /dashboard/) — without this, export emits flat dashboard.html
  // files that GCS can never reach via a clean /dashboard URL.
  trailingSlash: true,
};
 
export default nextConfig;
 