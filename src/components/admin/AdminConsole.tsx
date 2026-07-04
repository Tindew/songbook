"use client";

import {
  Check,
  EyeOff,
  ExternalLink,
  Loader2,
  LogOut,
  Music2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  loadLocalAdminIds,
  loadGoogleAdminSession,
  localAdminProfile,
  loginWithDefaultGoogleAdmin,
  googleSessionFromFirebaseUser,
  logoutGoogleAdmin,
  saveLocalAdminId,
  saveGoogleAdminSession,
  defaultGoogleAdminId,
  type GoogleAdminSession,
} from "@/lib/admin/googleAuth";
import { loginWithGoogle, logoutAdmin, subscribeAuth } from "@/lib/firebase/auth";
import { hasFirebaseConfig } from "@/lib/firebase/client";
import { describeFirebaseError } from "@/lib/firebase/errors";
import {
  deleteSongFromFirestore,
  fetchAdminProfile,
  fetchAdminProfiles,
  fetchSongRequestsFromFirestore,
  fetchSongsFromFirestore,
  fetchSiteSettings,
  saveSiteSettings,
  saveAdminProfile,
  saveSongToFirestore,
  updateSongInFirestore,
  updateSongRequestInFirestore,
} from "@/lib/firebase/firestore";
import { loadRequests, loadSongs, saveRequests, saveSongs } from "@/lib/songs/storage";
import { extractYoutubeVideoId, youtubeThumbnailCandidates, youtubeThumbnailUrl } from "@/lib/songs/youtube";
import type { AdminProfile, SiteSettings, Song, SongRequest, SongStatus, YoutubeCandidate } from "@/types/song";

type SongForm = {
  id: string;
  title: string;
  artist: string;
  aliases: string;
  tags: string;
  genres: string;
  status: SongStatus;
  difficulty: "1" | "2" | "3";
  memo: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  likeCount: string;
  isFeatured: boolean;
  isHidden: boolean;
};

type SiteSettingsForm = {
  siteTitle: string;
  heroTitle: string;
  heroSubtitle: string;
  announcement: string;
  requestEnabled: boolean;
  copyCommandEnabled: boolean;
};

const emptySongForm: SongForm = {
  id: "",
  title: "",
  artist: "",
  aliases: "",
  tags: "K-POP",
  genres: "K-POP",
  status: "available",
  difficulty: "2",
  memo: "",
  youtubeUrl: "",
  thumbnailUrl: "",
  likeCount: "0",
  isFeatured: false,
  isHidden: false,
};

const statusOptions: Array<{ value: SongStatus; label: string }> = [
  { value: "available", label: "가능" },
  { value: "practice", label: "연습중" },
  { value: "condition", label: "컨디션" },
  { value: "blocked", label: "보류" },
  { value: "special", label: "이벤트" },
];

