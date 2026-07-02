export function describeFirebaseError(error: unknown) {
  const candidate = error as { code?: string; message?: string; customData?: unknown };
  const code = candidate?.code || "unknown";
  const message = candidate?.message || "알 수 없는 오류";

  const hintMap: Record<string, string> = {
    "auth/operation-not-allowed": "Firebase Authentication에서 oidc.naver 제공자가 활성화되어 있는지 확인해주세요.",
    "auth/unauthorized-domain": "Firebase Authentication > Settings > Authorized domains에 현재 도메인을 추가해주세요.",
    "auth/invalid-oauth-provider": "Provider ID가 oidc.naver인지 확인해주세요.",
    "auth/invalid-credential": "네이버 Client ID/Secret, Issuer, Callback URL 설정을 확인해주세요.",
    "auth/popup-blocked": "브라우저 팝업 차단을 해제해주세요.",
    "auth/popup-closed-by-user": "로그인 팝업이 닫혔습니다.",
    "auth/cancelled-popup-request": "이미 열린 로그인 팝업을 닫고 다시 시도해주세요.",
  };

  const hint = hintMap[code] || "Firebase OIDC provider, 네이버 Callback URL, Authorized domains 설정을 확인해주세요.";
  return `${code}: ${hint} (${message})`;
}
