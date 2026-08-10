module.exports = {
  testEnvironment: "node",
  // Only our own colocated unit tests -- not node_modules or package spec files.
  testMatch: ["**/src/**/*.test.ts"],
  transform: {
    // isolatedModules: transpile-only (no cross-file type-checking), which
    // sidesteps this repo's known tsconfig lib.dom/lib.webworker duplicate
    // definition errors (see CLAUDE.md) while still running the tests.
    "^.+\\.ts$": ["ts-jest", { isolatedModules: true }],
  },
};
