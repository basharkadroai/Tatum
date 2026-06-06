import { tool } from 'langchain';
import { TavilySearch } from '@langchain/tavily';
import * as z from 'zod';

// Web search tool with a MINIMAL schema (query only).
//
// Why: the raw @langchain/tavily TavilySearch tool exposes optional array
// params (includeDomains / excludeDomains / etc.). Groq models (gpt-oss) emit
// `includeDomains: null` instead of omitting it, and Groq's strict tool-call
// validator rejects that with:
//   400 "parameters for tool tavily_search did not match schema:
//        /includeDomains: expected array, but got null"
// Exposing only `query` to the model removes those fields entirely, so the
// invalid null can't be produced. We call Tavily ourselves with a clean arg.
export function makeWebSearchTool() {
  const tavily = new TavilySearch({ maxResults: 5 });
  return tool(
    async ({ query }: { query: string }) => {
      const result = await tavily.invoke({ query });
      return typeof result === 'string' ? result : JSON.stringify(result);
    },
    {
      name: 'web_search',
      description:
        'Search the public web for current information — news, documentation, GitHub repos, prices. Returns the top results with titles, snippets, and URLs.',
      schema: z.object({ query: z.string().describe('The web search query') }),
    },
  );
}
