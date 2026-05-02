import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Use fileURLToPath instead of `URL.pathname` so spaces in the absolute path
// (e.g. "projects 2026") don't survive as %20 and break alias resolution.
const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": root,
    },
  },
});
