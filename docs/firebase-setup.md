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
```

설정 후 dev 서버를 재시작해야 합니다.

## 2. Firebase Auth

Firebase Authentication에서 Email/Password 로그인을 활성화하고 관리자 계정을 생성합니다.

## 3. 관리자 문서

Firestore에 로그인 계정의 UID로 관리자 문서를 직접 추가합니다.

```text
admins/{uid}
```

```json
{
  "email": "admin@example.com",
  "role": "owner",
  "createdAt": "2026-07-02T00:00:00.000Z"
}
```

## 4. Firestore 컬렉션

앱에서 사용하는 컬렉션은 다음과 같습니다.

- `songs`
- `songRequests`
- `admins`
- `siteSettings`

## 5. 보안 규칙

`firestore.rules` 내용을 Firebase Console 또는 Firebase CLI로 배포합니다.
