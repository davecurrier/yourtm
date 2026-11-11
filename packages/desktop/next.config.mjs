/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@yourtm/cli'],
  serverExternalPackages: [
    'esbuild', 
    'ts-morph', 
    'chokidar', 
    'prompts', 
    'ora', 
    'chalk', 
    'glob', 
    'playwright'
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;