export function AdminConsole() {
  const [session, setSession] = useState<GoogleAdminSession | null>(null);
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [activeTab, setActiveTab] = useState<"songs" | "requests" | "admins" | "settings">("songs");
  const [songForm, setSongForm] = useState<SongForm>(emptySongForm);
  const [settingsForm, setSettingsForm] = useState<SiteSettingsForm>(settingsToForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newAdminId, setNewAdminId] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [youtubeCandidates, setYoutubeCandidates] = useState<YoutubeCandidate[]>([]);
  const [youtubeSearching, setYoutubeSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const configured = hasFirebaseConfig();

  const refreshData = useCallback(async () => {
    if (configured) {
      try {
        const [nextSongs, nextRequests, nextAdmins, nextSettings] = await Promise.all([
          fetchSongsFromFirestore(),
          fetchSongRequestsFromFirestore(),
          fetchAdminProfiles(),
          fetchSiteSettings(),
        ]);
        setSongs(nextSongs ?? []);
        setRequests(nextRequests ?? []);
        setAdmins(nextAdmins ?? localAdminList());
        setSettingsForm(settingsToForm(nextSettings));
        return;
      } catch {
        setMessage("Firestore 데이터를 불러오지 못해 로컬 데이터를 표시합니다.");
      }
    }

    setSongs(loadSongs());
    setRequests(loadRequests());
    setAdmins(localAdminList());
    setSettingsForm(settingsToForm());
  }, [configured]);

  useEffect(() => {
    if (configured) {
      return subscribeAuth((user) => {
        if (user) {
          const nextSession = googleSessionFromFirebaseUser(user);
          saveGoogleAdminSession(nextSession);
          setSession(nextSession);
        } else {
          setSession(loadGoogleAdminSession());
        }
        setAuthLoading(false);
      });
    }

    const timer = window.setTimeout(() => {
      setSession(loadGoogleAdminSession());
      setAuthLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [configured]);

  useEffect(() => {
    if (!session) {
      const timer = window.setTimeout(() => setAdmin(null), 0);
      return () => window.clearTimeout(timer);
    }

    const googleId = session.googleId;
    const firebaseUid = session.firebaseUid;
    const timer = window.setTimeout(() => {
      async function loadAdmin() {
        setAdminLoading(true);
        try {
          const profile = configured && firebaseUid ? await fetchAdminProfile(firebaseUid) : null;
          const resolvedProfile = profile ?? localAdminProfile(googleId);
          setAdmin(resolvedProfile);
          if (resolvedProfile) await refreshData();
        } catch {
          const fallback = localAdminProfile(googleId);
          setAdmin(fallback);
          if (fallback) await refreshData();
          setMessage("Firestore 관리자 확인에 실패해 로컬 관리자 정보로 확인했습니다.");
        } finally {
          setAdminLoading(false);
        }
      }

      void loadAdmin();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [configured, refreshData, session]);

  const pendingRequests = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);

  async function handleGoogleLogin() {
    if (configured) {
      try {
        const result = await loginWithGoogle();
        const nextSession = googleSessionFromFirebaseUser(result.user);
        saveGoogleAdminSession(nextSession);
        setSession(nextSession);
        setMessage("Google로 로그인했습니다.");
        return;
      } catch (error) {
        console.error("Google login failed", error);
        setMessage(`Google 로그인 실패: ${describeFirebaseError(error)}`);
        return;
      }
    }

    const nextSession = loginWithDefaultGoogleAdmin();
    setSession(nextSession);
    setMessage("Google 기본 관리자로 로그인했습니다.");
  }

  function handleLogout() {
    logoutGoogleAdmin();
    void logoutAdmin();
    setSession(null);
    setAdmin(null);
    setSongs([]);
    setRequests([]);
    setAdmins([]);
  }

  function startCreate() {
    setEditingId(null);
    setSongForm({ ...emptySongForm, id: nextSongId(songs) });
    setYoutubeCandidates([]);
  }

  function startEdit(song: Song) {
    setEditingId(song.id);
    setSongForm({
      id: song.id,
      title: song.title,
      artist: song.artist,
      aliases: song.aliases.join(", "),
      tags: song.tags.join(", "),
      genres: song.genres.join(", "),
      status: song.status,
      difficulty: String(song.difficulty) as SongForm["difficulty"],
      memo: song.memo ?? "",
      youtubeUrl: song.youtubeUrl ?? "",
      thumbnailUrl: song.thumbnailUrl ?? "",
      likeCount: String(song.likeCount ?? 0),
      isFeatured: song.isFeatured,
      isHidden: song.isHidden,
    });
    setYoutubeCandidates([]);
    setActiveTab("songs");
  }

  async function searchYoutubeCandidates() {
    if (!songForm.title.trim() && !songForm.artist.trim()) {
      setMessage("곡명 또는 가수명을 입력한 뒤 후보를 검색해주세요.");
      return;
    }

    setYoutubeSearching(true);
    setMessage("");

    try {
      const response = await fetch("/api/youtube/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: songForm.title, artist: songForm.artist }),
      });
      const data = (await response.json()) as { candidates?: YoutubeCandidate[]; source?: string };
      setYoutubeCandidates(data.candidates ?? []);
      setMessage(data.source === "stub" ? "YouTube API 키가 없어 샘플 후보를 표시합니다." : "YouTube 후보를 불러왔습니다.");
    } catch {
      setMessage("YouTube 후보를 불러오지 못했습니다.");
    } finally {
      setYoutubeSearching(false);
    }
  }

  function selectYoutubeCandidate(candidate: YoutubeCandidate) {
    setSongForm((prev) => ({
      ...prev,
      youtubeUrl: candidate.youtubeUrl ?? prev.youtubeUrl,
      thumbnailUrl: candidate.thumbnailUrl ?? (candidate.videoId ? youtubeThumbnailUrl(candidate.videoId) : prev.thumbnailUrl),
    }));
    setMessage("YouTube 후보를 선택했습니다.");
  }

  async function saveSong(event: FormEvent) {
    event.preventDefault();
    if (!songForm.title.trim() || !songForm.artist.trim()) {
      setMessage("곡명과 가수명은 필수입니다.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const song = buildSongFromForm(songForm, editingId ? songs.find((item) => item.id === editingId) : undefined);
      if (configured) await saveSongToFirestore(song);
      setSongs((prev) => [song, ...prev.filter((item) => item.id !== song.id)]);
      if (!configured) saveSongs([song, ...songs.filter((item) => item.id !== song.id)]);
      setSongForm({ ...emptySongForm, id: nextSongId([song, ...songs]) });
      setEditingId(null);
      setMessage("노래를 저장했습니다.");
    } catch {
      setMessage("노래 저장에 실패했습니다. 권한과 Firestore 규칙을 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleHidden(song: Song) {
    setBusy(true);
    try {
      if (configured) await updateSongInFirestore(song.id, { isHidden: !song.isHidden });
      setSongs((prev) => prev.map((item) => (item.id === song.id ? { ...item, isHidden: !item.isHidden } : item)));
      if (!configured) saveSongs(songs.map((item) => (item.id === song.id ? { ...item, isHidden: !item.isHidden } : item)));
      setMessage(song.isHidden ? "노래를 다시 표시했습니다." : "노래를 숨김 처리했습니다.");
    } catch {
      setMessage("상태 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSong(song: Song) {
    const ok = window.confirm(`${song.artist} - ${song.title} 곡을 삭제할까요?`);
    if (!ok) return;

    setBusy(true);
    try {
      if (configured) await deleteSongFromFirestore(song.id);
      setSongs((prev) => prev.filter((item) => item.id !== song.id));
      if (!configured) saveSongs(songs.filter((item) => item.id !== song.id));
      setMessage("노래를 삭제했습니다.");
    } catch {
      setMessage("노래 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function approveRequest(request: SongRequest) {
    setBusy(true);
    setMessage("");

    try {
      const song = buildSongFromRequest(request, nextSongId(songs));
      if (configured) {
        await saveSongToFirestore(song);
        await updateSongRequestInFirestore(request.id, { status: "approved", approvedSongId: song.id });
      }
      setSongs((prev) => [song, ...prev]);
      const nextRequests = requests.map((item) =>
        item.id === request.id ? { ...item, status: "approved" as const, approvedSongId: song.id } : item,
      );
      setRequests(nextRequests);
      if (!configured) {
        saveSongs([song, ...songs]);
        saveRequests(nextRequests);
      }
      setMessage("요청곡을 승인하고 노래책에 추가했습니다.");
    } catch {
      setMessage("요청 승인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectRequest(request: SongRequest) {
    setBusy(true);
    setMessage("");

    try {
      if (configured) await updateSongRequestInFirestore(request.id, { status: "rejected" });
      const nextRequests = requests.map((item) => (item.id === request.id ? { ...item, status: "rejected" as const } : item));
      setRequests(nextRequests);
      if (!configured) saveRequests(nextRequests);
      setMessage("요청곡을 반려했습니다.");
    } catch {
      setMessage("요청 반려에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function addAdmin(event: FormEvent) {
    event.preventDefault();
    const adminId = newAdminId.trim();
    if (!adminId) {
      setMessage("Firebase UID 또는 Google ID를 입력해주세요.");
      return;
    }

    setBusy(true);
    setMessage("");

    const profile: AdminProfile = {
      uid: adminId,
      email: `${adminId}@google.local`,
      role: "admin",
      provider: "google",
      googleId: adminId,
      displayName: newAdminName.trim() || adminId,
      createdAt: new Date().toISOString(),
    };

    try {
      if (configured) await saveAdminProfile(profile);
      saveLocalAdminId(adminId);
      setAdmins((prev) => [profile, ...prev.filter((item) => item.uid !== adminId)]);
      setNewAdminId("");
      setNewAdminName("");
      setMessage("관리자를 추가했습니다.");
    } catch {
      saveLocalAdminId(adminId);
      setAdmins((prev) => [profile, ...prev.filter((item) => item.uid !== adminId)]);
      setMessage("Firestore 저장은 실패했지만 로컬 관리자 목록에 추가했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const settings = formToSettings(settingsForm);

    try {
      if (configured) await saveSiteSettings(settings);
      setMessage("사이트 설정을 저장했습니다.");
    } catch {
      setMessage("사이트 설정 저장에 실패했습니다. 권한과 Firestore 규칙을 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return <AdminShell title="관리자 확인 중"><LoadingPanel /></AdminShell>;
  }

  if (!session) {
    return (
      <AdminShell title="관리자 로그인">
        <div className="mx-auto mt-10 max-w-md rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-card">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-pale-lavender text-deep-lavender">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-2xl font-extrabold text-ink">관리자 로그인</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-muted">
            Firebase 설정이 있으면 실제 Google 로그인으로, 설정이 없으면 기본 관리자 ID로 로그인합니다.
          </p>
          {message ? <Message text={message} /> : null}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={busy}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-extrabold text-ink shadow-card disabled:opacity-60"
          >
            G Google로 로그인
          </button>
        </div>
      </AdminShell>
    );
  }

  if (adminLoading) {
    return <AdminShell title="권한 확인 중"><LoadingPanel /></AdminShell>;
  }

  if (!admin) {
    return (
      <AdminShell title="접근 불가">
        <div className="mx-auto mt-10 max-w-xl rounded-[24px] border border-white/70 bg-white/80 p-6 text-center shadow-card">
          <ShieldCheck className="mx-auto h-10 w-10 text-warning" />
          <h2 className="mt-4 text-2xl font-extrabold text-ink">관리자 권한이 없습니다.</h2>
          <div className="mt-4 rounded-2xl bg-[#F8F2E8] p-4 text-left text-sm font-semibold leading-6 text-muted">
            <p>첫 관리자는 Firestore에 직접 추가해야 합니다.</p>
            <p className="mt-2">
              권장 문서 ID:{" "}
              <code className="rounded bg-white px-1 text-ink">{session.firebaseUid || session.googleId}</code>
            </p>
            <p>
              Google ID: <code className="rounded bg-white px-1 text-ink">{session.googleId}</code>
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-6 h-11 rounded-2xl border border-[#E7DEF7] bg-white px-5 text-sm font-extrabold text-[#4a3f6b]"
          >
            로그아웃
          </button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="관리자">
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-deep-lavender">{admin.email}</p>
          <h2 className="text-2xl font-extrabold text-ink">노래책 운영 콘솔</h2>
          {session ? (
            <p className="mt-1 text-xs font-bold text-muted">
              Firebase UID: {session.firebaseUid || "로컬 모드"} · Google ID: {session.googleId}
            </p>
          ) : null}
          {!configured ? <p className="mt-1 text-xs font-bold text-warning">Firebase 미설정 상태라 로컬 저장으로 동작합니다.</p> : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void refreshData()}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#E7DEF7] bg-white px-4 text-sm font-extrabold text-[#4a3f6b]"
          >
            <RefreshCw className="h-4 w-4" />
            새로고침
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-ink px-4 text-sm font-extrabold text-white"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      </div>

      {message ? <Message text={message} /> : null}

      <div className="mt-6 flex gap-2 rounded-2xl bg-[#F1EBE0] p-1">
        <TabButton active={activeTab === "songs"} onClick={() => setActiveTab("songs")}>
          노래 관리 {songs.length}
        </TabButton>
        <TabButton active={activeTab === "requests"} onClick={() => setActiveTab("requests")}>
          요청곡 관리 {pendingRequests.length}
        </TabButton>
        <TabButton active={activeTab === "admins"} onClick={() => setActiveTab("admins")}>
          관리자 추가 {admins.length}
        </TabButton>
        <TabButton active={activeTab === "settings"} onClick={() => setActiveTab("settings")}>
          사이트 설정
        </TabButton>
      </div>

      {activeTab === "songs" ? (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <SongEditor
            form={songForm}
            editingId={editingId}
            busy={busy}
            onSubmit={saveSong}
            onChange={(patch) => setSongForm((prev) => ({ ...prev, ...patch }))}
            onNew={startCreate}
            candidates={youtubeCandidates}
            searching={youtubeSearching}
            onSearchYoutube={() => void searchYoutubeCandidates()}
            onSelectYoutube={selectYoutubeCandidate}
          />
          <SongTable songs={songs} onEdit={startEdit} onToggleHidden={toggleHidden} onDelete={removeSong} />
        </div>
      ) : activeTab === "requests" ? (
        <RequestTable requests={requests} busy={busy} onApprove={approveRequest} onReject={rejectRequest} />
      ) : activeTab === "admins" ? (
        <AdminManager
          admins={admins}
          newAdminId={newAdminId}
          newAdminName={newAdminName}
          busy={busy}
          onSubmit={addAdmin}
          onIdChange={setNewAdminId}
          onNameChange={setNewAdminName}
        />
      ) : (
        <SettingsPanel
          form={settingsForm}
          busy={busy}
          onSubmit={saveSettings}
          onChange={(patch) => setSettingsForm((prev) => ({ ...prev, ...patch }))}
        />
      )}
    </AdminShell>
  );
}

function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="songbook-shell min-h-screen pb-16">
      <div className="container-main">
        <nav className="sticky top-3 z-40 mt-4 flex items-center gap-3 rounded-full border border-white/70 bg-cream/80 px-4 py-3 shadow-card backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-3 rounded-full">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-lavender to-deep-lavender text-white shadow-[0_6px_14px_rgba(123,97,255,.32)]">
              <Music2 className="h-5 w-5" />
            </span>
            <span className="text-[17px] font-extrabold text-ink">로션욤 노래책</span>
          </Link>
          <span className="ml-auto rounded-full bg-white px-4 py-2 text-sm font-extrabold text-deep-lavender">{title}</span>
        </nav>
        {children}
      </div>
    </main>
  );
}

function LoadingPanel() {
  return (
    <div className="mx-auto mt-16 flex max-w-sm items-center justify-center gap-3 rounded-[24px] border border-white/70 bg-white/80 p-6 text-sm font-extrabold text-muted shadow-card">
      <Loader2 className="h-5 w-5 animate-spin text-deep-lavender" />
      불러오는 중
    </div>
  );
}

function SongEditor({
  form,
  editingId,
  busy,
  candidates,
  searching,
  onSubmit,
  onChange,
  onNew,
  onSearchYoutube,
  onSelectYoutube,
}: {
  form: SongForm;
  editingId: string | null;
  busy: boolean;
  candidates: YoutubeCandidate[];
  searching: boolean;
  onSubmit: (event: FormEvent) => void;
  onChange: (patch: Partial<SongForm>) => void;
  onNew: () => void;
  onSearchYoutube: () => void;
  onSelectYoutube: (candidate: YoutubeCandidate) => void;
}) {
  const videoId = extractYoutubeVideoId(form.youtubeUrl);
  const previewUrl = form.thumbnailUrl || youtubeThumbnailUrl(videoId);

  return (
    <form onSubmit={onSubmit} className="min-w-0 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-extrabold text-ink">{editingId ? "노래 수정" : "노래 추가"}</h3>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#E7DEF7] bg-white px-3 text-xs font-extrabold text-[#4a3f6b]"
        >
          <Plus className="h-4 w-4" />새 곡
        </button>
      </div>
      <div className="mt-5 grid gap-4">
        <AdminInput label="곡 ID" value={form.id} onChange={(value) => onChange({ id: value })} />
        <AdminInput label="곡명" value={form.title} onChange={(value) => onChange({ title: value })} />
        <AdminInput label="가수" value={form.artist} onChange={(value) => onChange({ artist: value })} />
        <AdminInput label="별칭" value={form.aliases} onChange={(value) => onChange({ aliases: value })} placeholder="쉼표로 구분" />
        <AdminInput label="태그" value={form.tags} onChange={(value) => onChange({ tags: value })} placeholder="쉼표로 구분" />
        <AdminInput label="장르" value={form.genres} onChange={(value) => onChange({ genres: value })} placeholder="쉼표로 구분" />
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="text-sm font-extrabold text-ink">상태</span>
            <select
              value={form.status}
              onChange={(event) => onChange({ status: event.target.value as SongStatus })}
              className="mt-2 h-11 w-full rounded-2xl border border-[#E7DEF7] bg-white px-3 text-sm font-semibold outline-none"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-extrabold text-ink">난이도</span>
            <select
              value={form.difficulty}
              onChange={(event) => onChange({ difficulty: event.target.value as SongForm["difficulty"] })}
              className="mt-2 h-11 w-full rounded-2xl border border-[#E7DEF7] bg-white px-3 text-sm font-semibold outline-none"
            >
              <option value="1">쉬움</option>
              <option value="2">보통</option>
              <option value="3">어려움</option>
            </select>
          </label>
        </div>
        <div className="rounded-2xl border border-[#EFE6D6] bg-[#F8F2E8] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-extrabold text-ink">YouTube 썸네일</h4>
              <p className="mt-1 text-xs font-semibold text-muted">URL을 넣거나 후보를 선택하면 자동으로 카드에 반영됩니다.</p>
            </div>
            <button
              type="button"
              onClick={onSearchYoutube}
              disabled={searching}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-3 text-xs font-extrabold text-deep-lavender shadow-card disabled:opacity-60"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              후보 검색
            </button>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white bg-white">
            <ThumbnailPreview url={previewUrl} videoId={videoId} title={form.title || "썸네일 미리보기"} />
          </div>
          <div className="mt-4 space-y-4">
            <AdminInput label="YouTube URL" value={form.youtubeUrl} onChange={(value) => onChange({ youtubeUrl: value })} />
            <AdminInput label="썸네일 URL" value={form.thumbnailUrl} onChange={(value) => onChange({ thumbnailUrl: value })} />
          </div>
          {candidates.length ? (
            <div className="mt-4 space-y-2">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => onSelectYoutube(candidate)}
                  className="flex min-w-0 w-full items-center gap-3 rounded-2xl border border-[#EFE6D6] bg-white p-3 text-left transition hover:border-deep-lavender"
                >
                  <div
                    className="grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-pale-lavender text-xs font-extrabold text-deep-lavender"
                    style={candidate.thumbnailUrl ? { backgroundImage: `url(${candidate.thumbnailUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                  >
                    {candidate.thumbnailUrl ? "" : `${candidate.confidence}%`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold text-ink">{candidate.title}</div>
                    <div className="mt-1 truncate text-xs font-bold text-muted">
                      {candidate.channelTitle} · 후보 {candidate.confidence}% {candidate.official ? "· 공식" : ""}
                    </div>
                  </div>
                  {candidate.youtubeUrl ? (
                    <a
                      href={candidate.youtubeUrl}
                      target="_blank"
                      onClick={(event) => event.stopPropagation()}
                      className="grid h-9 w-9 place-items-center rounded-full bg-[#F8F2E8] text-muted"
                      aria-label="YouTube 열기"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <AdminInput label="좋아요 수" value={form.likeCount} onChange={(value) => onChange({ likeCount: value })} />
        <label>
          <span className="text-sm font-extrabold text-ink">메모</span>
          <textarea
            value={form.memo}
            onChange={(event) => onChange({ memo: event.target.value })}
            rows={3}
            className="mt-2 w-full resize-none rounded-2xl border border-[#E7DEF7] bg-white p-3 text-sm font-semibold outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-3 text-sm font-bold text-ink">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isFeatured} onChange={(event) => onChange({ isFeatured: event.target.checked })} />
            로션픽
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isHidden} onChange={(event) => onChange({ isHidden: event.target.checked })} />
            숨김
          </label>
        </div>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-deep-lavender text-sm font-extrabold text-white disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        저장
      </button>
    </form>
  );
}

function SongTable({
  songs,
  onEdit,
  onToggleHidden,
  onDelete,
}: {
  songs: Song[];
  onEdit: (song: Song) => void;
  onToggleHidden: (song: Song) => void;
  onDelete: (song: Song) => void;
}) {
  return (
    <section className="min-w-0 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-card">
      <h3 className="text-lg font-extrabold text-ink">등록된 노래</h3>
      <div className="mt-4 space-y-3">
        {songs.map((song) => (
          <div key={song.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-[#EFE6D6] bg-white p-3">
            <div className="min-w-[220px] flex-1 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-pale-lavender px-2 py-1 text-[11px] font-extrabold text-deep-lavender">{song.id}</span>
                {song.isHidden ? <span className="rounded-lg bg-[#F4ECE0] px-2 py-1 text-[11px] font-extrabold text-muted">숨김</span> : null}
              </div>
              <div className="mt-2 text-sm font-extrabold text-ink">{song.title}</div>
              <div className="mt-1 text-xs font-bold text-muted">{song.artist} · {song.tags.join(", ")}</div>
            </div>
            <RowAction label="수정" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(song)} />
            <RowAction label={song.isHidden ? "표시" : "숨김"} icon={<EyeOff className="h-4 w-4" />} onClick={() => onToggleHidden(song)} />
            <RowAction label="삭제" icon={<Trash2 className="h-4 w-4" />} onClick={() => onDelete(song)} danger />
          </div>
        ))}
      </div>
    </section>
  );
}

function RequestTable({
  requests,
  busy,
  onApprove,
  onReject,
}: {
  requests: SongRequest[];
  busy: boolean;
  onApprove: (request: SongRequest) => void;
  onReject: (request: SongRequest) => void;
}) {
  return (
    <section className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-card">
      <h3 className="text-lg font-extrabold text-ink">요청곡 목록</h3>
      <div className="mt-4 space-y-3">
        {requests.length ? (
          requests.map((request) => (
            <div key={request.id} className="rounded-2xl border border-[#EFE6D6] bg-white p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-[240px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-pale-lavender px-2 py-1 text-[11px] font-extrabold text-deep-lavender">
                      {request.status}
                    </span>
                    <span className="text-xs font-bold text-muted">{request.nickname || "익명"}</span>
                  </div>
                  <div className="mt-2 text-base font-extrabold text-ink">{request.title}</div>
                  <div className="mt-1 text-sm font-bold text-muted">{request.artist}</div>
                  <div className="mt-2 text-xs font-semibold leading-5 text-muted">{request.reason || "요청 이유 없음"}</div>
                  {request.youtubeUrl ? (
                    <a className="mt-2 block truncate text-xs font-bold text-deep-lavender" href={request.youtubeUrl} target="_blank">
                      {request.youtubeUrl}
                    </a>
                  ) : null}
                </div>
                {request.status === "pending" ? (
                  <div className="flex gap-2">
                    <RowAction label="승인" icon={<Check className="h-4 w-4" />} onClick={() => onApprove(request)} disabled={busy} />
                    <RowAction label="반려" icon={<X className="h-4 w-4" />} onClick={() => onReject(request)} danger disabled={busy} />
                  </div>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-[#F8F2E8] p-6 text-center text-sm font-bold text-muted">요청곡이 아직 없습니다.</div>
        )}
      </div>
    </section>
  );
}

function AdminManager({
  admins,
  newAdminId,
  newAdminName,
  busy,
  onSubmit,
  onIdChange,
  onNameChange,
}: {
  admins: AdminProfile[];
  newAdminId: string;
  newAdminName: string;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onIdChange: (value: string) => void;
  onNameChange: (value: string) => void;
}) {
  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
      <form onSubmit={onSubmit} className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-card">
        <h3 className="text-lg font-extrabold text-ink">관리자 추가</h3>
        <p className="mt-2 text-sm font-medium leading-6 text-muted">
          새 관리자가 Google로 한 번 로그인한 뒤 표시되는 Firebase UID를 추가합니다. 해당 계정으로 로그인하면 메인
          화면에 설정 버튼이 표시됩니다.
        </p>
        <div className="mt-5 space-y-4">
          <AdminInput label="Firebase UID 또는 Google ID" value={newAdminId} onChange={onIdChange} placeholder="설정 화면에 표시된 UID/ID" />
          <AdminInput label="표시 이름" value={newAdminName} onChange={onNameChange} placeholder="예: 운영자" />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-deep-lavender text-sm font-extrabold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          관리자 추가
        </button>
      </form>

      <div className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-card">
        <h3 className="text-lg font-extrabold text-ink">관리자 목록</h3>
        <div className="mt-4 space-y-3">
          {admins.length ? (
            admins.map((admin) => (
              <div key={admin.uid} className="rounded-2xl border border-[#EFE6D6] bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-pale-lavender px-2 py-1 text-[11px] font-extrabold text-deep-lavender">
                    {admin.role}
                  </span>
                  <span className="rounded-lg bg-[#E3F2EC] px-2 py-1 text-[11px] font-extrabold text-[#2E8B6B]">
                    {admin.provider ?? "google"}
                  </span>
                </div>
                <div className="mt-2 text-sm font-extrabold text-ink">{admin.displayName || admin.uid}</div>
                <div className="mt-1 text-xs font-bold text-muted">기준 아이디: {admin.googleId || admin.uid}</div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-[#F8F2E8] p-6 text-center text-sm font-bold text-muted">등록된 관리자가 없습니다.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({
  form,
  busy,
  onSubmit,
  onChange,
}: {
  form: SiteSettingsForm;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onChange: (patch: Partial<SiteSettingsForm>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-card">
      <h3 className="text-lg font-extrabold text-ink">사이트 설정</h3>
      <p className="mt-2 text-sm font-medium leading-6 text-muted">메인 문구와 사용자 기능 노출 여부를 관리합니다.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <AdminInput label="사이트 제목" value={form.siteTitle} onChange={(value) => onChange({ siteTitle: value })} />
        <AdminInput label="Hero 제목" value={form.heroTitle} onChange={(value) => onChange({ heroTitle: value })} />
        <label className="md:col-span-2">
          <span className="text-sm font-extrabold text-ink">Hero 설명</span>
          <textarea
            value={form.heroSubtitle}
            onChange={(event) => onChange({ heroSubtitle: event.target.value })}
            rows={3}
            className="mt-2 w-full resize-none rounded-2xl border border-[#E7DEF7] bg-white p-3 text-sm font-semibold outline-none"
          />
        </label>
        <label className="md:col-span-2">
          <span className="text-sm font-extrabold text-ink">공지사항</span>
          <textarea
            value={form.announcement}
            onChange={(event) => onChange({ announcement: event.target.value })}
            rows={2}
            className="mt-2 w-full resize-none rounded-2xl border border-[#E7DEF7] bg-white p-3 text-sm font-semibold outline-none"
            placeholder="비워두면 표시하지 않습니다"
          />
        </label>
        <div className="flex flex-wrap gap-4 text-sm font-bold text-ink md:col-span-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.requestEnabled}
              onChange={(event) => onChange({ requestEnabled: event.target.checked })}
            />
            노래 추가 요청 허용
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.copyCommandEnabled}
              onChange={(event) => onChange({ copyCommandEnabled: event.target.checked })}
            />
            신청 문구 복사 허용
          </label>
        </div>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-deep-lavender px-5 text-sm font-extrabold text-white disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        설정 저장
      </button>
    </form>
  );
}

function ThumbnailPreview({ url, videoId, title }: { url: string; videoId: string; title: string }) {
  const fallbackUrls = videoId ? youtubeThumbnailCandidates(videoId) : [];
  const [index, setIndex] = useState(0);
  const src = url || fallbackUrls[index] || "";

  useEffect(() => {
    const timer = window.setTimeout(() => setIndex(0), 0);
    return () => window.clearTimeout(timer);
  }, [url, videoId]);

  if (!src) {
    return (
      <div className="grid aspect-video place-items-center bg-gradient-to-br from-lavender to-deep-lavender text-sm font-extrabold text-white">
        썸네일 미리보기
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${title} 썸네일 미리보기`}
      className="aspect-video w-full object-cover"
      onError={() => {
        if (index < fallbackUrls.length - 1) setIndex((prev) => prev + 1);
      }}
    />
  );
}

function AdminInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-extrabold text-ink">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-11 min-w-0 w-full overflow-hidden text-ellipsis rounded-2xl border border-[#E7DEF7] bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-deep-lavender"
      />
    </label>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 flex-1 rounded-xl text-sm font-extrabold transition ${
        active ? "bg-white text-ink shadow-card" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function RowAction({
  label,
  icon,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-xs font-extrabold disabled:opacity-50 ${
        danger ? "border-[#F3D2CC] bg-[#FBE9E7] text-[#C0563F]" : "border-[#E7DEF7] bg-white text-[#4a3f6b]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Message({ text }: { text: string }) {
  return <div className="mt-5 rounded-2xl border border-[#E7DEF7] bg-white/80 p-4 text-sm font-bold text-[#4a3f6b]">{text}</div>;
}

function buildSongFromForm(form: SongForm, existing?: Song): Song {
  const now = new Date().toISOString();
  const videoId = extractYoutubeVideoId(form.youtubeUrl);
  const thumbnailUrl = form.thumbnailUrl.trim() || youtubeThumbnailUrl(videoId);
  const id = form.id.trim() || existing?.id || `S${Date.now()}`;

  return {
    id,
    title: form.title.trim(),
    artist: form.artist.trim(),
    aliases: splitCsv(form.aliases),
    tags: splitCsv(form.tags),
    genres: splitCsv(form.genres),
    status: form.status,
    difficulty: Number(form.difficulty) as Song["difficulty"],
    memo: form.memo.trim(),
    youtubeUrl: form.youtubeUrl.trim(),
    youtubeVideoId: videoId,
    thumbnailUrl,
    thumbnailSource: thumbnailUrl ? "manual" : videoId ? "youtube" : "default",
    thumbnailConfidence: thumbnailUrl ? 100 : videoId ? 82 : 0,
    requestCommand: `!신청 ${id} ${form.artist.trim()} - ${form.title.trim()}`,
    likeCount: Number(form.likeCount) || 0,
    isFeatured: form.isFeatured,
    isHidden: form.isHidden,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function buildSongFromRequest(request: SongRequest, id: string): Song {
  const now = new Date().toISOString();
  const videoId = extractYoutubeVideoId(request.youtubeUrl ?? "");
  const thumbnailUrl = youtubeThumbnailUrl(videoId);

  return {
    id,
    title: request.title,
    artist: request.artist,
    aliases: [],
    tags: request.tags.length ? request.tags : ["요청곡"],
    genres: request.tags.length ? request.tags : ["요청곡"],
    status: "practice",
    difficulty: 2,
    memo: request.reason || "요청곡으로 추가되었습니다.",
    youtubeUrl: request.youtubeUrl ?? "",
    youtubeVideoId: videoId,
    thumbnailUrl,
    thumbnailSource: request.selectedThumbnailConfidence ? "manual" : videoId ? "youtube" : "pending",
    thumbnailConfidence: request.selectedThumbnailConfidence ?? (videoId ? 78 : 0),
    requestCommand: `!신청 ${id} ${request.artist} - ${request.title}`,
    likeCount: 0,
    isFeatured: false,
    isHidden: false,
    createdAt: now,
    updatedAt: now,
  };
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function nextSongId(songs: Song[]) {
  const max = songs.reduce((acc, song) => {
    const match = song.id.match(/^S(\d+)$/);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);

  return `S${String(max + 1).padStart(3, "0")}`;
}

function localAdminList() {
  const ids = Array.from(loadLocalAdminIds());
  const profiles = ids.map((id) => localAdminProfile(id)).filter((profile): profile is AdminProfile => Boolean(profile));
  const defaultProfile = localAdminProfile(defaultGoogleAdminId);
  return defaultProfile ? [defaultProfile, ...profiles.filter((profile) => profile.uid !== defaultProfile.uid)] : profiles;
}

function settingsToForm(settings?: SiteSettings): SiteSettingsForm {
  return {
    siteTitle: settings?.siteTitle ?? "로션욤 노래책",
    heroTitle: settings?.heroTitle ?? "오늘 뭐 불러욤?",
    heroSubtitle: settings?.heroSubtitle ?? "곡명, 가수, 분위기로 빠르게 찾고 좋아요로 저장하세요.",
    announcement: settings?.announcement ?? "",
    requestEnabled: settings?.requestEnabled ?? true,
    copyCommandEnabled: settings?.copyCommandEnabled ?? true,
  };
}

function formToSettings(form: SiteSettingsForm): SiteSettings {
  return {
    siteTitle: form.siteTitle.trim() || "로션욤 노래책",
    heroTitle: form.heroTitle.trim() || "오늘 뭐 불러욤?",
    heroSubtitle: form.heroSubtitle.trim() || "곡명, 가수, 분위기로 빠르게 찾고 좋아요로 저장하세요.",
    announcement: form.announcement.trim(),
    requestEnabled: form.requestEnabled,
    copyCommandEnabled: form.copyCommandEnabled,
    updatedAt: new Date().toISOString(),
  };
}
