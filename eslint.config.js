import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "build",
      "supabase/functions/**",
      "supabase/.temp/**",
      "whapi-analysis/**",
      "worker-portal/**",
      "screenshots/**",
      "fixtures/**",
      "**/*.min.js",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Core do whatsapp-flow-architecture-v3 (Phase F Task 32):
  //
  // Os módulos do core (`_shared/flow-engine/**`, `_shared/channels/**`,
  // `_shared/captation/**`, `_shared/conversion/**`, `_shared/performance/**`,
  // `_shared/webhook-entry.ts`) NÃO devem usar `console.log` direto — devem
  // usar `_shared/logger.ts` (`log("kind", payload)`).
  //
  // Essa regra é enforced via convenção/code review, não via ESLint, porque
  // `supabase/functions/**` é ignorado pelo ESLint (são módulos Deno
  // typechecked via `deno check`, não via tsc do React).
  //
  // Convenção:
  //   - `console.warn` e `console.error` continuam permitidos.
  //   - `console.log` direto é proibido em arquivos do core.
  //   - Logger central serializa para console.log internamente — só ele faz.
);
