const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

async function generate(prompt: string): Promise<string> {
  if (GROQ_API_KEY) {
    return generateGroq(prompt);
  }
  return generateOllama(prompt);
}

async function generateGroq(prompt: string): Promise<string> {
  console.log(`[groq] model=${GROQ_MODEL} prompt_length=${prompt.length}`);

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  console.log(`[groq] status=${res.status}`);
  if (!res.ok) {
    const text = await res.text();
    console.error(`[groq] error: ${text}`);
    throw new Error(`Groq error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const response = data.choices?.[0]?.message?.content as string;
  console.log(`[groq] response length=${response?.length ?? 0}`);
  return response;
}

async function generateOllama(prompt: string): Promise<string> {
  console.log(`[ollama] model=${OLLAMA_MODEL} prompt_length=${prompt.length}`);

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
  });

  console.log(`[ollama] status=${res.status}`);
  if (!res.ok) {
    const text = await res.text();
    console.error(`[ollama] error: ${text}`);
    throw new Error(`Ollama error (${res.status}): ${text}`);
  }

  const data = await res.json();
  console.log(`[ollama] response length=${data.response?.length ?? 0}`);
  return data.response as string;
}

export async function summarize(content: string): Promise<string> {
  console.log('[ai] summarize called');
  const prompt = `Summarize the following document in 3-5 clear sentences. Focus on the key points only:\n\n${content.slice(0, 4000)}`;
  return generate(prompt);
}

export async function askQuestion(content: string, question: string): Promise<string> {
  console.log(`[ai] askQuestion: "${question}"`);
  const prompt = `You are answering questions about a document. Answer concisely and accurately based only on the document content.\n\nDocument:\n${content.slice(0, 6000)}\n\nQuestion: ${question}\n\nAnswer:`;
  return generate(prompt);
}
