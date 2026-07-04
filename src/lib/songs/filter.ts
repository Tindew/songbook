import type { Song, SortOption } from "@/types/song";
import { getChosung, normalizeText } from "./normalize";

type FilterInput = {
  songs: Song[];
  likedIds: Set<string>;
  query: string;
  activeTag: string;
  likedOnly: boolean;
  sort: SortOption;
};

export function filterAndSortSongs(input: FilterInput) {
  const query = normalizeText(input.query);

  const filtered = input.songs.filter((song) => {
    if (song.isHidden) return false;
    if (input.likedOnly && !input.likedIds.has(song.id)) return false;
    if (input.activeTag !== "전체" && !song.tags.includes(input.activeTag)) {
      return false;
    }

    if (!query) return true;

    const haystack = normalizeText(
      [
        song.title,
        song.artist,
        ...song.aliases,
        ...song.tags,
        getChosung(`${song.title} ${song.artist}`),
      ].join(" "),
    );

    return haystack.includes(query);
  });

  if (input.sort === "random") {
    return filtered
      .map((song) => ({ song, seed: Math.random() }))
      .sort((a, b) => a.seed - b.seed)
      .map(({ song }) => song);
  }

  return filtered.slice().sort((a, b) => {
    if (input.sort === "title") return a.title.localeCompare(b.title, "ko");
    if (input.sort === "artist") return a.artist.localeCompare(b.artist, "ko");
    if (input.sort === "likes") {
      const aLike = a.likeCount + (input.likedIds.has(a.id) ? 1 : 0);
      const bLike = b.likeCount + (input.likedIds.has(b.id) ? 1 : 0);
      return bLike - aLike;
    }
    if (input.sort === "difficulty") return b.difficulty - a.difficulty;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
