import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import uno from "unocss/vite";

export default defineConfig({
  plugins: [svelte(), uno()],
});
