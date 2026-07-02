import type { AdminProfile } from "@/types/song";
import type { User } from "firebase/auth";
import { naverProviderId } from "@/lib/firebase/auth";

export type NaverAdminSession = {
  firebaseUid?: string;
  naverId: string;
  displayName: string;
  email?: string;
  loggedInAt: string;
};

const SESSION_KEY = "losionyom_naver_admin_session";
const LOCAL_ADMINS_KEY = "losionyom_local_admin_ids";

export const defaultNaverAdminId = process.env.NEXT_PUBLIC_DEFAULT_NAVER_ADMIN_ID || "default-admin";

export function loginWithDefaultNaverAdmin(): NaverAdminSession {
  const session = {
    naverId: defaultNaverAdminId,
    displayName: "기본 관리자",
    loggedInAt: new Date().toISOString(),
  };

  saveNaverAdminSession(session);
  return session;
}

export function naverSessionFromFirebaseUser(user: User): NaverAdminSession {
  const providerProfile = user.providerData.find((profile) => profile.providerId === naverProviderId);

  return {
    firebaseUid: user.uid,
    naverId: providerProfile?.uid || user.uid,
    displayName: providerProfile?.displayName || user.displayName || "네이버 관리자",
    email: providerProfile?.email || user.email || undefined,
    loggedInAt: new Date().toISOString(),
  };
}

export function loadNaverAdminSession() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as NaverAdminSession) : null;
  } catch {
    return null;
  }
}

export function saveNaverAdminSession(session: NaverAdminSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function logoutNaverAdmin() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

export function localAdminProfile(naverId: string): AdminProfile | null {
  if (naverId === defaultNaverAdminId || loadLocalAdminIds().has(naverId)) {
    return {
      uid: naverId,
      email: `${naverId}@naver.local`,
      role: naverId === defaultNaverAdminId ? "owner" : "admin",
      provider: "naver",
      naverId,
      displayName: naverId === defaultNaverAdminId ? "기본 관리자" : naverId,
      createdAt: new Date().toISOString(),
    } satisfies AdminProfile;
  }

  return null;
}

export function loadLocalAdminIds() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(LOCAL_ADMINS_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(parsed);
  } catch {
    return new Set<string>();
  }
}

export function saveLocalAdminId(naverId: string) {
  if (typeof window === "undefined") return;
  const ids = loadLocalAdminIds();
  ids.add(naverId);
  window.localStorage.setItem(LOCAL_ADMINS_KEY, JSON.stringify(Array.from(ids)));
}
