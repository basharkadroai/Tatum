const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

// ── BYOK: any OpenAI-compatible provider (chat only) ──
export type AiOverride = { provider?: string; model?: string; apiKey?: string };

const PROVIDERS: Record<string, { baseURL: string; defaultModel: string }> = {
  groq:      { baseURL: 'https://api.groq.com/openai/v1',                          defaultModel: GROQ_MODEL },
  openai:    { baseURL: 'https://api.openai.com/v1',                                defaultModel: 'gpt-5.5' },
  anthropic: { baseURL: 'https://api.anthropic.com/v1',                             defaultModel: 'claude-sonnet-4-6' },
  gemini:    { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',  defaultModel: 'gemini-3.5-flash' },
};

// Resolve which endpoint/key/model to use. If the user supplied their own key
// (BYOK), use that provider; otherwise fall back to our server-side Groq.
function resolveChat(ai?: AiOverride): { url: string; key: string; model: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ai?.apiKey && ai.provider && PROVIDERS[ai.provider] && ai.provider !== 'groq') {
    const p = PROVIDERS[ai.provider];
    if (ai.provider === 'anthropic') headers['anthropic-version'] = '2023-06-01';
    return { url: `${p.baseURL}/chat/completions`, key: ai.apiKey, model: ai.model?.trim() || p.defaultModel, headers };
  }
  // BYOK Groq key allowed too; else server key
  const key = ai?.provider === 'groq' && ai.apiKey ? ai.apiKey : GROQ_API_KEY;
  const model = ai?.provider === 'groq' && ai.model?.trim() ? ai.model.trim() : GROQ_MODEL;
  return { url: GROQ_URL, key, model, headers };
}

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

// Human-readable message per HTTP status from the provider.
function statusMessage(status: number, detail = ''): string {
  const d = detail.toLowerCase();
  if (status === 401 || status === 403) return 'Your API key was rejected — please check it and try again.';
  if (status === 400 || status === 404) return 'That model isn\'t available for this key — try another model.';
  if (status === 429) {
    if (d.includes('per day') || d.includes('daily') || d.includes('tpd') || d.includes('quota'))
      return 'The free default model hit its daily limit. Switch to your own API key (the model menu at the top of the prompt box), or try again later.';
    return 'Rate limited by the provider — wait a few seconds and retry.';
  }
  if (status >= 500) return 'The model is temporarily unavailable (provider overloaded) — please retry.';
  return `AI error (${status}). Please retry.`;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Streams a chat completion as a plain-text ReadableStream (token by token).
// Defaults to our Groq; if `ai` carries a BYOK key, streams from that provider.
// Retries transient errors (429 / 5xx) a couple of times before giving up.
export function streamGroq(messages: ChatMsg[], temperature = 0.5, ai?: AiOverride): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const { url, key, model } = resolveChat(ai);
  const headers = { ...resolveChat(ai).headers, Authorization: `Bearer ${key}` };
  // BYOK (the user's own key) gets a big cap so "thinking" models (Gemini 3.x,
  // GPT-5.x) don't truncate. The shared default key uses a modest cap so it
  // doesn't burn through its free daily token quota.
  const byok = !!(ai?.apiKey && ai.provider && ai.provider !== 'groq');
  const maxTokens = byok ? 8192 : 2048;
  const body = JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: true });
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let res: Response | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          res = await fetch(url, { method: 'POST', headers, body });
          if (res.ok && res.body) break;
          if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(attempt * 700); continue; }
          break;
        }
        if (!res || !res.ok || !res.body) {
          let detail = '';
          try { detail = (JSON.parse(await res!.text())?.error?.message) || ''; } catch { /* ignore */ }
          controller.enqueue(encoder.encode(statusMessage(res?.status ?? 0, detail)));
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

export function vaultSystemPrompt(docs: { filename: string; summary?: string; content?: string }[]): ChatMsg {
  // Every file contributes its summary (breadth); only retrieved files carry an
  // excerpt (depth). Files are headed by FILENAME (no numbers) so the model cites
  // the real filename — which the UI turns into a clickable pill.
  const context = docs
    .map(d => {
      const parts = [`### ${d.filename}`];
      if (d.summary) parts.push(`Summary: ${d.summary}`);
      if (d.content) parts.push(`Excerpt:\n${d.content.slice(0, 2500)}`);
      return parts.join('\n');
    })
    .join('\n\n');
  const example = docs[0]?.filename ?? 'example.txt';
  return {
    role: 'system',
    content: `You answer questions using the user's personal knowledge vault (the files below; each has a summary, and the most relevant ones include an excerpt). Use ONLY these files and synthesize across them.

CITATIONS — very important:
- When you reference a file, cite it inline using its EXACT filename in square brackets, e.g. [${example}].
- Put exactly ONE filename inside each pair of brackets — never group like [a.txt, b.txt]; write [a.txt] [b.txt] instead.
- NEVER write "FILE 1", "FILE 2" or any number — always the real filename.
- Include a SHORT direct quote when stating a fact from an excerpt.

Be concise; use **bold** and "- " bullets when listing. If the vault lacks the answer, say so.

${context.slice(0, 14000)}`,
  };
}

// Non-streaming compatibility helpers
export async function summarize(content: string): Promise<string> {
  return (await analyzeDocument(content)).summary;
}
