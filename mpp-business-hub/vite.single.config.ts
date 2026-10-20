import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds ONE self-contained HTML file (all JS + CSS inlined) for easy sharing/preview.
export default defineConfig({ plugins: [react(), viteSingleFile()], build: { outDir: 'dist-single', emptyOutDir: true } });
