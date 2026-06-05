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
    },
    warnIfNoToolFrom: ['read_current_file'],
  },
];
