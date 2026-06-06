'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type TocItem = { id: string; label: string };

const PAGES = [
  { key: 'docs', href: '/docs', label: 'Documentation' },
  { key: 'mcp', href: '/mcp-guide', label: 'MCP server' },
] as const;

// Mintlify-style docs chrome (what Anthropic/Claude docs use): sticky top bar,
// a left navigation rail, a wide content column, and a right "On this page" TOC
// with scroll-spy — the active section highlights as you scroll.
export function DocsShell({
  active, toc, children,
}: { active: 'docs' | 'mcp'; toc: TocItem[]; children: ReactNode }) {
  const [activeId, setActiveId] = useState(toc[0]?.id ?? '');

  // Scroll-spy: the active heading is the last one whose top has passed an
  // offset below the sticky header (and the last section once scrolled to the
  // bottom, so short trailing sections still highlight).
  useEffect(() => {
    const ids = toc.map(t => t.id);
    const recompute = () => {
      const offset = 100;
      let current = ids[0] ?? '';
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) current = id;
      }
      const se = document.scrollingElement ?? document.documentElement;
      if (se && se.scrollHeight - se.scrollTop - se.clientHeight < 8) {
        current = ids[ids.length - 1] ?? current;
      }
      setActiveId(current);
    };
    // Capture-phase scroll: scroll events don't bubble, but they DO fire during
    // capture — so this catches scrolling whether it's the window or any inner
    // scroll container. (A plain window 'scroll' listener misses inner scrollers.)
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    // IntersectionObserver backup — fires on section boundaries regardless of
    // which element scrolls.
    const els = ids.map(id => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const obs = new IntersectionObserver(recompute, { rootMargin: '-90px 0px -80% 0px', threshold: [0, 1] });
    els.forEach(el => obs.observe(el));
    recompute();
    return () => {
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
      obs.disconnect();
    };
  }, [toc]);

  const go = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
    history.replaceState(null, '', `#${id}`);
  };

  const idx = PAGES.findIndex(p => p.key === active);
  const prev = PAGES[idx - 1];
  const next = PAGES[idx + 1];

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
                  {toc.map(t => (
                    <a key={t.id} href={`#${t.id}`} onClick={e => go(e, t.id)} className={`docs-sub${activeId === t.id ? ' active' : ''}`}>{t.label}</a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </aside>

        <main className="docs-content">
          {children}
          {(prev || next) && (
            <div className="docs-pager">
              {prev ? <Link href={prev.href} className="docs-pager-link"><span>Previous</span>{prev.label}</Link> : <span />}
              {next ? <Link href={next.href} className="docs-pager-link next"><span>Next</span>{next.label}</Link> : <span />}
            </div>
          )}
        </main>

        <aside className="docs-toc">
          <p className="docs-toc-title">On this page</p>
          {toc.map(t => (
            <a key={t.id} href={`#${t.id}`} onClick={e => go(e, t.id)} className={`docs-toc-link${activeId === t.id ? ' active' : ''}`}>{t.label}</a>
          ))}
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
.docs-sub { padding: 4px 12px; font-size: 13px; color: var(--text-3); text-decoration: none; border-left: 2px solid transparent; margin-left: -1px; transition: color 0.15s, border-color 0.15s; }
.docs-sub:hover { color: var(--text-1); }
.docs-sub.active { color: #65ca9d; border-left-color: #65ca9d; font-weight: 600; }

.docs-content { min-width: 0; max-width: 760px; padding: 44px 0 110px; }
.docs-content section { scroll-margin-top: 80px; }
.docs-content h1 { scroll-margin-top: 80px; }

.docs-pager { display: flex; justify-content: space-between; gap: 16px; margin-top: 56px; padding-top: 26px; border-top: 1px solid var(--border); }
.docs-pager-link { display: flex; flex-direction: column; gap: 3px; padding: 14px 18px; border: 1px solid var(--border); border-radius: 12px; text-decoration: none; color: var(--text-1); font-weight: 700; font-size: 14px; min-width: 160px; }
.docs-pager-link.next { text-align: right; }
.docs-pager-link:hover { border-color: var(--border-2); background: var(--off-white); }
.docs-pager-link span { font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; }

.docs-toc { position: sticky; top: 58px; align-self: start; padding: 48px 0; display: flex; flex-direction: column; gap: 9px; }
.docs-toc-title { margin: 0 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-3); }
.docs-toc-link { font-size: 12.5px; color: var(--text-3); text-decoration: none; line-height: 1.4; border-left: 2px solid transparent; padding-left: 12px; margin-left: -14px; transition: color 0.15s, border-color 0.15s; }
.docs-toc-link:hover { color: var(--text-1); }
.docs-toc-link.active { color: #65ca9d; border-left-color: #65ca9d; font-weight: 600; }

@media (max-width: 1120px) { .docs-grid { grid-template-columns: 220px minmax(0, 1fr); } .docs-toc { display: none; } }
@media (max-width: 820px) { .docs-grid { grid-template-columns: 1fr; gap: 0; } .docs-side { display: none; } .docs-content { padding: 28px 0 80px; } }
`;
