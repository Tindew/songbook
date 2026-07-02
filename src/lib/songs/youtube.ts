export function extractYoutubeVideoId(url: string) {
  if (!url.trim()) return "";

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "").slice(0, 11);
    }

    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.split("/")[2]?.slice(0, 11) ?? "";
    }

    return parsed.searchParams.get("v")?.slice(0, 11) ?? "";
  } catch {
    const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    return match?.[1] ?? "";
  }
}

export function youtubeThumbnailUrl(videoId: string, quality = "hqdefault") {
  if (!videoId) return "";
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}
