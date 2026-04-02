# devfeed-mcp

**A personalized dev community reader for AI assistants.** Like RSS, but for Hacker News, Lobsters, Reddit, and Dev.to — and your AI does the reading for you.

Define your interests once, then ask your AI assistant what's happening across all your communities in a single conversation.

## Quick Start

### Claude Code / Claude Desktop

```bash
claude mcp add devfeed-mcp -- npx devfeed-mcp
```

### Manual (any MCP client)

```json
{
  "mcpServers": {
    "devfeed-mcp": {
      "command": "npx",
      "args": ["devfeed-mcp"]
    }
  }
}
```

No API keys. No accounts. No config required to start.

## What Can It Do?

### Unified Digest Across All Sources

```
> What's interesting in my dev communities today?

## Hacker News
- **Claude Code Unpacked** (994 pts, 353 comments) [ai-agents, mcp]
- **Axios compromised on NPM** (1900 pts, 780 comments) [supply-chain-security]

## Lobsters
- Rust 2026 Edition stabilized (42 pts, 18 comments) [rust, programming]

## Reddit
- Show: I built an MCP server for... (342 pts, 89 comments, r/ClaudeAI) [MCP server]

## Dev.to
- Building AI Agents with TypeScript (156 reactions, 23 comments) [ai, typescript]
```

### HN Reply Notifications

HN has no notifications. This is the most-requested feature in HN history.

```
> Check my HN replies

2 new replies for gbibas:

[simonw | 2h ago] on your comment about agent sandboxing:
  "Interesting approach with the worktrees..."
```

### Who is Hiring? Filter

The monthly HN hiring thread has 500+ comments. Stop Ctrl+F'ing.

```
> Search Who is Hiring for remote TypeScript

Found 12 postings matching "remote TypeScript":

Acme Corp | Remote (US) | Senior Full-Stack Engineer | TypeScript, React
We're building AI-powered developer tools...
```

### Cross-Platform Search

```
> Search all communities for "MCP server"

## Hacker News
- Show HN: Real-time dashboard for Claude Code agent teams (55 pts)

## Lobsters
- MCP protocol deep dive (28 pts, 12 comments)

## Reddit
- Anyone using MCP servers in production? (89 pts, r/ClaudeAI)

## Dev.to
- How to Build Your First MCP Server (42 reactions)
```

### Thread Intelligence

Understand a 300-comment thread before diving in.

```
> Summarize the Claude Code thread

"Claude Code Unpacked" — 994 pts, 353 comments

Most Discussed Comments (by reply count):
- [amangsingh] (15 replies): "500K LOC proves LLMs struggle..."
- [troupo] (12 replies): "A TUI wrapper should need 20-50K LOC..."
```

## All Tools

### Unified (cross-platform)
| Tool | What It Does |
|------|-------------|
| `feed_digest` | Personalized digest across all sources |
| `feed_search` | Search all platforms at once |

### Hacker News
| Tool | What It Does |
|------|-------------|
| `hn_replies` | Reply notifications (the missing feature) |
| `hn_top` / `hn_ask` / `hn_show` | Story listings |
| `hn_thread` | Full comment tree |
| `hn_thread_summary` | Key participants and debates |
| `hn_thread_search` | Search within a thread |
| `hn_who_is_hiring` | Filter the hiring thread |
| `hn_my_activity` | Your recent comments/submissions |
| `hn_user` | User profile lookup |
| `hn_story` | Story details |
| `hn_search` | Search via Algolia |

### Lobsters
| Tool | What It Does |
|------|-------------|
| `lobsters_hot` / `lobsters_newest` | Story listings |
| `lobsters_thread` | Story comments |
| `lobsters_tag` | Stories by tag |

### Reddit
| Tool | What It Does |
|------|-------------|
| `reddit_subreddit` | Posts from any subreddit |
| `reddit_thread` | Post + comments |
| `reddit_search` | Search posts |

### Dev.to
| Tool | What It Does |
|------|-------------|
| `devto_top` / `devto_latest` | Article listings |
| `devto_tag` | Articles by tag |
| `devto_thread` | Article + comments |

## Personalization

Create `~/.devfeed.yaml` to personalize your experience:

```yaml
# Platform usernames
hackernews: your-hn-username
reddit: your-reddit-username

# Topics (matched across all sources)
topics:
  - ai-agents
  - developer-tools
  - open-source

# Keywords to match in titles
keywords:
  - "Claude Code"
  - "MCP server"
  - TypeScript

# HN users to follow
hn_follow:
  - tptacek
  - patio11

# Reddit subreddits for your digest
subreddits:
  - programming
  - ClaudeAI
  - LocalLLaMA

# Dev.to tags
devto_tags:
  - ai
  - typescript
```

See [example.devfeed.yaml](example.devfeed.yaml) for a full example.

All data stored locally in `~/.devfeed/`. No server, no telemetry.

## Why This Exists

I've had accounts on these platforms for years. The reading experience across all of them is fragmented — different UIs, no unified notifications, no way to filter by what I actually care about.

This gives my AI assistant read access to all my dev communities so I can stay on top of conversations without context-switching between four browser tabs.

## Tech

- TypeScript
- [HN Firebase API](https://github.com/HackerNews/API) + [Algolia Search](https://hn.algolia.com/api)
- [Lobsters JSON API](https://lobste.rs)
- [Reddit Public JSON API](https://www.reddit.com/dev/api/)
- [Dev.to Forem API](https://developers.forem.com/api/v1)
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Zero external auth required
- All state stored locally

## License

MIT

---

Built by [Greg Bibas](https://upgpt.ai)
