import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const getDeploymentVersion = () =>
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';

export async function GET() {
  return NextResponse.json(
    { version: getDeploymentVersion() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
