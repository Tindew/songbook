export type SongStatus = "available" | "practice" | "condition" | "blocked" | "special";

export type ThumbnailSource = "youtube" | "manual" | "pending" | "default";

export type Song = {
  id: string;
  title: string;
  artist: string;
  aliases: string[];
  tags: string[];
  genres: string[];
  status: SongStatus;
  difficulty: 1 | 2 | 3;
  memo?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  thumbnailUrl?: string;
  thumbnailSource: ThumbnailSource;
  thumbnailConfidence: number;
  requestCommand: string;
  likeCount: number;
  isFeatured: boolean;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SongRequest = {
  id: string;
  title: string;
  artist: string;
  youtubeUrl?: string;
  reason?: string;
  nickname?: string;
  tags: string[];
  status: "pending" | "approved" | "rejected";
  selectedThumbnailTitle?: string;
  selectedThumbnailChannel?: string;
  selectedThumbnailConfidence?: number;
  createdAt: string;
  updatedAt?: string;
  approvedSongId?: string;
};

export type SortOption = "recent" | "title" | "artist" | "likes" | "difficulty" | "random";

export type ViewMode = "card" | "compact";

export type YoutubeCandidate = {
  id: string;
  title: string;
  channelTitle: string;
  confidence: number;
  official: boolean;
  gradientSeed: string;
};
