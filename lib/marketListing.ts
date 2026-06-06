export function listingCategory(filename: string, fileType?: string): string {
  const name = filename.toLowerCase();
  const ext = name.split('.').pop() || '';
  const type = (fileType || '').toLowerCase();

  if (/\b(prompt|prompts|system|instruction|instructions|agent|skill|workflow|playbook)\b/.test(name)) return 'AI skill';
  if (/\b(dataset|data|csv|jsonl|records|corpus|benchmark)\b/.test(name) || ['csv', 'tsv', 'jsonl'].includes(ext)) return 'Dataset';
  if (/\b(template|checklist|sop|runbook|guide|manual)\b/.test(name)) return 'Template';
  if (type.startsWith('image/')) return 'Image';
  if (type.startsWith('video/') || type.startsWith('audio/')) return 'Media';
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'move', 'sol', 'rs', 'go', 'sh'].includes(ext)) return 'Code';
  if (['md', 'markdown', 'txt', 'pdf', 'docx'].includes(ext) || type.startsWith('text/')) return 'Knowledge';
  return 'Vault item';
}

export function listingTeaser(filename: string, fileType?: string, encrypted = false): string {
  const category = listingCategory(filename, fileType).toLowerCase();
  if (encrypted) {
    return `Seal-encrypted ${category}. Buy the vault entry to unlock access with the owner wallet.`;
  }
  if (category === 'ai skill') return 'Prompt, instruction, or agent workflow ready to use inside an AI tool.';
  if (category === 'dataset') return 'Structured data asset for analysis, training context, or AI retrieval.';
  if (category === 'template') return 'Reusable operational knowledge packaged as a wallet-owned file.';
  if (category === 'code') return 'Code artifact stored on Walrus and owned as a Sui vault entry.';
  return 'Knowledge asset stored on Walrus and owned as a Sui vault entry.';
}
