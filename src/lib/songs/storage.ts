import { seedSongs } from "@/data/seedSongs";
import type { Song, SongRequest } from "@/types/song";

const SONGS_KEY = "losionyom-songbook-songs";
const LIKES_KEY = "losionyom-songbook-favorites";
const REQUESTS_KEY = "losionyom-songbook-requests";

export function loadSongs() {
  if (typeof window === "undefined") return seedSongs;

  try {
    const raw = window.localStorage.getItem(SONGS_KEY);
    if (!raw) return seedSongs;
    const parsed = JSON.parse(raw) as Song[];
    return Array.isArray(parsed) && parsed.length ? parsed : seedSongs;
  } catch {
    return seedSongs;
  }
}

export function saveSongs(songs: Song[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SONGS_KEY, JSON.stringify(songs));
}

export function loadLikedIds() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(LIKES_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(parsed);
  } catch {
    return new Set<string>();
  }
}

export function saveLikedIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIKES_KEY, JSON.stringify(Array.from(ids)));
}

export function loadRequests() {
  if (typeof window === "undefined") return [] as SongRequest[];

  try {
    const raw = window.localStorage.getItem(REQUESTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as SongRequest[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRequests(requests: SongRequest[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
}
