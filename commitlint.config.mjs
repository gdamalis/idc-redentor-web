// Conventional Commits, aligned with .releaserc.json release rules and the PR-title CI check.
// Scope is the ticket key (e.g. ICR-45) or a free-form area — uppercase allowed, so scope-case
// is disabled.
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-case": [0],
    "header-max-length": [2, "always", 100],
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "perf", "docs", "chore", "refactor", "style", "test", "build", "ci", "revert"],
    ],
  },
};

export default config;
