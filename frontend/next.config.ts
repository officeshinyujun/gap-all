import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  sassOptions: {
    additionalData: `@import "${path.join(process.cwd(), "styles/variables")}";`,
  },
};

export default nextConfig;
