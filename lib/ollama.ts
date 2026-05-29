const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

async function generate(prompt: string): Promise<string> {
  const url = `${BASE_URL}/api/generate`;
  console.log(`[ollama] POST ${url} model=${MODEL} prompt_length=${prompt.length}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, stream: false }),
  });

  console.log(`[ollama] response status: ${res.status}`);

  if (!res.ok) {
    const text = await res.text();
    console.error(`[ollama] error body: ${text}`);
    throw new Error(`Ollama error (${res.status}): ${text}`);
  }

  const data = await res.json();
  console.log(`[ollama] response received, length=${data.response?.length ?? 0} chars`);
  return data.response as string;
}

export async function summarize(content: string): Promise<string> {
  console.log('[ollama] summarize called');
  const prompt = `Summarize the following document in 3-5 clear sentences. Focus on the key points only:\n\n${content.slice(0, 4000)}`;
  return generate(prompt);
}

export async function askQuestion(content: string, question: string): Promise<string> {
  console.log(`[ollama] askQuestion called: "${question}"`);
  const prompt = `You are answering questions about a document. Answer concisely and accurately based only on the document content.\n\nDocument:\n${content.slice(0, 6000)}\n\nQuestion: ${question}\n\nAnswer:`;
  return generate(prompt);
}
