import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root
  }
};

export default nextConfig;
