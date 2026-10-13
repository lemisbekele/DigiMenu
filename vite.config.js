import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  server: { watch: { ignored: ["**/artifacts/**", "**/supabase/**"] } },
  plugins: [
    react(),
  ],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("browser-image-compression")) return "image-compression"
          if (id.includes("@supabase/")) return "supabase"
          if (id.includes("node_modules")) return "vendor"
          return undefined
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    testTimeout: 10000,
  },
})
