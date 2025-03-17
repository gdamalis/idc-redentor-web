import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import headersConfig from "./config/headers";

const withNextIntl = createNextIntlPlugin();
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.ctfassets.net",
        port: "",
      },
      {
        protocol: "https",
        hostname: "images.eu.ctfassets.net",
        port: "",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
      },
    ],
  },
  headers: headersConfig,
};

export default withNextIntl(nextConfig);
