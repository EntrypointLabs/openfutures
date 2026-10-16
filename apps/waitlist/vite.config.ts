import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Reuse the site's brand assets at build time. dist is independently deployable.
  publicDir: fileURLToPath(new URL("../website/public", import.meta.url)),
  server: { port: 5175, strictPort: true },
  preview: { port: 4175, strictPort: true },
});
