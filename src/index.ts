#!/usr/bin/env node

/**
 * devfeed-mcp — Personalized dev community reader for AI assistants.
 *
 * Reads Hacker News, Lobsters, Reddit, and Dev.to through a single
 * MCP server. Personalized digests, reply notifications, thread
 * summaries, and Who Is Hiring filtering.
 *
 * https://github.com/upgpt-ai/devfeed-mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as hn from "./sources/hackernews.js";
import * as lobsters from "./sources/lobsters.js";
import * as reddit from "./sources/reddit.js";
import * as devto from "./sources/devto.js";
import * as profile from "./profile.js";
import {
  formatStory,
  formatComment,
  formatCommentTree,
  formatUser,
  formatStoryList,
  stripHtml,
  timeAgo,
} from "./formatters.js";

const server = new McpServer({
  name: "devfeed-mcp",
  version: "1.0.0",
});

// ════════════════════════════════════════════════════════════════════════
// UNIFIED TOOLS — across all sources
// ════════════════════════════════════════════════════════════════════════

server.tool(
  "feed_digest",
  "Your personalized digest across Hacker News, Lobsters, Reddit, and Dev.to — filtered by your interests from ~/.devfeed.yaml.",
  {
    count: z.number().optional().default(20).describe("Stories per source to scan"),
  },
  async ({ count }) => {
    const prof = await profile.loadProfile();
    const lines: string[] = [];
    const hasInterests = prof.topics.length > 0 || prof.keywords.length > 0;

    if (!hasInterests) {
      lines.push("No interests configured. Create ~/.devfeed.yaml with topics and keywords.\n");
    }

    // ── Hacker News ──
    try {
      const hnIds = await hn.getTopStories();
      const hnItems = await hn.getItems(hnIds.slice(0, count));
      const hnMatched: { item: hn.HNItem; tags: string[] }[] = [];
      const hnOther: hn.HNItem[] = [];

      for (const item of hnItems) {
        if (!item || item.type !== "story") continue;
        const text = `${item.title ?? ""} ${item.url ?? ""}`;
        const r = profile.matchesProfile(text, prof);
        if (r.matches) hnMatched.push({ item, tags: [...r.matchedTopics, ...r.matchedKeywords] });
        else hnOther.push(item);
      }

      lines.push("## Hacker News\n");
      if (hnMatched.length > 0) {
        for (const { item, tags } of hnMatched.slice(0, 8)) {
          lines.push(`- **${item.title}** (${item.score ?? 0} pts, ${item.descendants ?? 0} comments) [${tags.join(", ")}]`);
          lines.push(`  https://news.ycombinator.com/item?id=${item.id}`);
        }
      } else {
        for (const item of hnOther.slice(0, 5)) {
          lines.push(`- ${item.title} (${item.score ?? 0} pts, ${item.descendants ?? 0} comments)`);
          lines.push(`  https://news.ycombinator.com/item?id=${item.id}`);
        }
      }
    } catch {
      lines.push("## Hacker News\n(error fetching)");
    }

    // ── Lobsters ──
    try {
      const lobstersStories = await lobsters.getHottest();
      const lobMatched: { story: lobsters.LobstersStory; tags: string[] }[] = [];

      for (const story of lobstersStories.slice(0, count)) {
        const text = `${story.title} ${story.tags.join(" ")}`;
        const r = profile.matchesProfile(text, prof);
        if (r.matches) lobMatched.push({ story, tags: [...r.matchedTopics, ...r.matchedKeywords] });
      }

      lines.push("\n## Lobsters\n");
      const toShow = lobMatched.length > 0 ? lobMatched.slice(0, 5) : lobstersStories.slice(0, 5).map((s) => ({ story: s, tags: [] as string[] }));
      for (const { story, tags } of toShow) {
        const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
        lines.push(`- ${story.title} (${story.score} pts, ${story.comment_count} comments)${tagStr}`);
        lines.push(`  ${story.comments_url}`);
      }
    } catch {
      lines.push("\n## Lobsters\n(error fetching)");
    }

    // ── Reddit ──
    try {
      const subs = prof.subreddits.length > 0
        ? prof.subreddits
        : ["programming", "webdev", "machinelearning"];

      lines.push("\n## Reddit\n");
      const posts = await reddit.getMultiSubreddit(subs, "hot", count);
      const redMatched: { post: reddit.RedditPost; tags: string[] }[] = [];

      for (const post of posts) {
        const text = `${post.title} ${post.selftext}`;
        const r = profile.matchesProfile(text, prof);
        if (r.matches) redMatched.push({ post, tags: [...r.matchedTopics, ...r.matchedKeywords] });
      }

      const toShow = redMatched.length > 0 ? redMatched.slice(0, 5) : posts.slice(0, 5).map((p) => ({ post: p, tags: [] as string[] }));
      for (const { post, tags } of toShow) {
        const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
        lines.push(`- ${post.title} (${post.score} pts, ${post.num_comments} comments, r/${post.subreddit})${tagStr}`);
        lines.push(`  https://reddit.com${post.permalink}`);
      }
    } catch {
      lines.push("\n## Reddit\n(error fetching)");
    }

    // ── Dev.to ──
    try {
      lines.push("\n## Dev.to\n");
      const articles = await devto.getTopArticles(1, count);
      const devMatched: { article: devto.DevtoArticle; tags: string[] }[] = [];

      for (const article of articles) {
        const text = `${article.title} ${article.description} ${article.tag_list.join(" ")}`;
        const r = profile.matchesProfile(text, prof);
        if (r.matches) devMatched.push({ article, tags: [...r.matchedTopics, ...r.matchedKeywords] });
      }

      const toShow = devMatched.length > 0 ? devMatched.slice(0, 5) : articles.slice(0, 5).map((a) => ({ article: a, tags: [] as string[] }));
      for (const { article, tags } of toShow) {
        const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
        lines.push(`- ${article.title} (${article.public_reactions_count} reactions, ${article.comments_count} comments)${tagStr}`);
        lines.push(`  ${article.url}`);
      }
    } catch {
      lines.push("\n## Dev.to\n(error fetching)");
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

server.tool(
  "feed_search",
  "Search across Hacker News, Lobsters, Reddit, and Dev.to at once.",
  {
    query: z.string().describe("Search query"),
    sources: z.array(z.enum(["hackernews", "lobsters", "reddit", "devto"]))
      .optional()
      .default(["hackernews", "lobsters", "reddit", "devto"])
      .describe("Which sources to search"),
  },
  async ({ query, sources }) => {
    const lines: string[] = [];

    if (sources.includes("hackernews")) {
      try {
        const result = await hn.searchStories(query);
        lines.push("## Hacker News\n");
        for (const hit of result.hits.slice(0, 5)) {
          lines.push(`- ${hit.title} (${hit.points ?? 0} pts, ${hit.num_comments ?? 0} comments)`);
          lines.push(`  https://news.ycombinator.com/item?id=${hit.objectID}`);
        }
      } catch { lines.push("## Hacker News\n(error)"); }
    }

    if (sources.includes("lobsters")) {
      try {
        const stories = await lobsters.search(query);
        lines.push("\n## Lobsters\n");
        for (const s of stories.slice(0, 5)) {
          lines.push(`- ${s.title} (${s.score} pts, ${s.comment_count} comments)`);
          lines.push(`  ${s.comments_url}`);
        }
      } catch { lines.push("\n## Lobsters\n(error)"); }
    }

    if (sources.includes("reddit")) {
      try {
        const posts = await reddit.searchAll(query, "relevance", 5);
        lines.push("\n## Reddit\n");
        for (const p of posts) {
          lines.push(`- ${p.title} (${p.score} pts, ${p.num_comments} comments, r/${p.subreddit})`);
          lines.push(`  https://reddit.com${p.permalink}`);
        }
      } catch { lines.push("\n## Reddit\n(error)"); }
    }

    if (sources.includes("devto")) {
      try {
        const articles = await devto.searchArticles(query);
        lines.push("\n## Dev.to\n");
        for (const a of articles.slice(0, 5)) {
          lines.push(`- ${a.title} (${a.public_reactions_count} reactions, ${a.comments_count} comments)`);
          lines.push(`  ${a.url}`);
        }
      } catch { lines.push("\n## Dev.to\n(error)"); }
    }

    return { content: [{ type: "text" as const, text: `Search: "${query}"\n\n${lines.join("\n")}` }] };
  }
);

// ════════════════════════════════════════════════════════════════════════
// HACKER NEWS TOOLS
// ════════════════════════════════════════════════════════════════════════

server.tool(
  "hn_replies",
  "Check for replies to your HN comments. HN has no notifications — this fills the gap.",
  {
    username: z.string().optional().describe("HN username (defaults to profile)"),
    limit: z.number().optional().default(20),
    unread_only: z.boolean().optional().default(false),
  },
  async ({ username, limit, unread_only }) => {
    const prof = await profile.loadProfile();
    const user = username ?? prof.hackernews;
    if (!user) return { content: [{ type: "text" as const, text: "No HN username. Set `hackernews` in ~/.devfeed.yaml" }] };

    const replies = await hn.getUserReplies(user, limit);
    const seen = unread_only ? await profile.getSeenReplies() : new Set<string>();
    const lines: string[] = [];
    let count = 0;

    for (const { comment, replies: reps } of replies) {
      const filtered = unread_only ? reps.filter((r) => !seen.has(String(r.id))) : reps;
      if (filtered.length === 0) continue;
      count += filtered.length;
      const text = comment.text ? stripHtml(comment.text).slice(0, 100) : "";
      lines.push(`---\nYour comment (${timeAgo(comment.time!)}): "${text}..."\nhttps://news.ycombinator.com/item?id=${comment.id}\n`);
      for (const r of filtered) { lines.push(formatComment(r, 1) + "\n"); }
    }

    if (unread_only && count > 0) {
      await profile.markRepliesSeen(replies.flatMap(({ replies: r }) => r.map((x) => String(x.id))));
    }

    return { content: [{ type: "text" as const, text: count === 0 ? `No ${unread_only ? "new " : ""}replies for ${user}.` : `${count} replies:\n\n${lines.join("\n")}` }] };
  }
);

server.tool("hn_story", "Get an HN story's details.", { id: z.number() }, async ({ id }) => {
  const item = await hn.getItem(id);
  return { content: [{ type: "text" as const, text: item ? formatStory(item) : "Not found." }] };
});

server.tool(
  "hn_thread",
  "Get a full HN comment tree for a story or comment.",
  { id: z.number(), depth: z.number().optional().default(3) },
  async ({ id, depth }) => {
    const tree = await hn.getCommentTree(id, depth);
    if (!tree) return { content: [{ type: "text" as const, text: "Not found." }] };
    const header = tree.item.title ? formatStory(tree.item) : formatComment(tree.item);
    const comments = tree.children.map((c) => formatCommentTree(c)).join("\n");
    return { content: [{ type: "text" as const, text: `${header}\n\n--- Comments ---\n\n${comments}` }] };
  }
);

server.tool(
  "hn_thread_summary",
  "Get a structured overview of an HN thread — key participants and most-discussed comments.",
  { id: z.number() },
  async ({ id }) => {
    const item = await hn.getItem(id);
    if (!item || !item.kids) return { content: [{ type: "text" as const, text: "Not found or no comments." }] };

    const topComments = await hn.getItems(item.kids.slice(0, 40));
    const valid = topComments.filter((c): c is hn.HNItem => c !== null && !c.deleted && !c.dead);

    const participants = new Map<string, number>();
    for (const c of valid) { if (c.by) participants.set(c.by, (participants.get(c.by) ?? 0) + 1); }
    const topP = [...participants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    const byReplies = [...valid].sort((a, b) => (b.kids?.length ?? 0) - (a.kids?.length ?? 0)).slice(0, 5);

    const lines: string[] = [formatStory(item), "", `## Thread Stats`, `Total comments: ${item.descendants ?? 0}`, `Top-level: ${valid.length}`, "", `## Most Active`];
    for (const [user, cnt] of topP) lines.push(`- ${user} (${cnt} comments)`);
    lines.push("", "## Most Discussed");
    for (const c of byReplies) {
      const text = c.text ? stripHtml(c.text).slice(0, 120) : "";
      lines.push(`- [${c.by}] (${c.kids?.length ?? 0} replies): "${text}..."`);
      lines.push(`  https://news.ycombinator.com/item?id=${c.id}`);
    }
    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

server.tool(
  "hn_thread_search",
  "Search within an HN thread for a keyword.",
  { id: z.number(), query: z.string() },
  async ({ id, query }) => {
    const item = await hn.getItem(id);
    if (!item?.kids) return { content: [{ type: "text" as const, text: "Not found or no comments." }] };
    const comments = await hn.getItems(item.kids.slice(0, 60));
    const lower = query.toLowerCase();
    const matches = comments.filter((c) => c && !c.deleted && !c.dead && (c.text ?? "").toLowerCase().includes(lower)) as hn.HNItem[];
    if (matches.length === 0) return { content: [{ type: "text" as const, text: `No comments mention "${query}".` }] };
    const lines = matches.map((c) => `[${c.by} | ${timeAgo(c.time!)}] ${stripHtml(c.text!).slice(0, 200)}...\nhttps://news.ycombinator.com/item?id=${c.id}`);
    return { content: [{ type: "text" as const, text: `${matches.length} comments mentioning "${query}":\n\n${lines.join("\n\n")}` }] };
  }
);

server.tool("hn_user", "Look up an HN user's profile.", { username: z.string() }, async ({ username }) => {
  const user = await hn.getUser(username);
  return { content: [{ type: "text" as const, text: user ? formatUser(user) : "Not found." }] };
});

server.tool(
  "hn_my_activity",
  "Your recent HN comments and submissions.",
  { username: z.string().optional(), limit: z.number().optional().default(20) },
  async ({ username, limit }) => {
    const prof = await profile.loadProfile();
    const user = username ?? prof.hackernews;
    if (!user) return { content: [{ type: "text" as const, text: "No HN username set." }] };
    const items = await hn.getUserItems(user, limit);
    const lines: string[] = [];
    for (const item of items) {
      if (item.type === "story") {
        lines.push(`[story] ${item.title} — ${item.score ?? 0} pts, ${item.descendants ?? 0} comments\n  https://news.ycombinator.com/item?id=${item.id}`);
      } else if (item.type === "comment") {
        const text = item.text ? stripHtml(item.text).slice(0, 100) : "";
        lines.push(`[comment] "${text}..." — ${item.kids?.length ?? 0} replies, ${timeAgo(item.time!)}\n  https://news.ycombinator.com/item?id=${item.id}`);
      }
      lines.push("");
    }
    return { content: [{ type: "text" as const, text: `Activity for ${user}:\n\n${lines.join("\n")}` }] };
  }
);

server.tool("hn_top", "Current top HN stories.", { count: z.number().optional().default(15) }, async ({ count }) => {
  const ids = await hn.getTopStories();
  const items = await hn.getItems(ids.slice(0, count));
  return { content: [{ type: "text" as const, text: `## HN Top Stories\n\n${formatStoryList(items.filter((i): i is hn.HNItem => i !== null))}` }] };
});

server.tool("hn_ask", "Current Ask HN stories.", { count: z.number().optional().default(15) }, async ({ count }) => {
  const ids = await hn.getAskStories();
  const items = await hn.getItems(ids.slice(0, count));
  return { content: [{ type: "text" as const, text: `## Ask HN\n\n${formatStoryList(items.filter((i): i is hn.HNItem => i !== null))}` }] };
});

server.tool("hn_show", "Current Show HN stories.", { count: z.number().optional().default(15) }, async ({ count }) => {
  const ids = await hn.getShowStories();
  const items = await hn.getItems(ids.slice(0, count));
  return { content: [{ type: "text" as const, text: `## Show HN\n\n${formatStoryList(items.filter((i): i is hn.HNItem => i !== null))}` }] };
});

server.tool(
  "hn_who_is_hiring",
  'Search the latest HN "Who is hiring?" thread by keyword.',
  { query: z.string(), month: z.string().optional() },
  async ({ query, month }) => {
    const searchQuery = `Who is hiring? ${month ?? ""}`.trim();
    const result = await hn.searchByDate(searchQuery, "story");
    const thread = result.hits.find((h) => h.author === "whoishiring" && h.title?.toLowerCase().includes("who is hiring"));
    if (!thread) return { content: [{ type: "text" as const, text: "Thread not found." }] };
    const story = await hn.getItem(parseInt(thread.objectID));
    if (!story?.kids) return { content: [{ type: "text" as const, text: "No postings." }] };
    const jobs = await hn.getItems(story.kids.slice(0, 100));
    const lower = query.toLowerCase();
    const matches = jobs.filter((c) => c?.text?.toLowerCase().includes(lower)) as hn.HNItem[];
    if (!matches.length) return { content: [{ type: "text" as const, text: `No postings matching "${query}".` }] };
    const lines = matches.slice(0, 15).map((c) => `---\n${stripHtml(c.text!).slice(0, 300)}...\nhttps://news.ycombinator.com/item?id=${c.id}`);
    return { content: [{ type: "text" as const, text: `${matches.length} postings matching "${query}":\n\n${lines.join("\n\n")}` }] };
  }
);

server.tool("hn_search", "Search HN stories or comments.", { query: z.string(), type: z.enum(["stories", "comments"]).optional().default("stories") }, async ({ query, type }) => {
  const result = type === "stories" ? await hn.searchStories(query) : await hn.searchComments(query);
  if (!result.hits.length) return { content: [{ type: "text" as const, text: "No results." }] };
  const lines = result.hits.slice(0, 15).map((h) => type === "stories"
    ? `- ${h.title} (${h.points ?? 0} pts)\n  https://news.ycombinator.com/item?id=${h.objectID}`
    : `- [${h.author}] "${stripHtml(h.comment_text ?? "").slice(0, 150)}"\n  https://news.ycombinator.com/item?id=${h.objectID}`);
  return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
});

// ════════════════════════════════════════════════════════════════════════
// LOBSTERS TOOLS
// ════════════════════════════════════════════════════════════════════════

server.tool("lobsters_hot", "Current hottest stories on Lobsters.", { count: z.number().optional().default(15) }, async ({ count }) => {
  const stories = await lobsters.getHottest();
  const lines = stories.slice(0, count).map((s, i) =>
    `${i + 1}. ${s.title} (${s.score} pts, ${s.comment_count} comments) [${s.tags.join(", ")}]\n   ${s.comments_url}${s.url ? `\n   ${s.url}` : ""}`);
  return { content: [{ type: "text" as const, text: `## Lobsters Hot\n\n${lines.join("\n\n")}` }] };
});

server.tool("lobsters_newest", "Latest stories on Lobsters.", { count: z.number().optional().default(15) }, async ({ count }) => {
  const stories = await lobsters.getNewest();
  const lines = stories.slice(0, count).map((s, i) =>
    `${i + 1}. ${s.title} (${s.score} pts, ${s.comment_count} comments) [${s.tags.join(", ")}]\n   ${s.comments_url}`);
  return { content: [{ type: "text" as const, text: `## Lobsters Newest\n\n${lines.join("\n\n")}` }] };
});

server.tool(
  "lobsters_thread",
  "Get comments on a Lobsters story.",
  { short_id: z.string().describe("Lobsters story short ID (from URL)") },
  async ({ short_id }) => {
    try {
      const story = await lobsters.getStory(short_id);
      const comments = await lobsters.getStoryComments(short_id);
      const lines: string[] = [
        `# ${story.title}`,
        `Score: ${story.score} | Comments: ${story.comment_count} | By: ${story.submitter_user.username}`,
        `Tags: ${story.tags.join(", ")}`,
        story.url ? `URL: ${story.url}` : "",
        `\n--- Comments ---\n`,
      ];
      for (const c of comments.slice(0, 30)) {
        const indent = "  ".repeat(c.indent_level);
        const text = stripHtml(c.comment).slice(0, 200);
        lines.push(`${indent}[${c.commenting_user.username} | ${c.score} pts]\n${indent}${text}\n`);
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch {
      return { content: [{ type: "text" as const, text: "Story not found." }] };
    }
  }
);

server.tool("lobsters_tag", "Get Lobsters stories by tag.", { tag: z.string(), count: z.number().optional().default(15) }, async ({ tag, count }) => {
  const stories = await lobsters.getByTag(tag);
  const lines = stories.slice(0, count).map((s, i) =>
    `${i + 1}. ${s.title} (${s.score} pts, ${s.comment_count} comments)\n   ${s.comments_url}`);
  return { content: [{ type: "text" as const, text: `## Lobsters: ${tag}\n\n${lines.join("\n\n")}` }] };
});

// ════════════════════════════════════════════════════════════════════════
// REDDIT TOOLS
// ════════════════════════════════════════════════════════════════════════

server.tool(
  "reddit_subreddit",
  "Get posts from a subreddit.",
  {
    subreddit: z.string().describe("Subreddit name (without r/)"),
    sort: z.enum(["hot", "new", "top", "rising"]).optional().default("hot"),
    count: z.number().optional().default(15),
  },
  async ({ subreddit, sort, count }) => {
    const posts = await reddit.getSubreddit(subreddit, sort, count);
    const lines = posts.map((p, i) =>
      `${i + 1}. ${p.title} (${p.score} pts, ${p.num_comments} comments, u/${p.author})\n   https://reddit.com${p.permalink}`);
    return { content: [{ type: "text" as const, text: `## r/${subreddit} (${sort})\n\n${lines.join("\n\n")}` }] };
  }
);

server.tool(
  "reddit_thread",
  "Get a Reddit post and its comments.",
  {
    subreddit: z.string(),
    post_id: z.string().describe("Reddit post ID (the string after /comments/ in the URL)"),
  },
  async ({ subreddit, post_id }) => {
    try {
      const { post, comments } = await reddit.getPostComments(subreddit, post_id, 30);
      const lines: string[] = [
        `# ${post.title}`,
        `Score: ${post.score} | Comments: ${post.num_comments} | By: u/${post.author} | r/${post.subreddit}`,
        `https://reddit.com${post.permalink}`,
        post.selftext ? `\n${post.selftext.slice(0, 500)}` : "",
        "\n--- Comments ---\n",
      ];

      function renderComments(cmts: reddit.RedditComment[], maxDepth = 3) {
        for (const c of cmts) {
          if (c.depth > maxDepth) continue;
          const indent = "  ".repeat(c.depth);
          lines.push(`${indent}[u/${c.author} | ${c.score} pts]`);
          lines.push(`${indent}${c.body.slice(0, 200)}\n`);
          if (c.replies.length) renderComments(c.replies, maxDepth);
        }
      }
      renderComments(comments);

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch {
      return { content: [{ type: "text" as const, text: "Post not found." }] };
    }
  }
);

server.tool(
  "reddit_search",
  "Search Reddit posts.",
  {
    query: z.string(),
    subreddit: z.string().optional().describe("Limit to a subreddit"),
    count: z.number().optional().default(15),
  },
  async ({ query, subreddit, count }) => {
    const posts = subreddit
      ? await reddit.searchSubreddit(subreddit, query, "relevance", count)
      : await reddit.searchAll(query, "relevance", count);
    if (!posts.length) return { content: [{ type: "text" as const, text: "No results." }] };
    const lines = posts.map((p, i) =>
      `${i + 1}. ${p.title} (${p.score} pts, ${p.num_comments} comments, r/${p.subreddit})\n   https://reddit.com${p.permalink}`);
    return { content: [{ type: "text" as const, text: `Reddit search: "${query}"${subreddit ? ` in r/${subreddit}` : ""}\n\n${lines.join("\n\n")}` }] };
  }
);

// ════════════════════════════════════════════════════════════════════════
// DEV.TO TOOLS
// ════════════════════════════════════════════════════════════════════════

server.tool("devto_top", "Top Dev.to articles this week.", { count: z.number().optional().default(15) }, async ({ count }) => {
  const articles = await devto.getTopArticles(1, count);
  const lines = articles.map((a, i) =>
    `${i + 1}. ${a.title} (${a.public_reactions_count} reactions, ${a.comments_count} comments, ${a.reading_time_minutes}min read)\n   By: ${a.user.name} | Tags: ${a.tag_list.join(", ")}\n   ${a.url}`);
  return { content: [{ type: "text" as const, text: `## Dev.to Top\n\n${lines.join("\n\n")}` }] };
});

server.tool("devto_latest", "Latest Dev.to articles.", { count: z.number().optional().default(15) }, async ({ count }) => {
  const articles = await devto.getLatestArticles(1, count);
  const lines = articles.map((a, i) =>
    `${i + 1}. ${a.title} (${a.public_reactions_count} reactions, ${a.comments_count} comments)\n   ${a.url}`);
  return { content: [{ type: "text" as const, text: `## Dev.to Latest\n\n${lines.join("\n\n")}` }] };
});

server.tool(
  "devto_tag",
  "Get Dev.to articles by tag.",
  { tag: z.string(), count: z.number().optional().default(15) },
  async ({ tag, count }) => {
    const articles = await devto.getArticlesByTag(tag, 1, count);
    const lines = articles.map((a, i) =>
      `${i + 1}. ${a.title} (${a.public_reactions_count} reactions, ${a.comments_count} comments)\n   ${a.url}`);
    return { content: [{ type: "text" as const, text: `## Dev.to: #${tag}\n\n${lines.join("\n\n")}` }] };
  }
);

server.tool(
  "devto_thread",
  "Get a Dev.to article and its comments.",
  { id: z.number().describe("Dev.to article ID") },
  async ({ id }) => {
    try {
      const article = await devto.getArticle(id);
      const comments = await devto.getComments(id);
      const lines: string[] = [
        `# ${article.title}`,
        `Reactions: ${article.public_reactions_count} | Comments: ${article.comments_count} | By: ${article.user.name}`,
        `Tags: ${article.tag_list.join(", ")} | ${article.reading_time_minutes}min read`,
        `${article.url}`,
        `\n${article.description}`,
        "\n--- Comments ---\n",
      ];
      for (const c of comments.slice(0, 20)) {
        const text = stripHtml(c.body_html).slice(0, 200);
        lines.push(`[${c.user.name}] ${text}\n`);
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch {
      return { content: [{ type: "text" as const, text: "Article not found." }] };
    }
  }
);

// ── Start server ───────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
