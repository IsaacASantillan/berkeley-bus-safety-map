import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // For GitHub Pages: set VITE_BASE_PATH="/<repo-name>/"
  base: process.env.VITE_BASE_PATH ?? "/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE_URL || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
