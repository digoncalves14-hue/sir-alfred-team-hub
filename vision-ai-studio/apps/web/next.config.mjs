import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// variáveis do .env na raiz do monorepo (não sobrescreve as já definidas)
try {
  process.loadEnvFile(path.join(here, "../../.env"));
} catch {
  /* sem .env: usa apenas o ambiente */
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(here, "../.."),
  transpilePackages: ["@vision/core", "@vision/db", "@vision/server"],
  serverExternalPackages: ["pg", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner", "@anthropic-ai/sdk"],
  poweredByHeader: false,
  experimental: {
    // uploads locais passam pela rota /api/storage/upload em streaming
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
