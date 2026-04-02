/**
 * Text formatters for presenting HN data in MCP tool responses.
 */

import type { HNItem, HNUser, CommentNode } from "./sources/hackernews.js";

export function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<p>/g, "\n\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<a\s+href="([^"]*)"[^>]*>[^<]*<\/a>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .trim();
}

export function formatStory(item: HNItem): string {
  const parts: string[] = [];
  parts.push(`# ${item.title ?? "(no title)"}`);
  parts.push(`Score: ${item.score ?? 0} | Comments: ${item.descendants ?? 0} | By: ${item.by ?? "unknown"} | ${item.time ? timeAgo(item.time) : ""}`);
  if (item.url) parts.push(`URL: ${item.url}`);
  parts.push(`HN: https://news.ycombinator.com/item?id=${item.id}`);
  if (item.text) parts.push(`\n${stripHtml(item.text)}`);
  return parts.join("\n");
}

export function formatComment(item: HNItem, indent = 0): string {
  const prefix = "  ".repeat(indent);
  const by = item.by ?? "unknown";
  const time = item.time ? timeAgo(item.time) : "";
  const text = item.text ? stripHtml(item.text) : "(deleted)";
  return `${prefix}[${by} | ${time}]\n${prefix}${text.split("\n").join(`\n${prefix}`)}`;
}

export function formatCommentTree(node: CommentNode, indent = 0): string {
  const lines: string[] = [];
  if (node.item.type === "comment") {
    lines.push(formatComment(node.item, indent));
    lines.push("");
  }
  for (const child of node.children) {
    lines.push(formatCommentTree(child, indent + 1));
  }
  return lines.join("\n");
}

export function formatUser(user: HNUser): string {
  const created = new Date(user.created * 1000).toISOString().split("T")[0];
  const parts: string[] = [];
  parts.push(`# ${user.id}`);
  parts.push(`Karma: ${user.karma} | Member since: ${created}`);
  if (user.about) parts.push(`\nAbout: ${stripHtml(user.about)}`);
  parts.push(`\nProfile: https://news.ycombinator.com/user?id=${user.id}`);
  return parts.join("\n");
}

export function formatStoryList(items: HNItem[]): string {
  return items
    .map((item, i) => {
      const score = item.score ?? 0;
      const comments = item.descendants ?? 0;
      const time = item.time ? timeAgo(item.time) : "";
      return `${i + 1}. ${item.title} (${score} pts, ${comments} comments, ${time})\n   https://news.ycombinator.com/item?id=${item.id}${item.url ? `\n   ${item.url}` : ""}`;
    })
    .join("\n\n");
}
