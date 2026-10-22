import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg', 'pg-copy-streams'],
  poweredByHeader: false,
};

export default nextConfig;
