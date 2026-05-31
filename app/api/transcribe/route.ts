import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Transcribes an audio/video file to text via Groq's Whisper endpoint, so the
// vault can summarize and answer questions about recordings. Groq accepts
// flac/mp3/mp4/mpeg/mpga/m4a/ogg/wav/webm (video works if it has an audio track).
export async function POST(req: NextRequest) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ content: '' });

  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ content: '' });

    const gform = new FormData();
    gform.append('file', file, file.name || 'audio');
    gform.append('model', 'whisper-large-v3-turbo');
    gform.append('response_format', 'text');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: gform,
    });

    if (!res.ok) {
      console.error('[transcribe] groq error', res.status, (await res.text()).slice(0, 200));
      return NextResponse.json({ content: '' });
    }
    const text = (await res.text()).trim();
    return NextResponse.json({ content: text });
  } catch (err) {
    console.error('[transcribe] failed:', err);
    return NextResponse.json({ content: '' });
  }
}
