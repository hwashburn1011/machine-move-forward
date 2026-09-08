/**
 * Where the harnesses find the dev server.
 *
 * One place, and overridable, because a second checkout of this repo running
 * its own `npm run dev` answers on 5173 too — and a harness that hardcodes the
 * port silently measures the wrong worktree rather than failing. Set
 * `MMF_PORT` to point a run at your own server; `playwright.config.ts` reads
 * the same variable.
 */
export const PORT = Number(process.env.MMF_PORT ?? 5173);

export const BASE_URL = `http://localhost:${PORT}`;

/**
 * Force `nomenu=1` into a caller-supplied query string.
 *
 * The game boots to a title screen now. Every harness measures gameplay, and
 * every caller's query string was written before there was anything else to
 * boot into. Pass `nomenu=0` to opt back in deliberately.
 */
export function withNoMenu(query) {
  if (query.includes('nomenu=')) return query;
  if (!query || query === '?') return '?nomenu=1';
  return `${query}&nomenu=1`;
}
