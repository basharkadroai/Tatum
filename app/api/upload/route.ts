import { NextRequest, NextResponse } from 'next/server';
import { uploadToWalrus } from '@/lib/walrus';
import { summarize } from '@/lib/ai';

async function extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  // PDF
  if (mimeType === 'application/pdf' || ext === 'pdf') {
    console.log('[upload] parsing PDF...');
    const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js');
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }

  // DOCX
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    console.log('[upload] parsing DOCX...');
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // XLSX / XLS
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    ext === 'xlsx' || ext === 'xls'
  ) {
    console.log('[upload] parsing XLSX...');
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const lines: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      lines.push(`=== Sheet: ${sheetName} ===`);
      const sheet = workbook.Sheets[sheetName];
      lines.push(XLSX.utils.sheet_to_csv(sheet));
    }
    return lines.join('\n');
  }

  // HTML — strip tags
  if (mimeType === 'text/html' || ext === 'html' || ext === 'htm') {
    console.log('[upload] stripping HTML...');
    return buffer.toString('utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Try UTF-8 for everything else (txt, md, json, csv, code files, etc.)
  console.log(`[upload] treating as text (mime=${mimeType} ext=${ext})`);
  const text = buffer.toString('utf-8');
  // If it looks like binary (many non-printable chars), return empty
  const nonPrintable = (text.match(/[\x00-\x08\x0E-\x1F\x7F]/g) ?? []).length;
  if (nonPrintable / text.length > 0.1) {
    console.log('[upload] binary file detected, skipping text extraction');
    return '';
  }
  return text;
}

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

  // Extract text
  let content = '';
  try {
    content = await extractText(buffer, file.type, file.name);
    console.log(`[upload] extracted ${content.length} chars`);
  } catch (err) {
    console.error('[upload] text extraction failed:', err);
    content = '';
  }

  // Upload to Walrus
  let blobId: string;
  try {
    console.log('[upload] uploading to Walrus...');
    blobId = await uploadToWalrus(buffer);
    console.log(`[upload] Walrus blobId: ${blobId}`);
  } catch (err) {
    console.error('[upload] Walrus upload failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  // Summarize
  let summary = 'No text content could be extracted from this file.';
  if (content.trim()) {
    try {
      console.log('[upload] summarizing...');
      summary = await summarize(content);
      console.log(`[upload] summary done (${summary.length} chars)`);
    } catch (err) {
      console.error('[upload] summarize failed:', err);
      summary = 'AI summary unavailable — check Groq API key.';
    }
  }

  console.log('[upload] done');
  return NextResponse.json({
    blobId,
    summary,
    content: content.slice(0, 12000),
  });
}
