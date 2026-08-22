import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone Node scripts. They are CommonJS and run outside the bundler,
    // so the app's module rules do not apply to them: `require()` is how they
    // are meant to be written, not a lapse. Nothing here ships to a browser.
    "scripts/**",
  ]),
]);

export default eslintConfig;
