import type { NextConfig } from "next";

// En-têtes de sécurité de toutes les réponses. La politique de contenu ne
// restreint pas les scripts (Next.js en injecte en ligne) : elle interdit
// l'affichage dans un cadre tiers, les plug-ins et l'envoi de formulaires
// vers un autre site.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // Pièces jointes : 4 Mo par fichier (Vercel plafonne les requêtes à 4,5 Mo).
      bodySizeLimit: "5mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
