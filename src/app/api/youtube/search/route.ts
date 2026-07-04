import { NextResponse } from "next/server";
import type { YoutubeCandidate } from "@/types/song";
import { youtubeThumbnailUrl, youtubeWatchUrl } from "@/lib/songs/youtube";

type SearchBody = {
  title?: string;
  artist?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SearchBody;
  const title = body.title?.trim() ?? "";
  const artist = body.artist?.trim() ?? "";

  if (!title && !artist) {
    return NextResponse.json({ candidates: [] });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ candidates: stubCandidates(title, artist), source: "stub" });
  }

  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "5",
    q: [artist, title, "official"].filter(Boolean).join(" "),
    key: apiKey,
  });

  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`, {
    next: { revalidate: 60 * 60 },
  });

  if (!response.ok) {
    return NextResponse.json(
      { candidates: stubCandidates(title, artist), source: "stub", error: "youtube_api_failed" },
      { status: 200 },
    );
  }

  const data = (await response.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
      };
    }>;
  };

  const candidates = (data.items ?? [])
    .map((item, index): YoutubeCandidate | null => {
      const videoId = item.id?.videoId;
      if (!videoId) return null;
      const candidateTitle = decodeHtml(item.snippet?.title ?? `${artist} - ${title}`);
      const channelTitle = decodeHtml(item.snippet?.channelTitle ?? "YouTube");
      const official = /official|공식|vevo/i.test(`${candidateTitle} ${channelTitle}`);

      return {
        id: videoId,
        videoId,
        title: candidateTitle,
        channelTitle,
        youtubeUrl: youtubeWatchUrl(videoId),
        thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url ?? youtubeThumbnailUrl(videoId),
        confidence: Math.max(62, 94 - index * 8 + (official ? 4 : 0)),
        official,
        gradientSeed: `${videoId}-${candidateTitle}`,
      };
    })
    .filter((item): item is YoutubeCandidate => Boolean(item));

  return NextResponse.json({ candidates, source: "youtube" });
}

function stubCandidates(title: string, artist: string) {
  const safeTitle = title || "제목";
  const safeArtist = artist || "가수";
  return [
    {
      id: "stub-official",
      title: `[Official] ${safeArtist} - ${safeTitle}`,
      channelTitle: `${safeArtist} 공식`,
      confidence: 86,
      official: true,
      gradientSeed: `${safeTitle}-${safeArtist}-official`,
    },
    {
      id: "stub-live",
      title: `${safeTitle} Live Clip`,
      channelTitle: "YOM MUSIC",
      confidence: 74,
      official: false,
      gradientSeed: `${safeTitle}-${safeArtist}-live`,
    },
    {
      id: "stub-audio",
      title: `${safeArtist} - ${safeTitle} Audio`,
      channelTitle: "음악 아카이브",
      confidence: 66,
      official: false,
      gradientSeed: `${safeTitle}-${safeArtist}-audio`,
    },
  ] satisfies YoutubeCandidate[];
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
