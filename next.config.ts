import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();
const nextConfig: NextConfig = {
  /* config options here */
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
  rewrites: async () => {
    return [
      {
        source: "/:locale(\\w{2})",
        destination: "/:locale/coming-soon",
      },
      {
        source: "/:locale(\\w{2})/blog",
        destination: "/:locale/coming-soon",
      },
      {
        source: "/:locale(\\w{2})/blog/:slug",
        destination: "/:locale/coming-soon",
      },
      {
        source: "/:locale(\\w{2})/come-meet-us",
        destination: "/:locale/coming-soon",
      },
      {
        source: "/:locale(\\w{2})/community",
        destination: "/:locale/coming-soon",
      },
      {
        source: "/:locale(\\w{2})/who-is-jesus",
        destination: "/:locale/coming-soon",
      },
    ];
  },
};

export default withNextIntl(nextConfig);
