/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
        // Intentionally omit `search` so Unsplash sizing params are allowed.
      },
    ],
  },
};

export default nextConfig;
