import type { NextConfig } from 'next';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextPWA = require('next-pwa');

const isDevelopment = process.env.NODE_ENV === 'development';

const baseConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
};

const pwaConfig = {
  pwa: {
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-cache',
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
          },
        },
      },
      {
        urlPattern: /\/_next\/static/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-static-cache',
          expiration: {
            maxEntries: 60,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
        },
      },
      {
        urlPattern: /\/_next\/image/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'next-image-cache',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60, // 1 day
          },
        },
      },
      // NOTE: /api/chat is intentionally NOT cached — LLM responses must never be stale
    ],
  },
};

export default isDevelopment ? baseConfig : nextPWA({ ...baseConfig, ...pwaConfig } as any);