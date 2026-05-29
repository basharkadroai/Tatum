import { NextRequest, NextResponse } from 'next/server';
import { uploadToWalrus } from '@/lib/walrus';
import { summarize } from '@/lib/ollama';

export async function POST(req: NextRequest) {
  console.log('[upload] request received');

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    console.error('[upload] no file in form data');
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  console.log(`[upload] file: "${file.name}" type=${file.type} size=${file.size}B`);

  const buffer = Buffer.from(await file.arrayBuffer());

  // --- Extract text ---
  let content = '';
  try {
    if (file.type === 'application/pdf') {
      console.log('[upload] parsing PDF...');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse');
      const parsed = await pdfParse(buffer);
      content = parsed.text;
      console.log(`[upload] PDF parsed, ${content.length} chars extracted`);
    } else {
      content = buffer.toString('utf-8');
      console.log(`[upload] text extracted, ${content.length} chars`);
    }
  } catch (err) {
    console.error('[upload] text extraction failed:', err);
    content = '';
  }

  // --- Upload to Walrus ---
  let blobId: string;
  try {
    console.log('[upload] uploading to Walrus...');
    blobId = await uploadToWalrus(buffer);
    console.log(`[upload] Walrus blobId: ${blobId}`);
  } catch (err) {
    console.error('[upload] Walrus upload failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  // --- Summarize with Ollama ---
  let summary = 'No text content could be extracted.';
  if (content.trim()) {
    try {
      console.log('[upload] sending to Ollama for summary...');
      summary = await summarize(content);
      console.log(`[upload] summary received (${summary.length} chars)`);
    } catch (err) {
      console.error('[upload] Ollama summarize failed:', err);
      summary = 'AI summary unavailable — Ollama not running or model not loaded.';
    }
  }

  console.log('[upload] done — returning response');
  return NextResponse.json({
    blobId,
    summary,
    content: content.slice(0, 12000),
  });
}
