import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Load env file based on `mode` in the current working directory.
    // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
    const root = path.resolve('.');
    const env = loadEnv(mode, root, '');
    
    return {
      base: './', // Crucial for WebOS file-system loading
      server: {
        port: 3000,
        host: '0.0.0.0', // Expose to network for TV testing
      },
      plugins: [react()],
      define: {
        // injects the API key into the client code
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // fallback if you used specific name
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': root,
        }
      }
    };
});