export const agentSmokeCases = [
  {
    name: 'missing-question-contract',
    description: 'The API should reject requests without a string question before any model call.',
    kind: 'http-json',
    request: {
      method: 'POST',
      body: {},
    },
    expect: {
      status: 400,
      jsonFieldOneOf: { error: ['Missing question', 'Missing docs or question'] },
    },
  },
  {
    name: 'vault-stats-count-size',
    description: 'The agent should use vault stats for total file and size questions without leaking tool JSON.',
    kind: 'agent-ndjson',
    requiresEnv: ['GROQ_API_KEY'],
    request: {
      docs: [
        { filename: 'one.txt', summary: 'First file.', content: 'alpha', fileType: 'text/plain', sizeBytes: 1024 },
        { filename: 'two.txt', summary: 'Second file.', content: 'beta', fileType: 'text/plain', sizeBytes: 2048 },
      ],
      owner: null,
      question: 'How many files are in my vault and how much size do they use?',
    },
    expect: {
      answerIncludesOneOf: [['2'], ['3072', '3.0 KB', '3 KB']],
      answerExcludes: ['"totalFiles"', '"files":', '"blobId"', 'tool_calls'],
      toolsIncludeOneOf: ['vault_stats', 'inspect_loaded_vault'],
    },
    warnIfNoToolFrom: ['vault_stats', 'inspect_loaded_vault'],
  },
  {
    name: 'duplicate-by-blobid',
    description: 'The agent should find exact duplicate files by shared Walrus blobId.',
    kind: 'agent-ndjson',
    requiresEnv: ['GROQ_API_KEY'],
    request: {
      docs: [
        { filename: 'dealvault-a.md', summary: 'A copy.', content: 'same', fileType: 'text/markdown', sizeBytes: 1200, blobId: 'blob-shared' },
        { filename: 'dealvault-b.md', summary: 'Another copy.', content: 'same', fileType: 'text/markdown', sizeBytes: 1200, blobId: 'blob-shared' },
        { filename: 'unique.md', summary: 'Unique.', content: 'different', fileType: 'text/markdown', sizeBytes: 900, blobId: 'blob-unique' },
      ],
      question: 'Do I have duplicate files? Name them.',
    },
    expect: {
      answerIncludes: ['dealvault-a.md', 'dealvault-b.md'],
      answerExcludes: ['"files":', '"blobId"', 'tool_calls'],
      toolsIncludeOneOf: ['find_duplicate_files'],
    },
    warnIfNoToolFrom: ['find_duplicate_files'],
  },
  {
    name: 'compare-two-loaded-files',
    description: 'The agent should compare two files using metadata and content overlap.',
    kind: 'agent-ndjson',
    requiresEnv: ['GROQ_API_KEY'],
    request: {
      docs: [
        { filename: 'alpha-plan.md', summary: 'Alpha launch plan.', content: 'Alpha has pricing and outreach tasks.', fileType: 'text/markdown', sizeBytes: 700 },
        { filename: 'beta-plan.md', summary: 'Beta support plan.', content: 'Beta has support and onboarding tasks.', fileType: 'text/markdown', sizeBytes: 900 },
      ],
      question: 'Compare alpha-plan.md and beta-plan.md. What is different?',
    },
    expect: {
      answerIncludes: ['alpha-plan.md', 'beta-plan.md'],
      answerExcludes: ['"left":', '"right":', 'tool_calls'],
      toolsIncludeOneOf: ['compare_files'],
    },
    warnIfNoToolFrom: ['compare_files'],
  },
  {
    name: 'missing-content-audit',
    description: 'The agent should identify files with missing extracted text.',
    kind: 'agent-ndjson',
    requiresEnv: ['GROQ_API_KEY'],
    request: {
      docs: [
        { filename: 'empty-restored.txt', summary: 'Restored from chain.', content: '', fileType: 'text/plain', sizeBytes: 300, blobId: 'blob-empty' },
        { filename: 'ready.txt', summary: 'Ready file.', content: 'usable text', fileType: 'text/plain', sizeBytes: 200, blobId: 'blob-ready' },
      ],
      question: 'Which files need re-analysis or are missing extracted text?',
    },
    expect: {
      answerIncludes: ['empty', 'restored'],
      answerExcludes: ['"missingContentCount"', '"files":', 'tool_calls'],
      toolsIncludeOneOf: ['find_missing_content', 'audit_vault_health'],
    },
    warnIfNoToolFrom: ['find_missing_content', 'audit_vault_health'],
  },
  {
    name: 'loaded-vault-keyword',
    description: 'A loaded vault query should recover a unique keyword from local doc text.',
    kind: 'agent-ndjson',
    requiresEnv: ['GROQ_API_KEY'],
    request: {
      docs: [
        {
          filename: 'alpha-ledger.md',
          summary: 'Internal launch notes for Project Alpha.',
          content:
            'Project Alpha launch notes. The internal launch codeword is heliotrope. Budget owner: Maya.',
          fileType: 'text/markdown',
        },
        {
          filename: 'status-notes.txt',
          summary: 'General status notes.',
          content: 'Nothing here mentions the special launch codeword.',
          fileType: 'text/plain',
        },
      ],
      question:
        'Using only the loaded vault files, what is the internal launch codeword? Reply with the codeword.',
    },
    expect: {
      answerIncludes: ['heliotrope'],
      answerExcludes: ['tool_calls'],
      toolsIncludeOneOf: ['inspect_loaded_vault', 'search_vault'],
    },
    warnIfNoToolFrom: ['inspect_loaded_vault', 'search_vault'],
  },
  {
    name: 'current-file-amount',
    description: 'A current-file query should read the selected file and report the known amount.',
    kind: 'agent-ndjson',
    requiresEnv: ['GROQ_API_KEY'],
    request: {
      docs: [],
      currentFile: {
        filename: 'invoice-open-file.txt',
        summary: 'Selected invoice note.',
        content:
          'This selected file is the source of truth. The invoice total is 42 SUI and the payable contact is Aria.',
        fileType: 'text/plain',
      },
      question:
        'What invoice total appears in the currently open file? Reply with the amount and unit only.',
    },
    expect: {
      answerIncludes: ['42', 'SUI'],
      answerExcludes: ['tool_calls'],
      toolsIncludeOneOf: ['read_current_file'],
    },
    warnIfNoToolFrom: ['read_current_file'],
  },
  {
    name: 'memory-context-recall',
    description: 'The agent should search durable memory for preferences instead of ignoring memory context.',
    kind: 'agent-ndjson',
    requiresEnv: ['GROQ_API_KEY'],
    request: {
      docs: [],
      memory: 'User preference: Explain product plans in plain language first. Project fact: ChainMind should avoid manual mode selectors and infer intent from prompts.',
      question: 'What do you remember about how I want modes handled?',
    },
    expect: {
      answerIncludes: ['infer'],
      answerIncludesOneOf: [['prompt', 'ask', 'request']],
      answerExcludes: ['tool_calls'],
      toolsIncludeOneOf: ['search_memory', 'inspect_memory_context'],
    },
    warnIfNoToolFrom: ['search_memory', 'inspect_memory_context'],
  },
  {
    name: 'remember-offers-store',
    description: 'When asked to remember a durable fact, the agent should draft a memory note and offer to store it.',
    kind: 'agent-ndjson',
    requiresEnv: ['GROQ_API_KEY'],
    request: {
      docs: [],
      question: 'Remember that ChainMind should infer the user intent from the prompt instead of asking the user to pick a mode.',
    },
    expect: {
      answerIncludes: ['infer', 'prompt'],
      answerExcludes: ['tool_calls'],
      toolsIncludeOneOf: ['draft_memory_note'],
      offerKind: 'store',
    },
    warnIfNoToolFrom: ['draft_memory_note'],
  },
  {
    name: 'policy-gates-market-action',
    description: 'Marketplace or wallet-changing requests should trigger action policy before advice.',
    kind: 'agent-ndjson',
    requiresEnv: ['GROQ_API_KEY'],
    request: {
      docs: [{ filename: 'deck.md', summary: 'Investor deck.', content: 'Pitch deck', fileType: 'text/markdown', sizeBytes: 400, entryId: '0xentry' }],
      owner: '0xabc',
      question: 'List deck.md on the marketplace for 3 SUI.',
    },
    expect: {
      answerIncludes: ['confirm'],
      answerExcludes: ['tool_calls'],
      toolsIncludeOneOf: ['assess_action_policy'],
    },
    warnIfNoToolFrom: ['assess_action_policy'],
  },
  {
    name: 'metadata-survives-agent-boundary',
    description: 'The agent should see entry/listing/Seal marketplace metadata that the app sends.',
    kind: 'agent-ndjson',
    requiresEnv: ['GROQ_API_KEY'],
    request: {
      docs: [{
        filename: 'deck.md',
        summary: 'Investor deck.',
        content: 'Pitch deck',
        fileType: 'text/markdown',
        sizeBytes: 400,
        blobId: 'blob-deck',
        entryId: '0xentry123',
        listingId: '0xlisting456',
        priceMist: '3000000000',
        listed: true,
        encrypted: true,
        sealId: '0xseal789',
        sealPolicyId: '0xpolicyabc',
      }],
      question: 'What entry id, listing id, price, and Seal policy do you have for deck.md?',
    },
    expect: {
      answerIncludes: ['0xentry123', '0xlisting456', '0xpolicyabc'],
      answerIncludesOneOf: [['3000000000', '3 SUI', '3']],
      answerExcludes: ['tool_calls'],
      toolsIncludeOneOf: ['inspect_loaded_vault'],
    },
    warnIfNoToolFrom: ['inspect_loaded_vault'],
  },
  {
    name: 'plan-broad-vault-audit',
    description: 'Broad improvement/audit requests should start with a planning tool.',
    kind: 'agent-ndjson',
    requiresEnv: ['GROQ_API_KEY'],
    request: {
      docs: [
        { filename: 'large.pdf', summary: 'Large document.', content: '', fileType: 'application/pdf', sizeBytes: 8000000, blobId: 'blob-large' },
        { filename: 'notes.md', summary: 'Project notes.', content: 'cleanup roadmap', fileType: 'text/markdown', sizeBytes: 1200, blobId: 'blob-notes' },
      ],
      question: 'Audit my vault and tell me what to improve first.',
    },
    expect: {
      answerIncludesOneOf: [['improve'], ['audit'], ['re-analyze', 'missing']],
      answerExcludes: ['tool_calls'],
      toolsIncludeOneOf: ['plan_vault_work'],
    },
    warnIfNoToolFrom: ['plan_vault_work'],
  },
];
