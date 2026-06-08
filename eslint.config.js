import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Build output, deps, and coverage are not linted.
    ignores: ["dist", "coverage", "node_modules", "dev-dist"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Discourage stray debug logging; the structured logging service
      // (src/services/logging) is the sanctioned path. console.warn/error
      // are tolerated for now to avoid a large immediate refactor.
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // The codebase intentionally uses `any` in a number of boundary spots;
      // surface them as warnings rather than hard errors for v0.0.1.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The logging service owns the console sink; allow it there.
    files: ["src/services/logging/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    // Tests and tooling scripts get a looser ruleset.
    files: [
      "src/test/**/*.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "*.config.{ts,js}",
      "scripts/**/*.{ts,js}",
    ],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
