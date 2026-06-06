export function cleanEnv(value?: string | null): string {
  return (value ?? '').trim().replace(/\\r|\\n/g, '');
}

export function envFlag(value?: string | null): boolean {
  return cleanEnv(value) === '1';
}
