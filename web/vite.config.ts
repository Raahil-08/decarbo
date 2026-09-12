/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
