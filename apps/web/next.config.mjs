/** @type {import('next').NextConfig} */
const nextConfig = {
  // Each school gets its own subdomain: greensprings.examify.ng
  // In production, wildcard DNS routes all subdomains here.
  // We read the subdomain from the Host header server-side.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Prevents loading the exam in an iframe (anti-cheat)
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ]
  },
}

export default nextConfig
