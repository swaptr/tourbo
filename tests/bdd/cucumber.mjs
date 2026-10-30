// Cucumber config for the BDD acceptance suite. Step and support files are TypeScript, loaded
// by Node's built-in type stripping (no build step, no loader). See tests/bdd/README.md.
export default {
  paths: ["tests/bdd/features/**/*.feature"],
  import: ["tests/bdd/support/world.ts", "tests/bdd/steps/**/*.ts"],
  format: ["progress", "summary", "html:/tmp/tourbo-bdd-report.html"],
  strict: false, // @pending scenarios report as pending, not as failures
  failFast: false,
};
