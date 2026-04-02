#!/usr/bin/env node

/**
 * hn-mcp — Personalized Hacker News reader for AI assistants.
 *
 * Wraps the HN Firebase API + Algolia Search with personalization,
 * reply notifications, thread summaries, and Who Is Hiring filtering.
 *
 * https://github.com/upgpt-ai/hn-mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as api from "./hn-api.js";
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
  name: "hn-mcp",
  version: "1.0.0",
});

// ── hn_replies ─────────────────────────────────────────────────────────
// The #1 missing HN feature: reply notifications.

server.tool(
  "hn_replies",
  "Check for replies to your comments. HN has no notifications — this fills the gap.",
  {
    username: z
      .string()
      .optional()
      .describe("HN username (defaults to profile username)"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Number of recent comments to check"),
    unread_only: z
      .boolean()
      .optional()
      .default(false)
      .describe("Only show replies you haven't seen yet"),
  },
  async ({ username, limit, unread_only }) => {
    const prof = await profile.loadProfile();
    const user = username ?? prof.username;
    if (!user) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No username provided. Set `username` in ~/.hn-profile.yaml or pass it as a parameter.",
          },
        ],
      };
    }

    const replies = await api.getUserReplies(user, limit);
    const seen = unread_only ? await profile.getSeenReplies() : new Set<number>();

    const lines: string[] = [];
    let newCount = 0;

    for (const { comment, replies: reps } of replies) {
      const filtered = unread_only
        ? reps.filter((r) => !seen.has(r.id))
        : reps;
      if (filtered.length === 0) continue;

      newCount += filtered.length;
      const commentText = comment.text ? stripHtml(comment.text).slice(0, 100) : "(no text)";
      lines.push(`---`);
      lines.push(`Your comment (${timeAgo(comment.time!)}): "${commentText}..."`);
      lines.push(`https://news.ycombinator.com/item?id=${comment.id}`);
      lines.push("");
      for (const reply of filtered) {
        lines.push(formatComment(reply, 1));
        lines.push("");
      }
    }

    // Mark all seen
    if (unread_only && newCount > 0) {
      const allReplyIds = replies.flatMap(({ replies: r }) => r.map((x) => x.id));
      await profile.markRepliesSeen(allReplyIds);
    }

    const header =
      newCount === 0
        ? `No ${unread_only ? "new " : ""}replies found for ${user}.`
        : `${newCount} ${unread_only ? "new " : ""}replies for ${user}:`;

    return {
      content: [{ type: "text" as const, text: `${header}\n\n${lines.join("\n")}` }],
    };
  }
);

// ── hn_story ───────────────────────────────────────────────────────────

server.tool(
  "hn_story",
  "Get a story's details — title, score, URL, comment count.",
  {
    id: z.number().describe("HN item ID"),
  },
  async ({ id }) => {
    const item = await api.getItem(id);
    if (!item) {
      return { content: [{ type: "text" as const, text: `Item ${id} not found.` }] };
    }
    return { content: [{ type: "text" as const, text: formatStory(item) }] };
  }
);

// ── hn_thread ──────────────────────────────────────────────────────────

server.tool(
  "hn_thread",
  "Get a full comment tree for a story or comment. Great for understanding a discussion before reading all 300 comments.",
  {
    id: z.number().describe("HN item ID (story or comment)"),
    depth: z
      .number()
      .optional()
      .default(3)
      .describe("Max depth of comment tree (default 3)"),
  },
  async ({ id, depth }) => {
    const tree = await api.getCommentTree(id, depth);
    if (!tree) {
      return { content: [{ type: "text" as const, text: `Item ${id} not found.` }] };
    }

    const header = tree.item.title
      ? formatStory(tree.item)
      : formatComment(tree.item);

    const comments = tree.children.map((c) => formatCommentTree(c)).join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `${header}\n\n--- Comments ---\n\n${comments}`,
        },
      ],
    };
  }
);

// ── hn_thread_summary ──────────────────────────────────────────────────

server.tool(
  "hn_thread_summary",
  "Get a structured overview of a thread — key participants, discussion clusters, and comment stats. Useful for large threads (100+ comments).",
  {
    id: z.number().describe("HN story ID"),
  },
  async ({ id }) => {
    const item = await api.getItem(id);
    if (!item || !item.kids) {
      return {
        content: [{ type: "text" as const, text: `Story ${id} not found or has no comments.` }],
      };
    }

    // Fetch top-level comments
    const topComments = await api.getItems(item.kids.slice(0, 40));
    const valid = topComments.filter(
      (c): c is api.HNItem => c !== null && !c.deleted && !c.dead
    );

    // Participant frequency
    const participants = new Map<string, number>();
    for (const c of valid) {
      if (c.by) participants.set(c.by, (participants.get(c.by) ?? 0) + 1);
    }
    const topParticipants = [...participants.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Top comments by reply count
    const byReplies = [...valid]
      .sort((a, b) => (b.kids?.length ?? 0) - (a.kids?.length ?? 0))
      .slice(0, 5);

    const lines: string[] = [];
    lines.push(formatStory(item));
    lines.push("");
    lines.push(`## Thread Stats`);
    lines.push(`Total comments: ${item.descendants ?? 0}`);
    lines.push(`Top-level comments: ${valid.length}`);
    lines.push("");
    lines.push(`## Most Active Participants`);
    for (const [user, count] of topParticipants) {
      lines.push(`- ${user} (${count} top-level comments)`);
    }
    lines.push("");
    lines.push(`## Most Discussed Comments (by reply count)`);
    for (const c of byReplies) {
      const text = c.text ? stripHtml(c.text).slice(0, 120) : "(no text)";
      lines.push(
        `- [${c.by}] (${c.kids?.length ?? 0} replies): "${text}..."`
      );
      lines.push(`  https://news.ycombinator.com/item?id=${c.id}`);
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// ── hn_thread_search ───────────────────────────────────────────────────

server.tool(
  "hn_thread_search",
  "Search within a specific thread for a keyword or phrase. Find if something was already said in a big discussion.",
  {
    id: z.number().describe("HN story ID"),
    query: z.string().describe("Text to search for in comments"),
  },
  async ({ id, query }) => {
    const item = await api.getItem(id);
    if (!item || !item.kids) {
      return {
        content: [{ type: "text" as const, text: `Story ${id} not found or has no comments.` }],
      };
    }

    const topComments = await api.getItems(item.kids.slice(0, 60));
    const lower = query.toLowerCase();

    const matches: api.HNItem[] = [];
    for (const c of topComments) {
      if (!c || c.deleted || c.dead) continue;
      const text = (c.text ?? "").toLowerCase();
      if (text.includes(lower)) matches.push(c);
    }

    if (matches.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No top-level comments in story ${id} mention "${query}".`,
          },
        ],
      };
    }

    const lines = matches.map((c) => {
      const text = c.text ? stripHtml(c.text).slice(0, 200) : "";
      return `[${c.by} | ${timeAgo(c.time!)}] ${text}...\nhttps://news.ycombinator.com/item?id=${c.id}`;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${matches.length} comments mentioning "${query}":\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  }
);

// ── hn_user ────────────────────────────────────────────────────────────

server.tool(
  "hn_user",
  "Look up a Hacker News user's public profile — karma, join date, about.",
  {
    username: z.string().describe("HN username"),
  },
  async ({ username }) => {
    const user = await api.getUser(username);
    if (!user) {
      return {
        content: [{ type: "text" as const, text: `User "${username}" not found.` }],
      };
    }
    return { content: [{ type: "text" as const, text: formatUser(user) }] };
  }
);

// ── hn_my_activity ─────────────────────────────────────────────────────

server.tool(
  "hn_my_activity",
  "See your recent comments and submissions with reply counts.",
  {
    username: z
      .string()
      .optional()
      .describe("HN username (defaults to profile username)"),
    limit: z.number().optional().default(20).describe("Number of items to show"),
  },
  async ({ username, limit }) => {
    const prof = await profile.loadProfile();
    const user = username ?? prof.username;
    if (!user) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No username provided. Set `username` in ~/.hn-profile.yaml or pass it as a parameter.",
          },
        ],
      };
    }

    const items = await api.getUserItems(user, limit);
    const lines: string[] = [];

    for (const item of items) {
      if (item.type === "story") {
        lines.push(
          `[story] ${item.title} — ${item.score ?? 0} pts, ${item.descendants ?? 0} comments`
        );
        lines.push(`  https://news.ycombinator.com/item?id=${item.id}`);
      } else if (item.type === "comment") {
        const text = item.text ? stripHtml(item.text).slice(0, 100) : "(no text)";
        const replies = item.kids?.length ?? 0;
        lines.push(
          `[comment] "${text}..." — ${replies} replies, ${timeAgo(item.time!)}`
        );
        lines.push(`  https://news.ycombinator.com/item?id=${item.id}`);
      }
      lines.push("");
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Recent activity for ${user}:\n\n${lines.join("\n")}`,
        },
      ],
    };
  }
);

// ── hn_digest ──────────────────────────────────────────────────────────
// The personalized daily briefing.

server.tool(
  "hn_digest",
  "Your personalized HN digest — stories matching your interests from ~/.hn-profile.yaml, plus activity from users you follow.",
  {
    count: z
      .number()
      .optional()
      .default(30)
      .describe("Number of top stories to scan"),
  },
  async ({ count }) => {
    const prof = await profile.loadProfile();
    const storyIds = await api.getTopStories();
    const stories = await api.getItems(storyIds.slice(0, count));

    const matched: { item: api.HNItem; keywords: string[]; topics: string[] }[] = [];
    const unmatched: api.HNItem[] = [];

    for (const item of stories) {
      if (!item || item.type !== "story") continue;
      const searchText = `${item.title ?? ""} ${item.url ?? ""} ${item.text ?? ""}`;
      const result = profile.matchesProfile(searchText, prof);
      if (result.matches) {
        matched.push({
          item,
          keywords: result.matchedKeywords,
          topics: result.matchedTopics,
        });
      } else {
        unmatched.push(item);
      }
    }

    const lines: string[] = [];

    if (prof.topics.length === 0 && prof.keywords.length === 0) {
      lines.push(
        "No interests configured. Create ~/.hn-profile.yaml with topics and keywords for a personalized digest.\n"
      );
      lines.push("## Top Stories\n");
      const topItems = stories
        .filter((i): i is api.HNItem => i !== null)
        .slice(0, 15);
      lines.push(formatStoryList(topItems));
    } else {
      if (matched.length > 0) {
        lines.push(`## Matching Your Interests (${matched.length} stories)\n`);
        for (const { item, keywords, topics } of matched) {
          const tags = [...topics, ...keywords].join(", ");
          lines.push(
            `- ${item.title} (${item.score ?? 0} pts, ${item.descendants ?? 0} comments) [${tags}]`
          );
          lines.push(
            `  https://news.ycombinator.com/item?id=${item.id}`
          );
        }
      } else {
        lines.push("No stories matching your interests right now.\n");
      }

      lines.push(`\n## Other Top Stories\n`);
      lines.push(formatStoryList(unmatched.slice(0, 10)));
    }

    // Follow activity
    if (prof.follow.length > 0) {
      lines.push(`\n## Activity from People You Follow\n`);
      for (const followUser of prof.follow.slice(0, 5)) {
        const items = await api.getUserItems(followUser, 5);
        const recent = items.filter(
          (i) => i.time && Date.now() / 1000 - i.time < 86400
        );
        if (recent.length > 0) {
          lines.push(`### ${followUser}`);
          for (const item of recent) {
            if (item.type === "comment") {
              const text = item.text ? stripHtml(item.text).slice(0, 80) : "";
              lines.push(`  - Comment: "${text}..." (${timeAgo(item.time!)})`);
              lines.push(
                `    https://news.ycombinator.com/item?id=${item.id}`
              );
            } else if (item.type === "story") {
              lines.push(
                `  - Story: ${item.title} (${item.score ?? 0} pts)`
              );
            }
          }
        }
      }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// ── hn_watch ───────────────────────────────────────────────────────────

server.tool(
  "hn_watch",
  "Watch a thread for new comments. Add, remove, or check watched threads.",
  {
    action: z
      .enum(["add", "remove", "check", "list"])
      .describe("Action to perform"),
    id: z.number().optional().describe("HN story ID (required for add/remove/check)"),
  },
  async ({ action, id }) => {
    if (action === "list") {
      const list = await profile.getWatchList();
      if (list.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No watched threads." }],
        };
      }
      const lines = list.map(
        (w) =>
          `- ${w.title} (added ${w.addedAt}${w.lastCommentCount !== undefined ? `, last seen: ${w.lastCommentCount} comments` : ""})\n  https://news.ycombinator.com/item?id=${w.id}`
      );
      return {
        content: [
          { type: "text" as const, text: `Watched threads:\n\n${lines.join("\n")}` },
        ],
      };
    }

    if (!id) {
      return {
        content: [{ type: "text" as const, text: "Please provide a story ID." }],
      };
    }

    if (action === "add") {
      const item = await api.getItem(id);
      if (!item) {
        return { content: [{ type: "text" as const, text: `Item ${id} not found.` }] };
      }
      await profile.addToWatchList({
        id,
        title: item.title ?? `Item ${id}`,
        addedAt: new Date().toISOString().split("T")[0],
        lastCommentCount: item.descendants ?? 0,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Now watching: "${item.title}" (${item.descendants ?? 0} comments)`,
          },
        ],
      };
    }

    if (action === "remove") {
      await profile.removeFromWatchList(id);
      return {
        content: [{ type: "text" as const, text: `Removed ${id} from watch list.` }],
      };
    }

    // check
    const item = await api.getItem(id);
    const watchList = await profile.getWatchList();
    const entry = watchList.find((w) => w.id === id);

    if (!item) {
      return { content: [{ type: "text" as const, text: `Item ${id} not found.` }] };
    }

    const currentComments = item.descendants ?? 0;
    const lastSeen = entry?.lastCommentCount ?? 0;
    const newComments = currentComments - lastSeen;

    if (entry) {
      await profile.updateWatchEntry(id, {
        lastChecked: new Date().toISOString(),
        lastCommentCount: currentComments,
      });
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `"${item.title}"\nTotal comments: ${currentComments}${newComments > 0 ? `\nNew since last check: ${newComments}` : "\nNo new comments."}\nhttps://news.ycombinator.com/item?id=${item.id}`,
        },
      ],
    };
  }
);

// ── hn_follow_activity ─────────────────────────────────────────────────

server.tool(
  "hn_follow_activity",
  "See recent activity from HN users you follow (defined in ~/.hn-profile.yaml).",
  {
    hours: z
      .number()
      .optional()
      .default(24)
      .describe("Look back this many hours (default 24)"),
  },
  async ({ hours }) => {
    const prof = await profile.loadProfile();
    if (prof.follow.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No users in your follow list. Add usernames to `follow` in ~/.hn-profile.yaml.",
          },
        ],
      };
    }

    const cutoff = Date.now() / 1000 - hours * 3600;
    const lines: string[] = [];

    for (const username of prof.follow) {
      const items = await api.getUserItems(username, 15);
      const recent = items.filter((i) => i.time && i.time > cutoff);

      if (recent.length > 0) {
        lines.push(`## ${username} (${recent.length} items in last ${hours}h)\n`);
        for (const item of recent) {
          if (item.type === "comment") {
            const text = item.text ? stripHtml(item.text).slice(0, 120) : "";
            lines.push(`- [comment] "${text}..."`);
            lines.push(
              `  https://news.ycombinator.com/item?id=${item.id}`
            );
          } else if (item.type === "story") {
            lines.push(
              `- [story] ${item.title} (${item.score ?? 0} pts, ${item.descendants ?? 0} comments)`
            );
            lines.push(
              `  https://news.ycombinator.com/item?id=${item.id}`
            );
          }
        }
        lines.push("");
      }
    }

    if (lines.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No activity from followed users in the last ${hours} hours.`,
          },
        ],
      };
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

// ── hn_who_is_hiring ───────────────────────────────────────────────────
// The killer feature. Parses the monthly hiring thread.

server.tool(
  "hn_who_is_hiring",
  'Search the latest "Who is hiring?" thread by keyword — tech stack, location, remote, company name. Never Ctrl+F through 500 comments again.',
  {
    query: z
      .string()
      .describe('Search terms (e.g., "remote TypeScript", "San Francisco AI")'),
    month: z
      .string()
      .optional()
      .describe("Month to search (e.g., 'April 2026'). Defaults to latest."),
  },
  async ({ query, month }) => {
    // Find the hiring thread via Algolia
    const searchMonth = month ?? "";
    const searchQuery = `Who is hiring? ${searchMonth}`.trim();
    const result = await api.searchByDate(searchQuery, "story", 0);

    const hiringThread = result.hits.find(
      (h) =>
        h.author === "whoishiring" &&
        h.title?.toLowerCase().includes("who is hiring")
    );

    if (!hiringThread) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Could not find a "Who is hiring?" thread${month ? ` for ${month}` : ""}. Try specifying the month.`,
          },
        ],
      };
    }

    const storyId = parseInt(hiringThread.objectID, 10);
    const story = await api.getItem(storyId);
    if (!story?.kids) {
      return {
        content: [{ type: "text" as const, text: "Hiring thread found but has no comments." }],
      };
    }

    // Fetch top-level job postings (up to 100)
    const jobComments = await api.getItems(story.kids.slice(0, 100));
    const lower = query.toLowerCase();

    const matches = jobComments.filter((c) => {
      if (!c || c.deleted || c.dead || !c.text) return false;
      return c.text.toLowerCase().includes(lower);
    }) as api.HNItem[];

    if (matches.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No job postings matching "${query}" in "${hiringThread.title}" (searched ${Math.min(story.kids.length, 100)} of ${story.kids.length} postings).`,
          },
        ],
      };
    }

    const lines = matches.slice(0, 15).map((c) => {
      const text = stripHtml(c.text!).slice(0, 300);
      return `---\n${text}...\nhttps://news.ycombinator.com/item?id=${c.id}`;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${matches.length} postings matching "${query}" in "${hiringThread.title}":\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  }
);

// ── hn_search ──────────────────────────────────────────────────────────

server.tool(
  "hn_search",
  "Search HN stories or comments via Algolia.",
  {
    query: z.string().describe("Search query"),
    type: z
      .enum(["stories", "comments"])
      .optional()
      .default("stories")
      .describe("Search stories or comments"),
    sort: z
      .enum(["relevance", "date"])
      .optional()
      .default("relevance")
      .describe("Sort by relevance or date"),
  },
  async ({ query, type, sort }) => {
    const isStory = type === "stories";
    const result =
      sort === "date"
        ? await api.searchByDate(query, isStory ? "story" : "comment")
        : isStory
          ? await api.searchStories(query)
          : await api.searchComments(query);

    if (result.hits.length === 0) {
      return {
        content: [{ type: "text" as const, text: `No results for "${query}".` }],
      };
    }

    const lines = result.hits.slice(0, 15).map((hit) => {
      if (isStory) {
        return `- ${hit.title} (${hit.points ?? 0} pts, ${hit.num_comments ?? 0} comments)\n  https://news.ycombinator.com/item?id=${hit.objectID}`;
      }
      const text = hit.comment_text
        ? stripHtml(hit.comment_text).slice(0, 150)
        : "";
      return `- [${hit.author}] "${text}..."\n  https://news.ycombinator.com/item?id=${hit.objectID}`;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `${result.nbHits} results for "${query}" (showing ${Math.min(15, result.hits.length)}):\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  }
);

// ── hn_top / hn_ask / hn_show ──────────────────────────────────────────

async function listStories(
  fetcher: () => Promise<number[]>,
  label: string,
  count: number
) {
  const ids = await fetcher();
  const items = await api.getItems(ids.slice(0, count));
  const valid = items.filter((i): i is api.HNItem => i !== null);
  return {
    content: [
      {
        type: "text" as const,
        text: `## ${label}\n\n${formatStoryList(valid)}`,
      },
    ],
  };
}

server.tool(
  "hn_top",
  "Get current top stories on Hacker News.",
  {
    count: z.number().optional().default(15).describe("Number of stories"),
  },
  async ({ count }) => listStories(api.getTopStories, "Top Stories", count)
);

server.tool(
  "hn_ask",
  "Get current Ask HN stories.",
  {
    count: z.number().optional().default(15).describe("Number of stories"),
  },
  async ({ count }) => listStories(api.getAskStories, "Ask HN", count)
);

server.tool(
  "hn_show",
  "Get current Show HN stories.",
  {
    count: z.number().optional().default(15).describe("Number of stories"),
  },
  async ({ count }) => listStories(api.getShowStories, "Show HN", count)
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
