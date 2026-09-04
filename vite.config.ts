/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { defineConfig, type Plugin } from "vite";

// Identifiant de build unique, embarqué dans le bundle ET écrit dans
// dist/version.json — le front compare les deux à intervalles réguliers
// pour détecter qu'une page ouverte tourne sur une ancienne version.
const BUILD_ID = String(Date.now());

// Écrit version.json après la génération du bundle (pas de plugin tiers nécessaire).
function writeVersionFile(): Plugin {
  return {
    name: "write-version-file",
    closeBundle() {
      fs.writeFileSync(
        path.resolve(__dirname, "dist/version.json"),
        JSON.stringify({ buildId: BUILD_ID })
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Utiliser le chemin du dépôt du collectif en production et une base vide en développement
  // Vercel: serve from root "/". GitHub Pages legacy used "/1Hall1Artiste/".
  base: "/",
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  // Assurer que les chemins d'assets sont correctement générés
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: true,
    // Configuration du code splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Regrouper React et les dépendances liées dans un chunk
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Regrouper les composants UI dans un chunk séparé
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-tabs',
            '@radix-ui/react-select',
            '@radix-ui/react-toast',
            'lucide-react',
            'framer-motion',
          ],
        },
      },
    },
    // Réduire la taille des chunks générés
    chunkSizeWarningLimit: 600,
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 8082,
    strictPort: false,
    // Désactivation de HTTPS pour éviter les problèmes de certificat
  },

  plugins: [
    react(),
    writeVersionFile(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // .tsx inclus depuis l'ajout des tests de composants (React Testing Library).
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
  },
}));
