import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  or,
  type QueryFilterConstraint,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import type { AdminProfile, SiteSettings, Song, SongRequest } from "@/types/song";
import { getFirebaseDb, hasFirebaseConfig } from "./client";

export const defaultSiteSettings: SiteSettings = {
  siteTitle: "로션욤 노래책",
  heroTitle: "오늘 뭐 불러욤?",
  heroSubtitle: "곡명, 가수, 분위기로 빠르게 찾고 좋아요로 저장하세요.",
  requestEnabled: true,
  copyCommandEnabled: true,
  announcement: "",
  updatedAt: "2026-07-02",
};

export function firebaseAvailable() {
  return hasFirebaseConfig() && Boolean(getFirebaseDb());
}

function cleanRecord<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export async function fetchSongsFromFirestore() {
  const db = getFirebaseDb();
  if (!db) return null;

  const snapshot = await getDocs(query(collection(db, "songs"), orderBy("createdAt", "desc"), limit(500)));
  const songs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Song);
  return songs;
}

export async function saveSongToFirestore(song: Song) {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase 설정이 필요합니다.");

  await setDoc(
    doc(db, "songs", song.id),
    cleanRecord({
      ...song,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export async function updateSongInFirestore(songId: string, patch: Partial<Song>) {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase 설정이 필요합니다.");

  await updateDoc(
    doc(db, "songs", songId),
    cleanRecord({
      ...patch,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export async function deleteSongFromFirestore(songId: string) {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase 설정이 필요합니다.");
  await deleteDoc(doc(db, "songs", songId));
}

export async function createSongRequestInFirestore(request: SongRequest) {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase 설정이 필요합니다.");

  const payload = cleanRecord({
    ...request,
    createdAt: request.createdAt || new Date().toISOString(),
    updatedAt: request.updatedAt || new Date().toISOString(),
    createdAtServer: serverTimestamp(),
  });

  if (request.id.startsWith("local-") || request.id.startsWith("U")) {
    const ref = await addDoc(collection(db, "songRequests"), payload);
    return ref.id;
  }

  await setDoc(doc(db, "songRequests", request.id), payload);
  return request.id;
}

export async function fetchSongRequestsFromFirestore() {
  const db = getFirebaseDb();
  if (!db) return null;

  const snapshot = await getDocs(query(collection(db, "songRequests"), orderBy("createdAt", "desc"), limit(500)));
  return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as SongRequest);
}

export async function updateSongRequestInFirestore(requestId: string, patch: Partial<SongRequest>) {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase 설정이 필요합니다.");

  const payload = cleanRecord({
    ...patch,
    updatedAt: new Date().toISOString(),
  });

  try {
    await updateDoc(doc(db, "songRequests", requestId), payload);
    return;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "not-found") throw error;
  }

  const snapshot = await getDocs(query(collection(db, "songRequests"), where("id", "==", requestId), limit(1)));
  if (!snapshot.docs.length) throw new Error("Song request document not found");
  await updateDoc(snapshot.docs[0].ref, payload);
}

export async function deleteSongRequestFromFirestore(requestId: string) {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase 설정이 필요합니다.");

  try {
    await deleteDoc(doc(db, "songRequests", requestId));
    return;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "not-found") throw error;
  }

  const snapshot = await getDocs(query(collection(db, "songRequests"), where("id", "==", requestId), limit(1)));
  if (!snapshot.docs.length) return;
  await deleteDoc(snapshot.docs[0].ref);
}

export async function fetchSiteSettings() {
  const db = getFirebaseDb();
  if (!db) return defaultSiteSettings;

  const snapshot = await getDoc(doc(db, "siteSettings", "main"));
  if (!snapshot.exists()) return defaultSiteSettings;
  return { ...defaultSiteSettings, ...snapshot.data() } as SiteSettings;
}

export async function saveSiteSettings(settings: SiteSettings) {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase 설정이 필요합니다.");

  await setDoc(
    doc(db, "siteSettings", "main"),
    cleanRecord({
      ...settings,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export async function fetchAdminProfile(uid: string) {
  const db = getFirebaseDb();
  if (!db) return null;

  const snapshot = await getDoc(doc(db, "admins", uid));
  if (!snapshot.exists()) return null;
  return { uid, ...snapshot.data() } as AdminProfile;
}

export async function fetchAdminProfileByIdentity(identity: { uid?: string | null; googleId?: string | null; email?: string | null }) {
  const db = getFirebaseDb();
  if (!db) return null;

  const directId = identity.uid?.trim();
  const normalizedEmail = identity.email?.trim().toLowerCase();
  if (directId) {
    const direct = await fetchAdminProfile(directId);
    if (direct) return direct;
  }

  const filters: QueryFilterConstraint[] = [];
  if (normalizedEmail) filters.push(where("email", "==", normalizedEmail));
  if (identity.googleId?.trim()) filters.push(where("googleId", "==", identity.googleId.trim()));

  if (!filters.length) return null;

  const snapshot = await getDocs(query(collection(db, "admins"), or(...filters), limit(1)));
  if (!snapshot.docs.length) return null;
  const matched = snapshot.docs[0];
  return { uid: matched.id, ...matched.data() } as AdminProfile;
}

export async function saveAdminProfile(profile: AdminProfile) {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase 설정이 필요합니다.");

  await setDoc(
    doc(db, "admins", profile.uid),
    cleanRecord({
      ...profile,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export async function fetchAdminProfiles() {
  const db = getFirebaseDb();
  if (!db) return null;

  const snapshot = await getDocs(query(collection(db, "admins"), orderBy("createdAt", "desc"), limit(200)));
  return snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }) as AdminProfile);
}
