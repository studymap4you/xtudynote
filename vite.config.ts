import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  /** OAuth 승인된 JavaScript 원본과 맞춤 (Google Console: http://localhost:3000) */
  server: {
    port: 3000,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "unsafe-none",
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "unsafe-none",
    },
  },
});
