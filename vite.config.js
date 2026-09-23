import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// Dev: serve a mesma Vercel Function de /api/link-preview no localhost.
const linkPreviewDevApi = {
  name: "link-preview-dev-api",
  configureServer(server) {
    server.middlewares.use("/api/link-preview", async (req, res) => {
      const { default: handler } = await server.ssrLoadModule("/api/link-preview.js");
      req.url = `/api/link-preview${req.url}`;
      handler(req, res);
    });
  },
};

export default defineConfig({
  plugins: [
    linkPreviewDevApi,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      includeAssets: ["favicon.svg", "icon.svg"],
      manifest: {
        name: "Flux Time",
        short_name: "Flux Time",
        description: "Pomodoro pessoal: cronometre estudo e pausas com estilo flip clock.",
        lang: "pt-BR",
        theme_color: "#101010",
        background_color: "#101010",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2,mp3}"],
        // Musica de fundo e longa/pesada -> streaming sob demanda, NUNCA
        // pre-cacheada no SW (senao baixaria ~85 MB na instalacao do PWA).
        globIgnores: ["**/sounds/music/**"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
