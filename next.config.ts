import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Requis pour l'image Docker (serveur standalone auto-suffisant).
  output: "standalone",
};

export default nextConfig;
