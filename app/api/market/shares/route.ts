import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    offerings: [],
    enabled: false,
    reason: 'Creator-share markets are parked until legal review and product policy are complete.',
  });
}
