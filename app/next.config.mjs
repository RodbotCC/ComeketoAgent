/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow longer responses from /api/test when OpenAI takes a while
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
