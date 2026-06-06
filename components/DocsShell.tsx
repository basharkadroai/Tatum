import Link from 'next/link';
import type { ReactNode } from 'react';

export type TocItem = { id: string; label: string };

const PAGES = [
  { key: 'docs', href: '/docs', label: 'Documentation' },
  { key: 'mcp', href: '/mcp-guide', label: 'MCP server' },
] as const;

// Mintlify-style docs chrome (what Anthropic/Claude docs use): sticky top bar,
// a left navigation rail, a wide content column, and a right "On this page" TOC.
export function DocsShell({
  active, toc, children,
}: { active: 'docs' | 'mcp'; toc: TocItem[]; children: ReactNode }) {
  return (
    <div className="docs-root">
      <style>{CSS}</style>

      <header className="docs-top">
        <div className="docs-top-inner">
          <Link href="/" className="docs-brand">ChainMind <span>docs</span></Link>
          <nav className="docs-tabs">
            {PAGES.map(p => (
              <Link key={p.key} href={p.href} className={`docs-tab${active === p.key ? ' active' : ''}`}>{p.label}</Link>
            ))}
            <Link href="/" className="docs-openapp">Open app ↗</Link>
          </nav>
        </div>
      </header>

      <div className="docs-grid">
        <aside className="docs-side">
          {PAGES.map(p => (
            <div key={p.key} className="docs-side-group">
              <Link href={p.href} className={`docs-side-link${active === p.key ? ' active' : ''}`}>{p.label}</Link>
              {active === p.key && (
                <div className="docs-side-sub">
                  {toc.map(t => <a key={t.id} href={`#${t.id}`} className="docs-sub">{t.label}</a>)}
                </div>
              )}
            </div>
          ))}
        </aside>

        <main className="docs-content">{children}</main>

        <aside className="docs-toc">
          <p className="docs-toc-title">On this page</p>
          {toc.map(t => <a key={t.id} href={`#${t.id}`} className="docs-toc-link">{t.label}</a>)}
        </aside>
      </div>
    </div>
  );
}

const CSS = `
.docs-root { min-height: 100dvh; background: var(--base); color: var(--text-1); }
.docs-top { position: sticky; top: 0; z-index: 20; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--sidebar-bg) 88%, transparent); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.docs-top-inner { max-width: 1320px; margin: 0 auto; padding: 0 28px; height: 58px; display: flex; align-items: center; gap: 32px; }
.docs-brand { font-weight: 800; font-size: 16px; letter-spacing: -0.01em; color: var(--text-1); text-decoration: none; }
.docs-brand span { color: var(--text-3); font-weight: 600; }
.docs-tabs { display: flex; align-items: center; gap: 22px; margin-left: auto; }
.docs-tab { font-size: 13.5px; font-weight: 600; color: var(--text-3); text-decoration: none; }
.docs-tab:hover { color: var(--text-1); }
.docs-tab.active { color: var(--text-1); }
.docs-openapp { font-size: 13px; font-weight: 700; color: #65ca9d; text-decoration: none; }

.docs-grid { max-width: 1320px; margin: 0 auto; padding: 0 28px; display: grid; grid-template-columns: 232px minmax(0, 1fr) 220px; gap: 48px; }

.docs-side { position: sticky; top: 58px; align-self: start; max-height: calc(100dvh - 58px); overflow-y: auto; padding: 30px 0; }
.docs-side-group { margin-bottom: 6px; }
.docs-side-link { display: block; padding: 6px 10px; border-radius: 7px; font-size: 13.5px; font-weight: 700; color: var(--text-2); text-decoration: none; }
.docs-side-link:hover { background: var(--hover); color: var(--text-1); }
.docs-side-link.active { color: var(--text-1); }
.docs-side-sub { display: flex; flex-direction: column; margin: 2px 0 8px; border-left: 1px solid var(--border); }
.docs-sub { padding: 4px 12px; font-size: 13px; color: var(--text-3); text-decoration: none; border-left: 2px solid transparent; margin-left: -1px; }
.docs-sub:hover { color: var(--text-1); border-left-color: var(--border-2); }

.docs-content { min-width: 0; max-width: 760px; padding: 44px 0 110px; }
.docs-content section { scroll-margin-top: 76px; }
.docs-content h1 { scroll-margin-top: 76px; }

.docs-toc { position: sticky; top: 58px; align-self: start; padding: 48px 0; display: flex; flex-direction: column; gap: 9px; }
.docs-toc-title { margin: 0 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-3); }
.docs-toc-link { font-size: 12.5px; color: var(--text-3); text-decoration: none; line-height: 1.4; }
.docs-toc-link:hover { color: var(--text-1); }

@media (max-width: 1120px) { .docs-grid { grid-template-columns: 220px minmax(0, 1fr); } .docs-toc { display: none; } }
@media (max-width: 820px) { .docs-grid { grid-template-columns: 1fr; gap: 0; } .docs-side { display: none; } .docs-content { padding: 28px 0 80px; } }
`;
