"use client";

import {
  Check,
  EyeOff,
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
  loadNaverAdminSession,
  localAdminProfile,
  loginWithDefaultNaverAdmin,
  logoutNaverAdmin,
  saveLocalAdminId,
  defaultNaverAdminId,
  type NaverAdminSession,
} from "@/lib/admin/naverAuth";
import { hasFirebaseConfig } from "@/lib/firebase/client";
import {
  deleteSongFromFirestore,
  fetchAdminProfile,
  fetchAdminProfiles,
  fetchSongRequestsFromFirestore,
  fetchSongsFromFirestore,
  saveAdminProfile,
  saveSongToFirestore,
  updateSongInFirestore,
  updateSongRequestInFirestore,
} from "@/lib/firebase/firestore";
import { loadRequests, loadSongs, saveRequests, saveSongs } from "@/lib/songs/storage";
import { extractYoutubeVideoId, youtubeThumbnailUrl } from "@/lib/songs/youtube";
import type { AdminProfile, Song, SongRequest, SongStatus } from "@/types/song";

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
  const [session, setSession] = useState<NaverAdminSession | null>(null);
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [activeTab, setActiveTab] = useState<"songs" | "requests" | "admins">("songs");
  const [songForm, setSongForm] = useState<SongForm>(emptySongForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newAdminId, setNewAdminId] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const configured = hasFirebaseConfig();

  const refreshData = useCallback(async () => {
    if (configured) {
      try {
        const [nextSongs, nextRequests, nextAdmins] = await Promise.all([
          fetchSongsFromFirestore(),
          fetchSongRequestsFromFirestore(),
          fetchAdminProfiles(),
        ]);
        setSongs(nextSongs ?? []);
        setRequests(nextRequests ?? []);
        setAdmins(nextAdmins ?? localAdminList());
        return;
      } catch {
        setMessage("Firestore 데이터를 불러오지 못해 로컬 데이터를 표시합니다.");
      }
    }

    setSongs(loadSongs());
    setRequests(loadRequests());
    setAdmins(localAdminList());
  }, [configured]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSession(loadNaverAdminSession());
      setAuthLoading(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!session) {
      const timer = window.setTimeout(() => setAdmin(null), 0);
      return () => window.clearTimeout(timer);
    }

    const naverId = session.naverId;
    const timer = window.setTimeout(() => {
      async function loadAdmin() {
        setAdminLoading(true);
        try {
          const profile = configured ? await fetchAdminProfile(naverId) : null;
          setAdmin(profile ?? localAdminProfile(naverId));
          if (profile) await refreshData();
        } catch {
          const fallback = localAdminProfile(naverId);
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

  async function handleNaverLogin() {
    const nextSession = loginWithDefaultNaverAdmin();
    setSession(nextSession);
    setMessage("네이버 기본 관리자로 로그인했습니다.");
  }

  function handleLogout() {
    logoutNaverAdmin();
    setSession(null);
    setAdmin(null);
    setSongs([]);
    setRequests([]);
    setAdmins([]);
  }

  function startCreate() {
    setEditingId(null);
    setSongForm({ ...emptySongForm, id: nextSongId(songs) });
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
    setActiveTab("songs");
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
    const naverId = newAdminId.trim();
    if (!naverId) {
      setMessage("네이버 기준 아이디를 입력해주세요.");
      return;
    }

    setBusy(true);
    setMessage("");

    const profile: AdminProfile = {
      uid: naverId,
      email: `${naverId}@naver.local`,
      role: "admin",
      provider: "naver",
      naverId,
      displayName: newAdminName.trim() || naverId,
      createdAt: new Date().toISOString(),
    };

    try {
      if (configured) await saveAdminProfile(profile);
      saveLocalAdminId(naverId);
      setAdmins((prev) => [profile, ...prev.filter((item) => item.uid !== naverId)]);
      setNewAdminId("");
      setNewAdminName("");
      setMessage("관리자를 추가했습니다.");
    } catch {
      saveLocalAdminId(naverId);
      setAdmins((prev) => [profile, ...prev.filter((item) => item.uid !== naverId)]);
      setMessage("Firestore 저장은 실패했지만 로컬 관리자 목록에 추가했습니다.");
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
          <p className="mt-2 text-sm font-medium leading-6 text-muted">네이버 로그인 버튼을 누르면 기본 관리자 ID로 로그인합니다.</p>
          {message ? <Message text={message} /> : null}
          <button
            type="button"
            onClick={handleNaverLogin}
            disabled={busy}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#03C75A] text-sm font-extrabold text-white disabled:opacity-60"
          >
            N 네이버로 로그인
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
          <p className="mt-2 text-sm font-medium leading-6 text-muted">
            Firestore의 <code className="rounded bg-[#F4ECE0] px-1">admins/{session.naverId}</code> 문서를 추가해주세요.
          </p>
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
      </div>

      {activeTab === "songs" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
          <SongEditor
            form={songForm}
            editingId={editingId}
            busy={busy}
            onSubmit={saveSong}
            onChange={(patch) => setSongForm((prev) => ({ ...prev, ...patch }))}
            onNew={startCreate}
          />
          <SongTable songs={songs} onEdit={startEdit} onToggleHidden={toggleHidden} onDelete={removeSong} />
        </div>
      ) : activeTab === "requests" ? (
        <RequestTable requests={requests} busy={busy} onApprove={approveRequest} onReject={rejectRequest} />
      ) : (
        <AdminManager
          admins={admins}
          newAdminId={newAdminId}
          newAdminName={newAdminName}
          busy={busy}
          onSubmit={addAdmin}
          onIdChange={setNewAdminId}
          onNameChange={setNewAdminName}
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
  onSubmit,
  onChange,
  onNew,
}: {
  form: SongForm;
  editingId: string | null;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onChange: (patch: Partial<SongForm>) => void;
  onNew: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-card">
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
        <AdminInput label="YouTube URL" value={form.youtubeUrl} onChange={(value) => onChange({ youtubeUrl: value })} />
        <AdminInput label="썸네일 URL" value={form.thumbnailUrl} onChange={(value) => onChange({ thumbnailUrl: value })} />
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
    <section className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-card">
      <h3 className="text-lg font-extrabold text-ink">등록된 노래</h3>
      <div className="mt-4 space-y-3">
        {songs.map((song) => (
          <div key={song.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#EFE6D6] bg-white p-3">
            <div className="min-w-[220px] flex-1">
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
          네이버로 로그인했을 때 식별할 기준 아이디를 추가합니다. 같은 아이디로 로그인하면 메인 화면에 설정 버튼이
          표시됩니다.
        </p>
        <div className="mt-5 space-y-4">
          <AdminInput label="네이버 기준 아이디" value={newAdminId} onChange={onIdChange} placeholder="예: naver_12345" />
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
                    {admin.provider ?? "naver"}
                  </span>
                </div>
                <div className="mt-2 text-sm font-extrabold text-ink">{admin.displayName || admin.uid}</div>
                <div className="mt-1 text-xs font-bold text-muted">기준 아이디: {admin.naverId || admin.uid}</div>
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
    <label>
      <span className="text-sm font-extrabold text-ink">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-2xl border border-[#E7DEF7] bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-deep-lavender"
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
  const defaultProfile = localAdminProfile(defaultNaverAdminId);
  return defaultProfile ? [defaultProfile, ...profiles.filter((profile) => profile.uid !== defaultProfile.uid)] : profiles;
}
