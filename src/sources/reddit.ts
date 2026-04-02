/**
 * Reddit public JSON API client.
 * Append .json to any Reddit URL for structured data. No auth required.
 * Rate limited — be respectful with request frequency.
 */

const BASE = "https://www.reddit.com";
const UA = "devfeed-mcp/1.0 (https://github.com/upgpt-ai/devfeed-mcp)";

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_utc: number;
  author: string;
  subreddit: string;
  link_flair_text: string | null;
}

export interface RedditComment {
  id: string;
  body: string;
  score: number;
  created_utc: number;
  author: string;
  replies: RedditComment[];
  permalink: string;
  depth: number;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`Reddit API error: ${res.status}`);
  return res.json() as Promise<T>;
}

function extractPosts(data: any): RedditPost[] {
  if (!data?.data?.children) return [];
  return data.data.children
    .filter((c: any) => c.kind === "t3")
    .map((c: any) => {
      const d = c.data;
      return {
        id: d.id,
        title: d.title,
        selftext: d.selftext ?? "",
        url: d.url,
        permalink: d.permalink,
        score: d.score,
        num_comments: d.num_comments,
        created_utc: d.created_utc,
        author: d.author,
        subreddit: d.subreddit,
        link_flair_text: d.link_flair_text,
      } as RedditPost;
    });
}

function extractComments(data: any, depth = 0): RedditComment[] {
  if (!data?.data?.children) return [];
  return data.data.children
    .filter((c: any) => c.kind === "t1")
    .map((c: any) => {
      const d = c.data;
      return {
        id: d.id,
        body: d.body ?? "",
        score: d.score,
        created_utc: d.created_utc,
        author: d.author,
        permalink: d.permalink,
        depth,
        replies: d.replies ? extractComments(d.replies, depth + 1) : [],
      } as RedditComment;
    });
}

export async function getSubreddit(
  subreddit: string,
  sort: "hot" | "new" | "top" | "rising" = "hot",
  limit = 25
): Promise<RedditPost[]> {
  const data = await fetchJSON<any>(
    `${BASE}/r/${subreddit}/${sort}.json?limit=${limit}&raw_json=1`
  );
  return extractPosts(data);
}

export async function getPostComments(
  subreddit: string,
  postId: string,
  limit = 50
): Promise<{ post: RedditPost; comments: RedditComment[] }> {
  const data = await fetchJSON<any[]>(
    `${BASE}/r/${subreddit}/comments/${postId}.json?limit=${limit}&raw_json=1`
  );
  const posts = extractPosts(data[0]);
  const comments = extractComments(data[1]);
  return { post: posts[0], comments };
}

export async function searchSubreddit(
  subreddit: string,
  query: string,
  sort: "relevance" | "new" | "top" = "relevance",
  limit = 25
): Promise<RedditPost[]> {
  const data = await fetchJSON<any>(
    `${BASE}/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=on&sort=${sort}&limit=${limit}&raw_json=1`
  );
  return extractPosts(data);
}

export async function searchAll(
  query: string,
  sort: "relevance" | "new" | "top" = "relevance",
  limit = 25
): Promise<RedditPost[]> {
  const data = await fetchJSON<any>(
    `${BASE}/search.json?q=${encodeURIComponent(query)}&sort=${sort}&limit=${limit}&raw_json=1`
  );
  return extractPosts(data);
}

export async function getMultiSubreddit(
  subreddits: string[],
  sort: "hot" | "new" | "top" = "hot",
  limit = 25
): Promise<RedditPost[]> {
  const combined = subreddits.join("+");
  const data = await fetchJSON<any>(
    `${BASE}/r/${combined}/${sort}.json?limit=${limit}&raw_json=1`
  );
  return extractPosts(data);
}
