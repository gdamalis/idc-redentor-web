import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Import Next.js ESLint configs (they are CommonJS modules)
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
const nextTypescript = require("eslint-config-next/typescript");

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "scripts/**/*.js",
      "src/**/__generated",
      ".next/**",
      "node_modules/**",
      ".claude/**",
      "coverage/**",
    ],
  },
  {
    // Allow require() in JavaScript config files
    files: ["**/*.js", "**/*.mjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // TypeScript-specific rule adjustments
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn", // Warn instead of error for gradual improvement
    },
  },
];

export default eslintConfig;
