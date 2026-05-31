// BYOK (bring-your-own-key) config, stored locally in the browser. The key is
// only sent per-request to our chat routes and never persisted server-side.
export type AiConfig = { provider: string; model: string; apiKey: string };

const KEY = 'chainmind_ai';

export const AI_PROVIDERS = [
  { id: 'groq', label: 'ChainMind default', short: 'Default', model: 'llama-3.3-70b-versatile', needsKey: false },
  { id: 'openai', label: 'OpenAI', short: 'GPT', model: 'gpt-5.5', needsKey: true },
  { id: 'anthropic', label: 'Anthropic · Claude', short: 'Claude', model: 'claude-sonnet-4-6', needsKey: true },
  { id: 'gemini', label: 'Google · Gemini', short: 'Gemini', model: 'gemini-3.5-flash', needsKey: true },
] as const;

export function providerLabel(id?: string): string {
  return AI_PROVIDERS.find(p => p.id === id)?.label ?? 'ChainMind default';
}
export function providerShort(id?: string): string {
  return AI_PROVIDERS.find(p => p.id === id)?.short ?? 'Default';
}

export function loadAiConfig(): AiConfig | null {
  if (typeof window === 'undefined') return null;
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}

export function saveAiConfig(c: AiConfig | null) {
  if (typeof window === 'undefined') return;
  if (c && c.provider !== 'groq') localStorage.setItem(KEY, JSON.stringify(c));
  else localStorage.removeItem(KEY); // default = our Groq, nothing to store
}
