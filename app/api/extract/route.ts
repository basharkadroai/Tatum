import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ content: '' });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  let content = '';

  try {
    if (file.type === 'application/pdf' || ext === 'pdf') {
      const pdfParse: (b: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js');
      content = (await pdfParse(buffer)).text;
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === 'docx'
    ) {
      const mammoth = require('mammoth');
      content = (await mammoth.extractRawText({ buffer })).value;
    } else if (
      ['xlsx', 'xls'].includes(ext) ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      const XLSX = require('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      content = wb.SheetNames.map((n: string) =>
        `=== ${n} ===\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`
      ).join('\n');
    }
  } catch (err) {
    console.error('[extract] failed:', err);
  }

  return NextResponse.json({ content });
}
