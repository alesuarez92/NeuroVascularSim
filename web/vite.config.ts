import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During development the API runs separately (`nvs serve`); proxy /api to it.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
