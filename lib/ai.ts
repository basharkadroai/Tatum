const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

async function generate(prompt: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content as string;
}

export async function summarize(content: string): Promise<string> {
  const prompt = `Summarize the following document in 3-5 clear sentences. Focus on the key points only:\n\n${content.slice(0, 4000)}`;
  return generate(prompt);
}

export async function askQuestion(content: string, question: string): Promise<string> {
  const prompt = `You are answering questions about a document. Answer concisely and accurately based only on the document content.\n\nDocument:\n${content.slice(0, 6000)}\n\nQuestion: ${question}\n\nAnswer:`;
  return generate(prompt);
}
