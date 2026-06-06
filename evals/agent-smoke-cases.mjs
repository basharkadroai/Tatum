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
];
