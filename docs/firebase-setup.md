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
NEXT_PUBLIC_DEFAULT_GOOGLE_ADMIN_ID=default-admin
```

설정 후 dev 서버를 재시작해야 합니다.

```powershell
npm run dev
```

## 2. Google 로그인 설정

Firebase Console에서 Google 로그인을 활성화합니다.

1. Firebase Console 접속
2. 프로젝트 선택
3. Authentication 클릭
4. Sign-in method 클릭
5. Google 제공자 선택
6. Enable 활성화
7. 지원 이메일 선택
8. 저장

Vercel 배포 도메인과 로컬 개발 도메인은 Firebase Authorized domains에 있어야 합니다.

```text
localhost
your-project.vercel.app
```

## 3. 첫 관리자 문서

처음에는 관리자가 없으므로 Google 로그인 후 `/admin`에 들어가면 권한 없음 화면이 뜹니다.

그 화면에 표시되는 Firebase UID를 복사해서 Firestore에 첫 관리자 문서를 직접 추가합니다.

```text
admins/{firebaseUid}
```

예시:

```json
{
  "email": "admin@gmail.com",
  "role": "owner",
  "provider": "google",
  "googleId": "Google ID 또는 Firebase UID",
  "displayName": "기본 관리자",
  "createdAt": "2026-07-03T00:00:00.000Z"
}
```

저장 후 새로고침하면 설정 페이지에 접근할 수 있습니다.

## 4. 관리자 추가

첫 관리자가 설정 페이지에 들어간 뒤 다른 관리자를 추가할 수 있습니다.

새 관리자는 먼저 Google로 한 번 로그인해서 권한 없음 화면에 표시되는 Firebase UID를 확인해야 합니다.
기존 관리자가 그 UID를 관리자 추가 화면에 넣으면 됩니다.

## 5. Firestore 컬렉션

앱에서 사용하는 컬렉션은 다음과 같습니다.

- `songs`
- `songRequests`
- `admins`
- `siteSettings`

## 6. 보안 규칙

`firestore.rules` 내용을 Firebase Console 또는 Firebase CLI로 배포합니다.
