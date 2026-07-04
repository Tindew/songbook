import { collection, doc, getDocs, increment, query, runTransaction, where } from "firebase/firestore";
import { getFirebaseDb } from "./client";

function likeDocId(userId: string, songId: string) {
  return `${userId}__${songId}`;
}

/** 현재 유저가 좋아요한 곡 id 집합을 불러온다. */
export async function fetchUserLikedSongIds(userId: string) {
  const db = getFirebaseDb();
  if (!db) return new Set<string>();

  const snapshot = await getDocs(query(collection(db, "userLikes"), where("userId", "==", userId)));
  return new Set(snapshot.docs.map((item) => (item.data() as { songId: string }).songId));
}

/**
 * 유저별 좋아요를 토글하면서 곡의 누적 좋아요 수를 원자적으로 증감한다.
 * 이미 눌러둔 상태에서 다시 눌러도(중복) 카운트가 어긋나지 않도록 트랜잭션으로 처리한다.
 */
export async function setSongLike(userId: string, songId: string, liked: boolean) {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase 설정이 필요합니다.");

  const likeRef = doc(db, "userLikes", likeDocId(userId, songId));
  const songRef = doc(db, "songs", songId);

  await runTransaction(db, async (tx) => {
    const likeSnap = await tx.get(likeRef);
    const exists = likeSnap.exists();
    const now = new Date().toISOString();

    if (liked && !exists) {
      tx.set(likeRef, { userId, songId, createdAt: now });
      tx.update(songRef, { likeCount: increment(1), updatedAt: now });
    } else if (!liked && exists) {
      tx.delete(likeRef);
      tx.update(songRef, { likeCount: increment(-1), updatedAt: now });
    }
  });
}
