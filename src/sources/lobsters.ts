/**
 * Lobsters API client.
 * Docs: https://lobste.rs/about
 * Public JSON API — append .json to any page URL. No auth required.
 */

const BASE = "https://lobste.rs";

export interface LobstersStory {
  short_id: string;
  title: string;
  url: string;
  score: number;
  comment_count: number;
  created_at: string;
  description: string;
  submitter_user: { username: string };
  tags: string[];
  comments_url: string;
}

export interface LobstersComment {
  short_id: string;
  comment: string; // HTML
  score: number;
  created_at: string;
  commenting_user: { username: string };
  indent_level: number;
  replies?: LobstersComment[];
}

export interface LobstersUser {
  username: string;
  created_at: string;
  karma: number;
  about: string;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "devfeed-mcp/1.0 (https://github.com/upgpt-ai/devfeed-mcp)" },
  });
  if (!res.ok) throw new Error(`Lobsters API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getHottest(page = 1): Promise<LobstersStory[]> {
  return fetchJSON<LobstersStory[]>(`${BASE}/hottest.json?page=${page}`);
}

export async function getNewest(page = 1): Promise<LobstersStory[]> {
  return fetchJSON<LobstersStory[]>(`${BASE}/newest.json?page=${page}`);
}

export async function getStory(shortId: string): Promise<LobstersStory> {
  return fetchJSON<LobstersStory>(`${BASE}/s/${shortId}.json`);
}

export async function getStoryComments(shortId: string): Promise<LobstersComment[]> {
  const story = await fetchJSON<LobstersStory & { comments: LobstersComment[] }>(
    `${BASE}/s/${shortId}.json`
  );
  return story.comments ?? [];
}

export async function getUser(username: string): Promise<LobstersUser> {
  return fetchJSON<LobstersUser>(`${BASE}/u/${username}.json`);
}

export async function getByTag(tag: string, page = 1): Promise<LobstersStory[]> {
  return fetchJSON<LobstersStory[]>(`${BASE}/t/${tag}.json?page=${page}`);
}

export async function search(query: string): Promise<LobstersStory[]> {
  // Lobsters has no public search API.
  // Fall back to fetching hottest + newest and filtering client-side.
  const [hot, newest] = await Promise.all([getHottest(), getNewest()]);
  const all = [...hot, ...newest];
  const seen = new Set<string>();
  const deduped = all.filter((s) => {
    if (seen.has(s.short_id)) return false;
    seen.add(s.short_id);
    return true;
  });
  const lower = query.toLowerCase();
  return deduped.filter(
    (s) =>
      s.title.toLowerCase().includes(lower) ||
      s.tags.some((t) => t.toLowerCase().includes(lower)) ||
      s.description.toLowerCase().includes(lower)
  );
}
