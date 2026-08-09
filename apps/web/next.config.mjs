/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@valtic/ui", "@valtic/types", "@valtic/validation"],
};

export default nextConfig;
