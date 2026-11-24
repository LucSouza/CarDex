import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// CSP: o Next injeta scripts inline (hidratação) e o tema é definido por um <script> inline no <head>.
// Sem nonce por requisição, 'unsafe-inline' em script-src é o que o Next exige; o resto fica fechado.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://assets.tcgdex.net",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // PGlite (banco local de desenvolvimento) usa WASM e não deve ser empacotado.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  images: {
    // lista FECHADA: nenhuma URL de imagem vem do usuário
    remotePatterns: [{ protocol: "https", hostname: "assets.tcgdex.net", pathname: "/**" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
