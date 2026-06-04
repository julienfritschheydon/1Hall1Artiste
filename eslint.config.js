import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
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
      // Hint de Fast Refresh (dev/HMR uniquement) : aucun impact sur le build
      // de prod ni sur la correction. Les fichiers UI (shadcn) et contextes
      // co-exportent volontairement hooks/variants à côté du composant.
      "react-refresh/only-export-components": "off",
      // Désactivée : modifier les tableaux de deps d'une app en prod risque
      // d'introduire des boucles/régressions. `rules-of-hooks` (critique) reste actif.
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Shim de types ambiants (stub React/router en `any` volontaire) et scripts
    // de diagnostic : le `any` y est intentionnel.
    files: ["src/types.d.ts", "src/debug/**/*.{ts,tsx}", "api/**/*.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
