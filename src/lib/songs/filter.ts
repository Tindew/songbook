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

  const byRecent = (a: Song, b: Song) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

  return filtered.slice().sort((a, b) => {
    if (input.sort === "title") return a.title.localeCompare(b.title, "ko");
    if (input.sort === "artist") return a.artist.localeCompare(b.artist, "ko");
    if (input.sort === "likes") {
      // 누적 좋아요가 많은 순. 동점(좋아요 0 포함)이면 최신 등록순.
      return (b.likeCount - a.likeCount) || byRecent(a, b);
    }
    if (input.sort === "difficulty") return b.difficulty - a.difficulty;
    return byRecent(a, b);
  });
}
