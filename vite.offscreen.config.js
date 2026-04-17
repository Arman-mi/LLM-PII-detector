import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-offscreen",
    emptyOutDir: true,
    target: "es2020",
    minify: false,
    rollupOptions: {
      input: resolve(__dirname, "src/offscreen.js"),
      output: {
        format: "es",
        entryFileNames: "offscreen.js"
      }
    }
  }
});