export type AgentTraceEvent =
  | { type: 'start'; at: string; questionPreview: string; owner?: string; currentFile?: string }
  | { type: 'tool_call'; at: string; tool: string; argsPreview: string }
  | { type: 'retry'; at: string; attempt: number; reason: string }
  | { type: 'answer'; at: string; chars: number; offeredStore: boolean }
  | { type: 'error'; at: string; message: string }
  | { type: 'finish'; at: string; durationMs: number };

export type AgentTraceSummary = {
  runId: string;
  startedAt: string;
  durationMs?: number;
  eventCount: number;
  tools: string[];
  ok: boolean;
};

function preview(value: unknown, max = 700) {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > max ? `${text.slice(0, max)}...` : text;
  } catch {
    return String(value).slice(0, max);
  }
}

export class AgentTraceRecorder {
  readonly runId = crypto.randomUUID();
  readonly startedAt = new Date().toISOString();
  private readonly t0 = Date.now();
  private readonly events: AgentTraceEvent[] = [];
  private ok = true;

  start(input: { question: string; owner?: string; currentFile?: string }) {
    this.record({
      type: 'start',
      at: new Date().toISOString(),
      questionPreview: preview(input.question, 300),
      owner: input.owner,
      currentFile: input.currentFile,
    });
  }

  toolCall(tool: string, args: unknown) {
    this.record({ type: 'tool_call', at: new Date().toISOString(), tool, argsPreview: preview(args) });
  }

  retry(attempt: number, reason: string) {
    this.record({ type: 'retry', at: new Date().toISOString(), attempt, reason: preview(reason, 240) });
  }

  answer(chars: number, offeredStore: boolean) {
    this.record({ type: 'answer', at: new Date().toISOString(), chars, offeredStore });
  }

  error(err: unknown) {
    this.ok = false;
    this.record({ type: 'error', at: new Date().toISOString(), message: preview(String(err), 500) });
  }

  finish() {
    this.record({ type: 'finish', at: new Date().toISOString(), durationMs: Date.now() - this.t0 });
    console.log('[agent-trace]', JSON.stringify({ summary: this.summary(), events: this.events }));
  }

  summary(): AgentTraceSummary {
    const finish = [...this.events].reverse().find(e => e.type === 'finish') as AgentTraceEvent | undefined;
    return {
      runId: this.runId,
      startedAt: this.startedAt,
      durationMs: finish?.type === 'finish' ? finish.durationMs : Date.now() - this.t0,
      eventCount: this.events.length,
      tools: Array.from(new Set(this.events.filter(e => e.type === 'tool_call').map(e => e.tool))),
      ok: this.ok,
    };
  }

  private record(event: AgentTraceEvent) {
    this.events.push(event);
  }
}
