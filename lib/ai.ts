const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function generate(prompt: string): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) throw new Error(`Groq error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content as string;
}

// Streams a Groq completion as a plain-text ReadableStream (token by token).
// The route returns this directly; the browser reads it incrementally.
export function streamGroq(prompt: string, temperature = 0.5): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_tokens: 1024,
            stream: true,
          }),
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
            } catch {
              // partial JSON across chunks — ignore, next read completes it
            }
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

export async function summarize(content: string): Promise<string> {
  const prompt = `Summarize the document below in 3-5 clear, information-dense sentences. Lead with what it is, then the key points. No preamble like "This document".\n\n${content.slice(0, 4000)}`;
  return generate(prompt);
}

export function buildAskPrompt(content: string, question: string): string {
  return `You are a precise assistant answering questions about ONE document. Use only its content.

Formatting rules:
- Be concise and direct. Lead with the answer.
- Use **bold** for key terms and short bullet lists ("- ") when listing.
- If the document doesn't contain the answer, say so plainly — don't invent.

Document:
${content.slice(0, 7000)}

Question: ${question}

Answer:`;
}

export function buildVaultPrompt(docs: { filename: string; content: string }[], question: string): string {
  const perDoc = Math.max(800, Math.floor(11000 / Math.max(docs.length, 1)));
  const context = docs
    .map((d, i) => `### FILE ${i + 1}: ${d.filename}\n${(d.content || '').slice(0, perDoc)}`)
    .join('\n\n');
  return `You are an assistant answering a question using the user's personal knowledge vault (multiple files below).

Rules:
- Use ONLY these files. Synthesize across them when relevant.
- Cite sources inline in square brackets like [${docs[0]?.filename ?? 'filename'}].
- Be concise. Use **bold** for key points and "- " bullets when listing.
- If the vault doesn't contain the answer, say so plainly.

${context.slice(0, 12000)}

Question: ${question}

Answer (with [filename] citations):`;
}

// Non-streaming variants kept for compatibility.
export async function askQuestion(content: string, question: string): Promise<string> {
  return generate(buildAskPrompt(content, question));
}
export async function askAcrossVault(docs: { filename: string; content: string }[], question: string): Promise<string> {
  return generate(buildVaultPrompt(docs, question));
}
