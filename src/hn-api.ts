/**
 * Hacker News Firebase API client.
 * Docs: https://github.com/HackerNews/API
 * No rate limits. All endpoints return JSON.
 */

const BASE = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA_BASE = "https://hn.algolia.com/api/v1";

// ── Types ──────────────────────────────────────────────────────────────

export interface HNItem {
  id: number;
  type: "story" | "comment" | "job" | "poll" | "pollopt";
  by?: string;
  time?: number;
  text?: string;
  url?: string;
  title?: string;
  score?: number;
  descendants?: number; // total comment count for stories
  kids?: number[];
  parent?: number;
  dead?: boolean;
  deleted?: boolean;
}

export interface HNUser {
  id: string;
  created: number;
  karma: number;
  about?: string;
  submitted?: number[];
}

export interface AlgoliaHit {
  objectID: string;
  title?: string;
  url?: string;
  author: string;
  points: number | null;
  num_comments: number | null;
  created_at: string;
  story_text?: string;
  comment_text?: string;
  story_id?: number;
  parent_id?: number;
  _tags: string[];
}

export interface AlgoliaResult {
  hits: AlgoliaHit[];
  nbHits: number;
  page: number;
  nbPages: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Firebase API ───────────────────────────────────────────────────────

export async function getItem(id: number): Promise<HNItem | null> {
  return fetchJSON<HNItem | null>(`${BASE}/item/${id}.json`);
}

export async function getUser(username: string): Promise<HNUser | null> {
  return fetchJSON<HNUser | null>(`${BASE}/user/${username}.json`);
}

export async function getTopStories(): Promise<number[]> {
  return fetchJSON<number[]>(`${BASE}/topstories.json`);
}

export async function getNewStories(): Promise<number[]> {
  return fetchJSON<number[]>(`${BASE}/newstories.json`);
}

export async function getBestStories(): Promise<number[]> {
  return fetchJSON<number[]>(`${BASE}/beststories.json`);
}

export async function getAskStories(): Promise<number[]> {
  return fetchJSON<number[]>(`${BASE}/askstories.json`);
}

export async function getShowStories(): Promise<number[]> {
  return fetchJSON<number[]>(`${BASE}/showstories.json`);
}

export async function getJobStories(): Promise<number[]> {
  return fetchJSON<number[]>(`${BASE}/jobstories.json`);
}

// ── Batch fetch with concurrency control ───────────────────────────────

export async function getItems(
  ids: number[],
  concurrency = 20
): Promise<(HNItem | null)[]> {
  const results: (HNItem | null)[] = new Array(ids.length).fill(null);
  const queue = ids.map((id, i) => ({ id, i }));

  async function worker() {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;
      results[job.i] = await getItem(job.id);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

// ── Comment tree ───────────────────────────────────────────────────────

export interface CommentNode {
  item: HNItem;
  children: CommentNode[];
}

export async function getCommentTree(
  rootId: number,
  maxDepth = 3
): Promise<CommentNode | null> {
  const item = await getItem(rootId);
  if (!item) return null;

  async function buildTree(node: HNItem, depth: number): Promise<CommentNode> {
    if (depth >= maxDepth || !node.kids?.length) {
      return { item: node, children: [] };
    }
    const children = await getItems(node.kids);
    const childNodes = await Promise.all(
      children
        .filter((c): c is HNItem => c !== null && !c.deleted && !c.dead)
        .map((c) => buildTree(c, depth + 1))
    );
    return { item: node, children: childNodes };
  }

  return buildTree(item, 0);
}

// ── User's recent items ────────────────────────────────────────────────

export async function getUserItems(
  username: string,
  limit = 30
): Promise<HNItem[]> {
  const user = await getUser(username);
  if (!user?.submitted) return [];
  const ids = user.submitted.slice(0, limit);
  const items = await getItems(ids);
  return items.filter((i): i is HNItem => i !== null);
}

// ── Find replies to a user's comments ──────────────────────────────────

export async function getUserReplies(
  username: string,
  limit = 30
): Promise<{ comment: HNItem; replies: HNItem[] }[]> {
  const userItems = await getUserItems(username, limit);
  const comments = userItems.filter((i) => i.kids?.length);

  const results: { comment: HNItem; replies: HNItem[] }[] = [];
  for (const comment of comments) {
    if (!comment.kids) continue;
    const replies = await getItems(comment.kids);
    const validReplies = replies.filter(
      (r): r is HNItem => r !== null && !r.deleted && !r.dead
    );
    if (validReplies.length > 0) {
      results.push({ comment, replies: validReplies });
    }
  }
  return results;
}

// ── Algolia Search ─────────────────────────────────────────────────────

export async function searchStories(
  query: string,
  page = 0
): Promise<AlgoliaResult> {
  const url = `${ALGOLIA_BASE}/search?query=${encodeURIComponent(query)}&tags=story&page=${page}`;
  return fetchJSON<AlgoliaResult>(url);
}

export async function searchComments(
  query: string,
  page = 0
): Promise<AlgoliaResult> {
  const url = `${ALGOLIA_BASE}/search?query=${encodeURIComponent(query)}&tags=comment&page=${page}`;
  return fetchJSON<AlgoliaResult>(url);
}

export async function searchByDate(
  query: string,
  tags = "story",
  page = 0
): Promise<AlgoliaResult> {
  const url = `${ALGOLIA_BASE}/search_by_date?query=${encodeURIComponent(query)}&tags=${tags}&page=${page}`;
  return fetchJSON<AlgoliaResult>(url);
}
