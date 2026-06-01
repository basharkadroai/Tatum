import type { NextConfig } from "next";

const deploymentVersion =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_DEPLOYMENT_VERSION: deploymentVersion,
  },
};

export default nextConfig;
