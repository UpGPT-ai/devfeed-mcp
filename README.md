# hn-mcp

**An AI-powered reader for Hacker News.** Like an RSS reader, but for HN — and your AI assistant does the reading for you.

HN hasn't changed in 18 years. No notifications. No way to follow threads. No digest. No way to filter the monthly "Who is hiring?" thread without Ctrl+F.

This MCP server wraps the [official HN API](https://github.com/HackerNews/API) and [Algolia Search](https://hn.algolia.com/) so your AI assistant (Claude, Cursor, Windsurf, etc.) can help you keep up with the conversations that matter to you.

## Quick Start

### Claude Code / Claude Desktop

```bash
claude mcp add hn-mcp -- npx hn-mcp
```

### Manual (any MCP client)

```json
{
  "mcpServers": {
    "hn-mcp": {
      "command": "npx",
      "args": ["hn-mcp"]
    }
  }
}
```

That's it. No API keys, no accounts, no config required.

## What Can It Do?

### Reply Notifications

HN has no notifications. This is the most-requested feature in HN history. Now you have it.

```
> Check my HN replies

2 new replies for gbibas:

[sebmellen | 2h ago] on your comment about agent sandboxing:
  "Interesting approach with the worktrees..."
  https://news.ycombinator.com/item?id=12345

[dandaka | 1h ago] on your comment about MCP vs CLI:
  "Good point about discovery..."
  https://news.ycombinator.com/item?id=12346
```

### Personalized Digest

Define your interests in `~/.hn-profile.yaml` and get a curated feed instead of scanning 60 stories.

```
> What's on HN for me today?

Matching Your Interests (4 stories):
- Claude Code Unpacked (994 pts, 353 comments) [ai-agents, mcp]
- Axios compromised on NPM (1900 pts, 780 comments) [supply-chain-security]
- Show HN: Zerobox – Sandbox any command (63 pts, 66 comments) [developer-tools]

Activity from People You Follow:
- tptacek commented on "Axios compromised" (3 comments)
```

### Who is Hiring? Filter

The monthly hiring thread has 500+ comments. Stop Ctrl+F'ing.

```
> Search Who is Hiring for remote TypeScript AI

Found 12 postings matching "remote TypeScript AI":

---
Acme Corp | Remote (US) | Senior Full-Stack Engineer | TypeScript, React, AI/ML
We're building AI-powered developer tools...
https://news.ycombinator.com/item?id=12347
```

### Thread Intelligence

Understand a 300-comment thread before diving in.

```
> Summarize the Claude Code thread

"Claude Code Unpacked" — 994 pts, 353 comments

Most Discussed Comments (by reply count):
- [amangsingh] (15 replies): "500K LOC proves LLMs struggle with determinism..."
- [troupo] (12 replies): "A TUI wrapper should need 20-50K LOC max..."

Most Active Participants:
- amangsingh (3 top-level comments)
- troupo (2 top-level comments)
```

### Everything Else

| Tool | What It Does |
|------|-------------|
| `hn_replies` | Check for replies to your comments |
| `hn_digest` | Stories matching your interests + followed users' activity |
| `hn_who_is_hiring` | Search the monthly hiring thread by keyword |
| `hn_thread` | Full comment tree for any story |
| `hn_thread_summary` | Key participants and most-discussed comments |
| `hn_thread_search` | Search within a specific thread |
| `hn_watch` | Track threads for new comments |
| `hn_follow_activity` | Recent activity from users you follow |
| `hn_top` | Current top stories |
| `hn_ask` | Current Ask HN stories |
| `hn_show` | Current Show HN stories |
| `hn_story` | Get a single story's details |
| `hn_user` | Look up a user's public profile |
| `hn_my_activity` | Your recent comments and submissions |
| `hn_search` | Search stories or comments via Algolia |

## Personalization

Create `~/.hn-profile.yaml` to personalize your experience:

```yaml
# Your HN username (used for replies and activity)
username: your-hn-username

# Topics you care about
topics:
  - ai-agents
  - developer-tools
  - open-source
  - saas
  - startup-bootstrapping

# Specific keywords to match
keywords:
  - "Claude Code"
  - "MCP server"
  - "Chrome extension"
  - TypeScript
  - Supabase

# Users whose comments you want to follow
follow:
  - tptacek
  - patio11
  - dang

# Threads you're watching (add via hn_watch tool)
watching: []
```

All data is stored locally in `~/.hn-mcp/`. No server, no telemetry, no account required.

## Why This Exists

I've had an HN account since 2011. In that time, the reading experience hasn't changed. I wanted to actually engage in conversations without spending an hour scanning threads and manually refreshing `/threads` to check for replies.

This gives my AI assistant read access to HN so I can focus on the conversations, not on finding them.

## Tech

- TypeScript, ~600 lines
- [HN Firebase API](https://github.com/HackerNews/API) (no auth, no rate limits)
- [Algolia HN Search](https://hn.algolia.com/api) for full-text search
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Zero config to start, `~/.hn-profile.yaml` for personalization
- All state stored locally in `~/.hn-mcp/`

## License

MIT

---

Built by [Greg Bibas](https://upgpt.ai)
