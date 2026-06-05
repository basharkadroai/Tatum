# ChainMind Agent Smoke Evals

Run the agent smoke harness with Node:

```bash
node scripts/run-agent-evals.mjs
```

By default the runner targets the production Vercel agent endpoint:

```bash
node scripts/run-agent-evals.mjs
```

To point at another deployed agent endpoint:

```bash
node scripts/run-agent-evals.mjs --url https://your-app.vercel.app/api/agent
```

For local development only, opt in explicitly:

```bash
node scripts/run-agent-evals.mjs --local
```

The contract case runs without AI keys. Agent answer cases require `GROQ_API_KEY` only when running locally; production endpoints use their own deployed environment. If a required local key is missing or still set to a placeholder, those cases are reported as `SKIP` instead of failing. The runner loads `.env.local` and `.env` if present, without printing secret values.

Useful options:

```bash
node scripts/run-agent-evals.mjs --case loaded-vault-keyword
node scripts/run-agent-evals.mjs --url https://chainmind-seven.vercel.app/api/agent
node scripts/run-agent-evals.mjs --port 3147
node scripts/run-agent-evals.mjs --timeout-ms 120000
```
