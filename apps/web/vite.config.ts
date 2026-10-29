import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          input: "./server/app.ts",
        },
      },
    },
  },
  // Workspace packages ship TS source; bundle them instead of loading from node_modules at runtime.
  ssr: { noExternal: [/^@tourbo\//] },
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
});
