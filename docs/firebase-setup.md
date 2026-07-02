# Firebase 설정

관리자 기능과 Firestore 연동을 사용하려면 Firebase 프로젝트에서 아래 설정이 필요합니다.

## 1. 환경변수

프로젝트 루트에 `.env.local`을 만들고 `.env.example` 값을 채웁니다.

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_DEFAULT_NAVER_ADMIN_ID=default-admin
```

설정 후 dev 서버를 재시작해야 합니다.

## 2. 네이버 관리자 로그인

현재 구현은 실제 네이버 OAuth 콜백이 아니라, 네이버 로그인 버튼을 누르면 `NEXT_PUBLIC_DEFAULT_NAVER_ADMIN_ID` 값으로 기본 관리자 세션을 만드는 MVP 방식입니다.

기본값은 다음과 같습니다.

```text
default-admin
```

Firestore에 기본 관리자를 등록한다면 문서 ID도 같은 값으로 맞춥니다.

```text
admins/default-admin
```

```json
{
  "email": "default-admin@naver.local",
  "role": "owner",
  "provider": "naver",
  "naverId": "default-admin",
  "displayName": "기본 관리자",
  "createdAt": "2026-07-03T00:00:00.000Z"
}
```

설정 페이지의 관리자 추가 기능은 네이버 기준 아이디를 `admins/{naverId}` 문서로 저장합니다. 실제 네이버 OAuth를 붙일 때는 네이버에서 받은 고유 ID와 이 문서 ID를 비교하면 됩니다.

## 3. Firebase Auth

현재 네이버 MVP 로그인에는 Firebase Auth 이메일 로그인이 필요하지 않습니다. 다만 운영 보안을 강화하려면 실제 네이버 OAuth 콜백을 서버에서 검증한 뒤 Firebase Custom Token 또는 서버 API를 통해 관리자 권한을 부여하는 방식으로 확장해야 합니다.

## 4. 관리자 문서

Firestore에 네이버 기준 아이디로 관리자 문서를 직접 추가합니다.

```text
admins/{naverId}
```

```json
{
  "email": "admin@example.com",
  "role": "owner",
  "createdAt": "2026-07-02T00:00:00.000Z"
}
```

## 5. Firestore 컬렉션

앱에서 사용하는 컬렉션은 다음과 같습니다.

- `songs`
- `songRequests`
- `admins`
- `siteSettings`

## 6. 보안 규칙

`firestore.rules` 내용을 Firebase Console 또는 Firebase CLI로 배포합니다.

주의: 현재 네이버 MVP 로그인은 클라이언트 세션 기반이므로, 엄격한 Firestore 규칙을 적용하면 관리자 쓰기가 차단될 수 있습니다. 실제 운영 전에는 네이버 OAuth 서버 검증 또는 Firebase Custom Token 연동이 필요합니다.
