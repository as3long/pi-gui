import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { readFileSync } from 'fs';
import { resolve } from 'path';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Read package.json for version
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version)
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 11420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 11421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  
  // Build optimizations
  build: {
    // Code splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Vue ecosystem
          'vue-vendor': ['vue', 'pinia'],
          // CodeMirror (large library)
          'codemirror': [
            'codemirror',
            '@codemirror/lang-javascript',
            '@codemirror/lang-python',
            '@codemirror/lang-html',
            '@codemirror/lang-css',
            '@codemirror/theme-one-dark',
            '@codemirror/view',
            '@codemirror/state',
            '@codemirror/language',
            '@codemirror/commands',
            '@codemirror/autocomplete',
            '@codemirror/search',
            '@codemirror/lint'
          ],
          // Markdown rendering
          'markdown': ['markdown-it', 'highlight.js']
        }
      }
    },
    // Chunk size warning limit
    chunkSizeWarningLimit: 1000
  }
}));
