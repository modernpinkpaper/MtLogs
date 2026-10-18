import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

// PRIVATE build with Dalia's real tracker data baked in. Output goes to dist-real/ (gitignored). Never publish this publicly.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: { alias: [{ find: /^(\.{1,2}\/)+(server\/)?realLoader$/, replacement: path.resolve(__dirname, 'real-data/loader.ts') }] },
  build: { outDir: 'dist-real', emptyOutDir: true },
});
