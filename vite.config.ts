
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file from directory where vite.config.ts is located.
  // Fix: cast process as any to access cwd() which is available in Node.js environment where vite.config.ts runs
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Prioritize VITE_GEMINI_API_KEY, then fallback to API_KEY
  const apiKey = env.VITE_GEMINI_API_KEY || env.API_KEY || '';

  // Safety check for production builds
  if (!apiKey && mode === 'production') {
    console.error('\x1b[31m%s\x1b[0m', '─────────────────────────────────────────────────────────────────');
    console.error('\x1b[31m%s\x1b[0m', 'BUILD ERROR: VITE_GEMINI_API_KEY is missing from environment!');
    console.error('\x1b[31m%s\x1b[0m', 'Your production app will not be able to connect to Gemini.');
    console.error('\x1b[31m%s\x1b[0m', 'Ensure you use the --project="filament3dtracker" flag in gcloud.');
    console.error('\x1b[31m%s\x1b[0m', '─────────────────────────────────────────────────────────────────');
  }

  return {
    plugins: [react()],
    base: './', // Ensures relative paths for cPanel subfolders
    define: {
      // This maps the value found in your environment to the process.env.API_KEY
      // variable used by the @google/genai SDK in your code.
      'process.env.API_KEY': JSON.stringify(apiKey)
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    }
  };
});
