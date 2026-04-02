/**
 * User profile and personalization.
 * Reads ~/.devfeed.yaml for interests, follows, and platform accounts.
 * All state is local — no server, no telemetry.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";

// ── Types ──────────────────────────────────────────────────────────────

export interface DevfeedProfile {
  // Platform usernames
  hackernews?: string;
  lobsters?: string;
  reddit?: string;
  devto?: string;

  // Interest matching
  topics: string[];
  keywords: string[];

  // HN-specific
  hn_follow: string[];

  // Reddit subreddits to monitor
  subreddits: string[];

  // Dev.to tags to follow
  devto_tags: string[];
}

// ── Paths ──────────────────────────────────────────────────────────────

const PROFILE_PATH = join(homedir(), ".devfeed.yaml");
const LEGACY_PROFILE_PATH = join(homedir(), ".hn-profile.yaml");
const DATA_DIR = join(homedir(), ".devfeed");
const WATCH_PATH = join(DATA_DIR, "watching.json");
const SEEN_PATH = join(DATA_DIR, "seen-replies.json");

// ── Profile ────────────────────────────────────────────────────────────

const DEFAULT_PROFILE: DevfeedProfile = {
  topics: [],
  keywords: [],
  hn_follow: [],
  subreddits: [],
  devto_tags: [],
};

export async function loadProfile(): Promise<DevfeedProfile> {
  // Try new path first, fall back to legacy
  for (const path of [PROFILE_PATH, LEGACY_PROFILE_PATH]) {
    try {
      const raw = await readFile(path, "utf-8");
      const p = YAML.parse(raw) as Record<string, any>;
      return {
        hackernews: p.hackernews ?? p.username,
        lobsters: p.lobsters,
        reddit: p.reddit,
        devto: p.devto,
        topics: p.topics ?? [],
        keywords: p.keywords ?? [],
        hn_follow: p.hn_follow ?? p.follow ?? [],
        subreddits: p.subreddits ?? [],
        devto_tags: p.devto_tags ?? [],
      };
    } catch {
      continue;
    }
  }
  return { ...DEFAULT_PROFILE };
}

export function getProfilePath(): string {
  return PROFILE_PATH;
}

// ── Watch list (persistent) ────────────────────────────────────────────

export interface WatchEntry {
  source: "hackernews" | "lobsters" | "reddit" | "devto";
  id: string; // string to support all platforms
  title: string;
  addedAt: string;
  lastChecked?: string;
  lastCommentCount?: number;
}

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

export async function getWatchList(): Promise<WatchEntry[]> {
  try {
    const raw = await readFile(WATCH_PATH, "utf-8");
    return JSON.parse(raw) as WatchEntry[];
  } catch {
    return [];
  }
}

export async function addToWatchList(entry: WatchEntry): Promise<void> {
  await ensureDataDir();
  const list = await getWatchList();
  if (list.some((w) => w.source === entry.source && w.id === entry.id)) return;
  list.push(entry);
  await writeFile(WATCH_PATH, JSON.stringify(list, null, 2));
}

export async function removeFromWatchList(
  source: string,
  id: string
): Promise<void> {
  const list = await getWatchList();
  const filtered = list.filter((w) => !(w.source === source && w.id === id));
  await writeFile(WATCH_PATH, JSON.stringify(filtered, null, 2));
}

export async function updateWatchEntry(
  source: string,
  id: string,
  updates: Partial<WatchEntry>
): Promise<void> {
  const list = await getWatchList();
  const entry = list.find((w) => w.source === source && w.id === id);
  if (entry) {
    Object.assign(entry, updates);
    await writeFile(WATCH_PATH, JSON.stringify(list, null, 2));
  }
}

// ── Seen replies tracking ──────────────────────────────────────────────

export async function getSeenReplies(): Promise<Set<string>> {
  try {
    const raw = await readFile(SEEN_PATH, "utf-8");
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export async function markRepliesSeen(ids: string[]): Promise<void> {
  await ensureDataDir();
  const seen = await getSeenReplies();
  for (const id of ids) seen.add(id);
  const arr = [...seen].slice(-5000);
  await writeFile(SEEN_PATH, JSON.stringify(arr));
}

// ── Matching ───────────────────────────────────────────────────────────

export function matchesProfile(
  text: string,
  prof: DevfeedProfile
): { matches: boolean; matchedKeywords: string[]; matchedTopics: string[] } {
  const lower = text.toLowerCase();
  const matchedKeywords = prof.keywords.filter((kw) =>
    lower.includes(kw.toLowerCase())
  );
  const matchedTopics = prof.topics.filter((topic) =>
    lower.includes(topic.toLowerCase().replace(/-/g, " "))
  );
  return {
    matches: matchedKeywords.length > 0 || matchedTopics.length > 0,
    matchedKeywords,
    matchedTopics,
  };
}
