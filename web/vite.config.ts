/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
