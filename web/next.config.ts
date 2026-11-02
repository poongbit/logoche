import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 11/2: 폰트는 메인 첫 칸에서 바로 만든다. 예전 새 폰트 만들기 주소는 메인으로 넘긴다(구글에서 돌아오던 ?continue=1도 그대로 따라간다).
  async redirects() {
    return [{ source: "/new", destination: "/", permanent: false }];
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
