import type { User } from "firebase/auth";
import type { AdminProfile } from "@/types/song";

export type GoogleAdminSession = {
  firebaseUid?: string;
  googleId: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  loggedInAt: string;
};

const SESSION_KEY = "losionyom_google_admin_session";
const LOCAL_ADMINS_KEY = "losionyom_local_admin_ids";

export const defaultGoogleAdminId = process.env.NEXT_PUBLIC_DEFAULT_GOOGLE_ADMIN_ID || "default-admin";

export function loginWithDefaultGoogleAdmin(): GoogleAdminSession {
  const session = {
    googleId: defaultGoogleAdminId,
    displayName: "기본 관리자",
    email: `${defaultGoogleAdminId}@google.local`,
    loggedInAt: new Date().toISOString(),
  };

  saveGoogleAdminSession(session);
  return session;
}

export function googleSessionFromFirebaseUser(user: User): GoogleAdminSession {
  const providerProfile = user.providerData.find((profile) => profile.providerId === "google.com");

  return {
    firebaseUid: user.uid,
    googleId: providerProfile?.uid || user.uid,
    displayName: providerProfile?.displayName || user.displayName || "Google 관리자",
    email: providerProfile?.email || user.email || undefined,
    photoURL: providerProfile?.photoURL || user.photoURL || undefined,
    loggedInAt: new Date().toISOString(),
  };
}

export function loadGoogleAdminSession() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as GoogleAdminSession) : null;
  } catch {
    return null;
  }
}

export function saveGoogleAdminSession(session: GoogleAdminSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function logoutGoogleAdmin() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

export function localAdminProfile(googleId: string): AdminProfile | null {
  if (googleId === defaultGoogleAdminId || loadLocalAdminIds().has(googleId)) {
    return {
      uid: googleId,
      email: `${googleId}@google.local`,
      role: googleId === defaultGoogleAdminId ? "owner" : "admin",
      provider: "google",
      googleId,
      displayName: googleId === defaultGoogleAdminId ? "기본 관리자" : googleId,
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

export function saveLocalAdminId(googleId: string) {
  if (typeof window === "undefined") return;
  const ids = loadLocalAdminIds();
  ids.add(googleId);
  window.localStorage.setItem(LOCAL_ADMINS_KEY, JSON.stringify(Array.from(ids)));
}
