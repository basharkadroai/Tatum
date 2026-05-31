// BYOK config, stored locally in the browser. Each provider's model + key is
// remembered independently, so switching providers (and back) never loses a key.
// Keys are only sent per-request to our chat routes, never persisted server-side.
export type AiConfig = { provider: string; model: string; apiKey: string };
type Entry = { model: string; apiKey: string };
type Store = { active: string; keys: Record<string, Entry> };

const KEY = 'chainmind_ai';

export const AI_PROVIDERS = [
  { id: 'groq', label: 'ChainMind default', short: 'Default', model: 'llama-3.3-70b-versatile', models: ['llama-3.3-70b-versatile'], needsKey: false },
  { id: 'openai', label: 'OpenAI', short: 'GPT', model: 'gpt-5.5', models: ['gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.2', 'gpt-5-chat-latest'], needsKey: true },
  { id: 'anthropic', label: 'Anthropic · Claude', short: 'Claude', model: 'claude-sonnet-4-6', models: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-haiku-4-5'], needsKey: true },
  { id: 'gemini', label: 'Google · Gemini', short: 'Gemini', model: 'gemini-3.5-flash', models: ['gemini-3.5-flash', 'gemini-3.1-pro', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'], needsKey: true },
] as const;

export function providerLabel(id?: string): string {
  return AI_PROVIDERS.find(p => p.id === id)?.label ?? 'ChainMind default';
}
export function providerShort(id?: string): string {
  return AI_PROVIDERS.find(p => p.id === id)?.short ?? 'Default';
}

function loadStore(): Store {
  if (typeof window === 'undefined') return { active: 'groq', keys: {} };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    // migrate the old single-config shape { provider, model, apiKey }
    if (v && v.provider && v.apiKey && !v.keys) {
      return { active: v.provider, keys: { [v.provider]: { model: v.model, apiKey: v.apiKey } } };
    }
    return { active: v.active || 'groq', keys: v.keys || {} };
  } catch { return { active: 'groq', keys: {} }; }
}
function persist(s: Store) {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(s));
}

// The currently-active config (null = our default Groq).
export function loadAiConfig(): AiConfig | null {
  const s = loadStore();
  if (s.active === 'groq') return null;
  const e = s.keys[s.active];
  if (!e?.apiKey) return null;
  return { provider: s.active, model: e.model, apiKey: e.apiKey };
}

// A provider's previously-saved model + key (for prefilling the picker).
export function savedEntry(provider: string): Entry | null {
  return loadStore().keys[provider] ?? null;
}

// Switch back to the built-in default.
export function useDefault() {
  const s = loadStore();
  s.active = 'groq';
  persist(s);
}

// Save a provider's model + key and make it active.
export function setProvider(provider: string, model: string, apiKey: string) {
  const s = loadStore();
  s.keys[provider] = { model, apiKey };
  s.active = provider;
  persist(s);
}
