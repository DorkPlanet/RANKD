import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Tests cover the pure modules only — the ranking maths, the matchmaker, the log,
// the score projection. None of them touch React, the DOM or the network, so this
// needs nothing beyond the `@/*` alias the app itself imports through.
//
// Components are deliberately not tested here. The duel screen's value is in how
// it looks and feels, which a jsdom assertion does not measure; it is verified in
// the live browser preview instead.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
