import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // undici/googleapis はNode専用実装を含むため、webpackでバンドルせずランタイムでrequireさせる
  // （adminClient.ts/calendarClient.ts での社内プロキシ対応に使用。バンドルすると node:console 等でビルドエラーになる）
  serverExternalPackages: ["undici", "googleapis"],
};

export default nextConfig;
