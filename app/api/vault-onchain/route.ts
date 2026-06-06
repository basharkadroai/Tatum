import { NextRequest, NextResponse } from 'next/server';
import { listVaultEntries } from '@/lib/onchain';

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get('owner');
  if (!owner) return NextResponse.json({ entries: [] });
  try {
    return NextResponse.json({ entries: await listVaultEntries(owner) });
  } catch (err) {
    return NextResponse.json({ entries: [], error: String(err) });
  }
}
