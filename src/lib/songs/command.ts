import type { Song } from "@/types/song";

/**
 * 노래 신청 문구를 생성한다.
 * 저장된 requestCommand 값(구 포맷 포함)에 의존하지 않고 항상 최신 포맷으로 계산한다.
 */
export function buildRequestCommand(song: Pick<Song, "artist" | "title">) {
  return `노래 신청 : ${song.artist} - ${song.title}`;
}
