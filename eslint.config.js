import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";
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
      "unused-imports": unusedImports,
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
      // The codebase intentionally uses `any` at dynamic boundaries: command
      // arg/result bags (`Record<string, any>`), context prop bridges, and job
      // storage refs. Typing all of these is a large refactor deferred past
      // v0.0.1; `tsc --noEmit` (strict) remains the authoritative type gate, so
      // this advisory rule is disabled to keep `lint` clean.
      "@typescript-eslint/no-explicit-any": "off",
      // unused-imports owns unused detection: it can auto-remove dead imports
      // on --fix; the base rule is disabled to avoid duplicate reports.
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
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
