/**
 * Dev.to (Forem) API client.
 * Docs: https://developers.forem.com/api/v1
 * Public endpoints — no API key required for reading.
 */

const BASE = "https://dev.to/api";
const UA = "devfeed-mcp/1.0 (https://github.com/upgpt-ai/devfeed-mcp)";

export interface DevtoArticle {
  id: number;
  title: string;
  description: string;
  url: string;
  comments_count: number;
  public_reactions_count: number;
  published_at: string;
  tag_list: string[];
  user: { username: string; name: string };
  reading_time_minutes: number;
}

export interface DevtoComment {
  id_code: string;
  body_html: string;
  created_at: string;
  user: { username: string; name: string };
  children: DevtoComment[];
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`Dev.to API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getArticles(
  page = 1,
  perPage = 25,
  tag?: string
): Promise<DevtoArticle[]> {
  let url = `${BASE}/articles?page=${page}&per_page=${perPage}`;
  if (tag) url += `&tag=${encodeURIComponent(tag)}`;
  return fetchJSON<DevtoArticle[]>(url);
}

export async function getTopArticles(
  page = 1,
  perPage = 25
): Promise<DevtoArticle[]> {
  return fetchJSON<DevtoArticle[]>(
    `${BASE}/articles?page=${page}&per_page=${perPage}&top=7`
  );
}

export async function getLatestArticles(
  page = 1,
  perPage = 25
): Promise<DevtoArticle[]> {
  return fetchJSON<DevtoArticle[]>(
    `${BASE}/articles/latest?page=${page}&per_page=${perPage}`
  );
}

export async function getArticle(id: number): Promise<DevtoArticle> {
  return fetchJSON<DevtoArticle>(`${BASE}/articles/${id}`);
}

export async function getArticleByPath(
  username: string,
  slug: string
): Promise<DevtoArticle> {
  return fetchJSON<DevtoArticle>(`${BASE}/articles/${username}/${slug}`);
}

export async function getComments(articleId: number): Promise<DevtoComment[]> {
  return fetchJSON<DevtoComment[]>(`${BASE}/comments?a_id=${articleId}`);
}

export async function searchArticles(
  query: string,
  page = 1,
  perPage = 25
): Promise<DevtoArticle[]> {
  // Dev.to public API doesn't have full-text search.
  // Try tag-based first (single word), then fall back to fetching top articles and filtering.
  const tag = query.replace(/\s+/g, "").toLowerCase();
  try {
    const tagResults = await fetchJSON<DevtoArticle[]>(
      `${BASE}/articles?page=${page}&per_page=${perPage}&tag=${encodeURIComponent(tag)}`
    );
    if (tagResults.length > 0) return tagResults;
  } catch {}

  // Fallback: fetch top articles and filter client-side
  const articles = await fetchJSON<DevtoArticle[]>(
    `${BASE}/articles?page=${page}&per_page=100`
  );
  const lower = query.toLowerCase();
  return articles.filter(
    (a) =>
      a.title.toLowerCase().includes(lower) ||
      a.description.toLowerCase().includes(lower) ||
      a.tag_list.some((t) => t.toLowerCase().includes(lower))
  ).slice(0, perPage);
}

export async function getArticlesByTag(
  tag: string,
  page = 1,
  perPage = 25
): Promise<DevtoArticle[]> {
  return fetchJSON<DevtoArticle[]>(
    `${BASE}/articles?tag=${encodeURIComponent(tag)}&page=${page}&per_page=${perPage}`
  );
}

export async function getUserArticles(
  username: string,
  page = 1,
  perPage = 25
): Promise<DevtoArticle[]> {
  return fetchJSON<DevtoArticle[]>(
    `${BASE}/articles?username=${encodeURIComponent(username)}&page=${page}&per_page=${perPage}`
  );
}
