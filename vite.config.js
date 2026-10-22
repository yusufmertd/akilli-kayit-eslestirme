import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// legalComments: yayınlanan pakette hiçbir yorum satırı kalmaz
export default defineConfig({ plugins: [react()], esbuild: { legalComments: 'none' } });
