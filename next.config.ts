import type { NextConfig } from 'next';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require('next-pwa');

const isDevelopment = process.env.NODE_ENV === 'development';

const sharedConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingIncludes: {
    '/api/*': ['./data/**/*'],
    '/*': ['./data/**/*'],
  },
};

const devConfig: NextConfig = {
  ...sharedConfig,
};

const prodConfig = {
  ...sharedConfig,
  turbopack: {},
  pwa: {
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: false,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-cache',
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 365 * 24 * 60 * 60,
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
            maxAgeSeconds: 30 * 24 * 60 * 60,
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
            maxAgeSeconds: 24 * 60 * 60,
          },
        },
      },
    ],
  },
};

export default isDevelopment ? devConfig : withPWA(prodConfig);
