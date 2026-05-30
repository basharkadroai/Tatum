const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

async function complete(messages: ChatMsg[], opts: { json?: boolean; temperature?: number } = {}): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: opts.temperature ?? 0.6,
      max_tokens: 1024,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Groq error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content as string;
}

// Streams a Groq chat completion as a plain-text ReadableStream (token by token).
export function streamGroq(messages: ChatMsg[], temperature = 0.5): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({ model: GROQ_MODEL, messages, temperature, max_tokens: 1024, stream: true }),
        });
        if (!res.ok || !res.body) {
          controller.enqueue(encoder.encode(`AI error (${res.status}). Please retry.`));
          controller.close();
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') { controller.close(); return; }
            try {
              const json = JSON.parse(payload);
              const token = json.choices?.[0]?.delta?.content;
              if (token) controller.enqueue(encoder.encode(token));
            } catch { /* partial JSON across chunks */ }
          }
        }
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`AI stream failed: ${String(err).slice(0, 80)}`));
        controller.close();
      }
    },
  });
}

// ── Upload-time analysis: summary + tags + suggested questions in ONE call ──
export interface DocAnalysis {
  summary: string;
  tags: string[];
  questions: string[];
}
export async function analyzeDocument(content: string): Promise<DocAnalysis> {
  const trimmed = content.slice(0, 6000);
  const fallback: DocAnalysis = {
    summary: 'No text content could be extracted from this file.',
    tags: [],
    questions: [],
  };
  if (!trimmed.trim()) return fallback;

  try {
    const raw = await complete(
      [
        {
          role: 'system',
          content:
            'You analyze a document and return STRICT JSON with keys: "summary" (3-5 information-dense sentences, no preamble), "tags" (3-5 short lowercase topic tags), "questions" (exactly 3 specific, insightful questions a reader would ask about THIS document). Return only the JSON object.',
        },
        { role: 'user', content: trimmed },
      ],
      { json: true, temperature: 0.4 },
    );
    const parsed = JSON.parse(raw);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map((t: unknown) => String(t)) : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions.slice(0, 3).map((q: unknown) => String(q)) : [],
    };
  } catch {
    // Fallback to a plain summary if JSON mode hiccups
    try {
      const summary = await complete([
        { role: 'system', content: 'Summarize the document in 3-5 clear sentences. No preamble.' },
        { role: 'user', content: trimmed },
      ]);
      return { summary, tags: [], questions: [] };
    } catch {
      return fallback;
    }
  }
}

// ── Vision: analyze an image with a Groq multimodal model ──
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
export async function analyzeImage(dataUrl: string): Promise<DocAnalysis> {
  const fallback: DocAnalysis = {
    summary: 'An image was uploaded; an AI description could not be generated.',
    tags: ['image'],
    questions: ['What is shown in this image?', 'Is there any text in this image?', 'What are the key details?'],
  };
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        temperature: 0.4,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this image and return STRICT JSON with keys: "summary" (5-8 sentences thoroughly describing the image, transcribing any visible text, and noting key details/context), "tags" (3-5 short lowercase topic tags), "questions" (exactly 3 specific questions someone would ask about THIS image). Return only the JSON object.',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content as string;
    const parsed = JSON.parse(raw);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map((t: unknown) => String(t)) : ['image'],
      questions: Array.isArray(parsed.questions) ? parsed.questions.slice(0, 3).map((q: unknown) => String(q)) : fallback.questions,
    };
  } catch {
    return fallback;
  }
}

// ── System prompts (document context lives here; history follows) ──
const CITE_RULE =
  'When you state a fact from the source, include a SHORT direct quote in double quotes to back it up. Be concise: lead with the answer, use **bold** for key terms and "- " bullets when listing. If the answer is not in the source, say so plainly — never invent.';

export function askSystemPrompt(content: string): ChatMsg {
  return {
    role: 'system',
    content: `You are a precise assistant answering questions about ONE document. Use only its content.\n${CITE_RULE}\n\nDocument:\n${content.slice(0, 7000)}`,
  };
}

export function vaultSystemPrompt(docs: { filename: string; content: string }[]): ChatMsg {
  const perDoc = Math.max(700, Math.floor(10000 / Math.max(docs.length, 1)));
  const context = docs
    .map((d, i) => `### FILE ${i + 1}: ${d.filename}\n${(d.content || '').slice(0, perDoc)}`)
    .join('\n\n');
  return {
    role: 'system',
    content: `You answer questions using the user's personal knowledge vault (multiple files below). Use ONLY these files and synthesize across them.\nCite the file inline as [filename], and include a SHORT direct quote when stating a fact.\nBe concise; use **bold** and "- " bullets when listing. If the vault lacks the answer, say so.\n\n${context.slice(0, 12000)}`,
  };
}

// Non-streaming compatibility helpers
export async function summarize(content: string): Promise<string> {
  return (await analyzeDocument(content)).summary;
}
