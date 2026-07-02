import {
  browserLocalPersistence,
  OAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "./client";

export const naverProviderId = process.env.NEXT_PUBLIC_NAVER_OIDC_PROVIDER_ID || "oidc.naver";

export function subscribeAuth(callback: (user: User | null) => void) {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(auth, callback);
}

export async function loginAdmin(email: string, password: string) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase Auth 설정이 필요합니다.");

  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithNaverOidc() {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase Auth 설정이 필요합니다.");

  await setPersistence(auth, browserLocalPersistence);
  const provider = new OAuthProvider(naverProviderId);
  provider.addScope("openid");
  return signInWithPopup(auth, provider);
}

export async function logoutAdmin() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}
