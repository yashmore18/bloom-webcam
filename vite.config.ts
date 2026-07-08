import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true, // expose on the local network too (e.g. phone on same wifi)
    port: 5173,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    // three.js + MediaPipe are legitimately large single deps; the default
    // 500 kB warning is just noise here.
    chunkSizeWarningLimit: 2000,
  },
});
