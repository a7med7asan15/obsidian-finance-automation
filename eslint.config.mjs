import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

// Mirrors the checks the Obsidian community directory runs on a submission, so
// a review finding can be reproduced here before publishing another release.
export default tseslint.config(
  { ignores: ["main.js", "node_modules/**", "docs/**", "scripts/**", "tests/**", "*.mjs"] },
  ...tseslint.configs.recommendedTypeChecked,
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
);
