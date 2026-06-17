import { defineConfig } from "vite";

// host:true so phones on the LAN hotspot can reach the dev server later (P4).
export default defineConfig({
  server: { host: true, port: 5173 },
  clearScreen: false,
});
