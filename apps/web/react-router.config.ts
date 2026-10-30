import type { Config } from "@react-router/dev/config";

export default {
  // Server-side render by default; `/` is also prerendered at build (static HTML + .data from the
  // exported landing bundle) and served as a file by server.js, so landing visits cost no compute.
  ssr: true,
  prerender: ["/"],
} satisfies Config;
