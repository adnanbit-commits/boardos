/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  images: {
    remotePatterns: [
      { protocol:'https', hostname:'**.amazonaws.com', pathname:'/**' },
      { protocol:'https', hostname:'**.cloudfront.net', pathname:'/**' },
    ],
  },

  async rewrites() {
    return [
      {
        source:      '/api/:path*',
        destination: `${process.env.API_INTERNAL_URL ?? 'http://backend:3001'}/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key:'X-Frame-Options',        value:'DENY' },
          { key:'X-Content-Type-Options', value:'nosniff' },
          { key:'Referrer-Policy',        value:'strict-origin-when-cross-origin' },
          { key:'Permissions-Policy',     value:'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  webpack(config) {
    config.resolve.fallback = { fs:false, net:false, tls:false };
    return config;
  },
};

module.exports = nextConfig;
