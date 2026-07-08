import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true, // expose on the local network too (e.g. phone on same wifi)
    port: 5173,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
