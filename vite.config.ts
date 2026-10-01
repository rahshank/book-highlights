import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "theme.js"],
      manifest: {
        name: "Book Highlights",
        short_name: "Highlights",
        description: "Track and review your book highlights and notes",
        theme_color: "#fff8e8",
        background_color: "#fff8e8",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
});
