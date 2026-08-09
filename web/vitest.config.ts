import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest ran with no config, so it resolved nothing: any module importing
 * `@/...` -- which is most of the app -- could not be unit-tested at all.
 * Mirroring the `paths` alias from tsconfig.json makes those modules testable.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
