/**
 * User profile and personalization.
 * Reads ~/.hn-profile.yaml for interests, follows, and watched threads.
 * All state is local — no server, no telemetry.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";

// ── Types ──────────────────────────────────────────────────────────────

export interface HNProfile {
  username?: string;
  topics: string[];
  keywords: string[];
  follow: string[];
  watching: number[];
}

// ── Paths ──────────────────────────────────────────────────────────────

const PROFILE_PATH = join(homedir(), ".hn-profile.yaml");
const DATA_DIR = join(homedir(), ".hn-mcp");
const WATCH_PATH = join(DATA_DIR, "watching.json");
const SEEN_PATH = join(DATA_DIR, "seen-replies.json");

// ── Profile ────────────────────────────────────────────────────────────

const DEFAULT_PROFILE: HNProfile = {
  topics: [],
  keywords: [],
  follow: [],
  watching: [],
};

export async function loadProfile(): Promise<HNProfile> {
  try {
    const raw = await readFile(PROFILE_PATH, "utf-8");
    const parsed = YAML.parse(raw) as Partial<HNProfile>;
    return {
      username: parsed.username,
      topics: parsed.topics ?? [],
      keywords: parsed.keywords ?? [],
      follow: parsed.follow ?? [],
      watching: parsed.watching ?? [],
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function getProfilePath(): string {
  return PROFILE_PATH;
}

// ── Watch list (persistent) ────────────────────────────────────────────

export interface WatchEntry {
  id: number;
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
  if (list.some((w) => w.id === entry.id)) return;
  list.push(entry);
  await writeFile(WATCH_PATH, JSON.stringify(list, null, 2));
}

export async function removeFromWatchList(id: number): Promise<void> {
  const list = await getWatchList();
  const filtered = list.filter((w) => w.id !== id);
  await writeFile(WATCH_PATH, JSON.stringify(filtered, null, 2));
}

export async function updateWatchEntry(
  id: number,
  updates: Partial<WatchEntry>
): Promise<void> {
  const list = await getWatchList();
  const entry = list.find((w) => w.id === id);
  if (entry) {
    Object.assign(entry, updates);
    await writeFile(WATCH_PATH, JSON.stringify(list, null, 2));
  }
}

// ── Seen replies tracking ──────────────────────────────────────────────

export async function getSeenReplies(): Promise<Set<number>> {
  try {
    const raw = await readFile(SEEN_PATH, "utf-8");
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

export async function markRepliesSeen(ids: number[]): Promise<void> {
  await ensureDataDir();
  const seen = await getSeenReplies();
  for (const id of ids) seen.add(id);
  // Keep only last 5000 to prevent unbounded growth
  const arr = [...seen].slice(-5000);
  await writeFile(SEEN_PATH, JSON.stringify(arr));
}

// ── Matching ───────────────────────────────────────────────────────────

export function matchesProfile(
  text: string,
  profile: HNProfile
): { matches: boolean; matchedKeywords: string[]; matchedTopics: string[] } {
  const lower = text.toLowerCase();
  const matchedKeywords = profile.keywords.filter((kw) =>
    lower.includes(kw.toLowerCase())
  );
  const matchedTopics = profile.topics.filter((topic) =>
    lower.includes(topic.toLowerCase().replace(/-/g, " "))
  );
  return {
    matches: matchedKeywords.length > 0 || matchedTopics.length > 0,
    matchedKeywords,
    matchedTopics,
  };
}
