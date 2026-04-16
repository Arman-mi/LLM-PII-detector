import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    minify: false,
    rollupOptions: {
      input: resolve(__dirname, "src/content.js"),
      output: {
        format: "iife",
        entryFileNames: "content.js",
        inlineDynamicImports: true
      }
    }
  }
});