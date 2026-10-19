import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the portal talks to the API through a proxy, so there is no CORS setup to do.
const api = process.env.VITE_API_URL || 'http://localhost:4000';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': api, '/uploads': api } },
});
