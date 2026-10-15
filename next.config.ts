import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg', 'bcryptjs'],
  eslint: { ignoreDuringBuilds: true },
  experimental: { optimizePackageImports: ['@mantine/core', '@mantine/hooks', '@tabler/icons-react'] },
  poweredByHeader: false,
};

export default nextConfig;
