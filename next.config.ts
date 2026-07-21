import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  assetPrefix: "https://storage.googleapis.com/www.parkos.space",
};

export default nextConfig;
