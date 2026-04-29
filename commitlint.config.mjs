const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    "scope-enum": [
      2,
      "always",
      [
        "fsm",
        "ai",
        "db",
        "ui",
        "domain",
        "e2e",
        "ci",
        "deps",
        "docs",
        "config",
        // Granular scopes for the W19' concurrency rewrite — orchestrator
        // is the cross-layer file, proxy/actions/log are independent.
        "orchestrator",
        "proxy",
        "actions",
        "log",
      ],
    ],
    "scope-empty": [1, "never"],
    "header-max-length": [2, "always", 120],
    "subject-case": [2, "always", "lower-case"],
    "subject-full-stop": [2, "never", "."],
  },
};
export default config;
