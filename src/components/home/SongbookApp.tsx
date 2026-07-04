"use client";

import {
  BadgeCheck,
  Clipboard,
  Grid2X2,
  Heart,
  List,
  Loader2,
  LogOut,
  Music2,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shuffle,
  Sparkles,
  X,
} from "lucide-react";
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { defaultTags } from "@/data/seedSongs";
import {
  loadGoogleAdminSession,
  localAdminProfile,
  loginWithDefaultGoogleAdmin,
  googleSessionFromFirebaseUser,
  logoutGoogleAdmin,
  saveGoogleAdminSession,
  type GoogleAdminSession,
} from "@/lib/admin/googleAuth";
import {
  createSongRequestInFirestore,
  defaultSiteSettings,
  fetchSiteSettings,
  fetchSongsFromFirestore,
  firebaseAvailable,
} from "@/lib/firebase/firestore";
import { fetchAdminProfile } from "@/lib/firebase/firestore";
import { loginWithGoogle, logoutAdmin, subscribeAuth } from "@/lib/firebase/auth";
import { describeFirebaseError } from "@/lib/firebase/errors";
import { filterAndSortSongs } from "@/lib/songs/filter";
import { loadLikedIds, loadRequests, loadSongs, saveLikedIds, saveRequests, saveSongs } from "@/lib/songs/storage";
import { extractYoutubeVideoId, youtubeThumbnailCandidates, youtubeThumbnailUrl } from "@/lib/songs/youtube";
import type { AdminProfile, SiteSettings, Song, SongRequest, SortOption, ViewMode, YoutubeCandidate } from "@/types/song";

const gradientPairs = [
  ["#B9A7FF", "#7B61FF"],
  ["#F5A8C8", "#B9A7FF"],
  ["#F2B66D", "#E7D6BE"],
  ["#62C99B", "#B9DCCA"],
  ["#9DB7FF", "#EEE9FF"],
  ["#E7D6BE", "#B99E7A"],
];

const statusLabel: Record<Song["status"], string> = {
  available: "가능",
  practice: "연습중",
  condition: "컨디션",
  blocked: "보류",
  special: "이벤트",
};

type RequestForm = {
  title: string;
  artist: string;
  tags: string;
  youtubeUrl: string;
  nickname: string;
  reason: string;
};

const emptyForm: RequestForm = {
  title: "",
  artist: "",
  tags: "",
  youtubeUrl: "",
  nickname: "",
  reason: "",
};

export function SongbookApp() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("전체");
  const [likedOnly, setLikedOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [detailSongId, setDetailSongId] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [form, setForm] = useState<RequestForm>(emptyForm);
  const [thumbState, setThumbState] = useState<"idle" | "loading" | "done">("idle");
  const [thumbCandidates, setThumbCandidates] = useState<YoutubeCandidate[]>([]);
  const [selectedThumb, setSelectedThumb] = useState<YoutubeCandidate | null>(null);
  const [toast, setToast] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [firebaseMode, setFirebaseMode] = useState(false);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(defaultSiteSettings);
  const [adminSession, setAdminSession] = useState<GoogleAdminSession | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      async function hydrate() {
        setLikedIds(loadLikedIds());
        setRequests(loadRequests());
        const session = loadGoogleAdminSession();
        setAdminSession(session);

        if (session) {
          const localProfile = localAdminProfile(session.googleId);
          setAdminProfile(localProfile);
        }

        if (firebaseAvailable()) {
          try {
            const [firestoreSongs, settings] = await Promise.all([fetchSongsFromFirestore(), fetchSiteSettings()]);
            setSiteSettings(settings);
            if (firestoreSongs) {
              setSongs(firestoreSongs);
              setFirebaseMode(true);
            }
          } catch {
            setSongs(loadSongs());
            setFirebaseMode(false);
            setToast("Firestore를 읽지 못해 로컬 데이터로 표시합니다");
          }
        } else {
          setSongs(loadSongs());
        }

        setHydrated(true);
      }

      void hydrate();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!firebaseMode) return;

    return subscribeAuth((user) => {
      if (!user) return;
      const session = googleSessionFromFirebaseUser(user);
      setAdminSession(session);
    });
  }, [firebaseMode]);

  useEffect(() => {
    if (!hydrated || firebaseMode) return;
    saveSongs(songs);
  }, [firebaseMode, hydrated, songs]);

  useEffect(() => {
    if (!hydrated) return;
    saveLikedIds(likedIds);
  }, [hydrated, likedIds]);

  useEffect(() => {
    document.body.style.overflow = requestOpen || detailSongId ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [requestOpen, detailSongId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!adminSession || !firebaseMode) return;

    const googleId = adminSession.googleId;
    const firebaseUid = adminSession.firebaseUid;
    const timer = window.setTimeout(() => {
      async function verifyAdmin() {
        try {
          const profile = firebaseUid
            ? await fetchAdminProfile(firebaseUid)
            : null;
          setAdminProfile(profile ?? localAdminProfile(googleId));
        } catch {
          setAdminProfile(localAdminProfile(googleId));
        }
      }

      void verifyAdmin();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [adminSession, firebaseMode]);

  const visibleSongs = useMemo(
    () => filterAndSortSongs({ songs, likedIds, query, activeTag, likedOnly, sort }),
    [songs, likedIds, query, activeTag, likedOnly, sort],
  );

  const detailSong = detailSongId ? songs.find((song) => song.id === detailSongId) : undefined;
  const favoriteCount = likedIds.size;
  const featuredCount = songs.filter((song) => song.isFeatured).length;
  const recentCount = Math.min(8, songs.length);

  function showToast(message: string) {
    setToast(message);
  }

  async function handleGoogleLogin() {
    if (firebaseMode) {
      try {
        const result = await loginWithGoogle();
        const session = googleSessionFromFirebaseUser(result.user);
        setAdminSession(session);
        saveGoogleAdminSession(session);

        const profile = (await fetchAdminProfile(session.firebaseUid ?? session.googleId)) ?? localAdminProfile(session.googleId);
        setAdminProfile(profile);
        showToast(profile ? "Google로 로그인했어요" : "로그인했지만 관리자 권한이 없습니다");
        return;
      } catch (error) {
        console.error("Google login failed", error);
        showToast(`Google 로그인 실패: ${describeFirebaseError(error)}`);
        return;
      }
    }

    const session = loginWithDefaultGoogleAdmin();
    setAdminSession(session);

    let profile = localAdminProfile(session.googleId);
    if (firebaseMode) {
      try {
        profile = (await fetchAdminProfile(session.googleId)) ?? profile;
      } catch {
        profile = localAdminProfile(session.googleId);
      }
    }

    setAdminProfile(profile);
    showToast(profile ? "Google 기본 관리자로 로그인했어요" : "로그인했지만 관리자 권한이 없습니다");
  }

  function openRequestModal() {
    if (!siteSettings.requestEnabled) {
      showToast("지금은 노래 추가 요청이 잠시 닫혀 있어요");
      return;
    }

    setRequestOpen(true);
  }

  function handleGoogleLogout() {
    logoutGoogleAdmin();
    void logoutAdmin();
    setAdminSession(null);
    setAdminProfile(null);
    showToast("로그아웃했어요");
  }

  function resetAll() {
    setQuery("");
    setActiveTag("전체");
    setLikedOnly(false);
    setSort("recent");
    scrollToSongbook();
  }

  function scrollToSongbook() {
    window.setTimeout(() => {
      const el = document.getElementById("songbook");
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - 92;
      window.scrollTo({ top: y, behavior: "smooth" });
    }, 20);
  }

  function toggleLike(songId: string, event?: MouseEvent) {
    event?.stopPropagation();
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  }

  async function copyCommand(song: Song, event?: MouseEvent) {
    event?.stopPropagation();
    if (!siteSettings.copyCommandEnabled) {
      showToast("지금은 신청 문구 복사가 잠시 닫혀 있어요");
      return;
    }

    try {
      await navigator.clipboard.writeText(song.requestCommand);
      showToast("신청 문구를 복사했어요");
    } catch {
      showToast(song.requestCommand);
    }
  }

  function randomPick() {
    if (!visibleSongs.length) {
      showToast("조건에 맞는 곡이 없어요");
      return;
    }

    const pick = visibleSongs[Math.floor(Math.random() * visibleSongs.length)];
    setHighlightId(pick.id);
    showToast(`오늘의 촉촉 랜덤곡은 '${pick.title}'이에요`);

    window.setTimeout(() => {
      const el = document.getElementById(`song-${pick.id}`);
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - 112;
      window.scrollTo({ top: y, behavior: "smooth" });
    }, 50);

    window.setTimeout(() => setHighlightId(null), 1700);
  }

  function updateForm(key: keyof RequestForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function findThumbnails() {
    const title = form.title.trim() || "제목";
    const artist = form.artist.trim() || "가수";
    setThumbState("loading");
    setSelectedThumb(null);
    setThumbCandidates([]);

    window.setTimeout(() => {
      setThumbCandidates([
        {
          id: "official",
          title: `[Official MV] ${artist} - ${title}`,
          channelTitle: `${artist} 공식`,
          confidence: 94,
          official: true,
          gradientSeed: `${title}-${artist}-1`,
        },
        {
          id: "live",
          title: `${title} Live Clip`,
          channelTitle: "YOM MUSIC",
          confidence: 82,
          official: false,
          gradientSeed: `${title}-${artist}-2`,
        },
        {
          id: "audio",
          title: `${artist} - ${title} Audio`,
          channelTitle: "음악 아카이브",
          confidence: 68,
          official: false,
          gradientSeed: `${title}-${artist}-3`,
        },
      ]);
      setThumbState("done");
    }, 850);
  }

  async function submitRequest(event: FormEvent) {
    event.preventDefault();

    const title = form.title.trim();
    const artist = form.artist.trim();

    if (!title || !artist) {
      showToast("곡명과 가수명을 입력해주세요");
      return;
    }

    const id = `U${Date.now()}`;
    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const finalTags = tags.length ? tags : ["요청곡"];
    const videoId = extractYoutubeVideoId(form.youtubeUrl);
    const createdAt = new Date().toISOString();

    const request: SongRequest = {
      id,
      title,
      artist,
      youtubeUrl: form.youtubeUrl.trim(),
      reason: form.reason.trim(),
      nickname: form.nickname.trim(),
      tags: finalTags,
      status: "pending",
      selectedThumbnailTitle: selectedThumb?.title,
      selectedThumbnailChannel: selectedThumb?.channelTitle,
      selectedThumbnailConfidence: selectedThumb?.confidence,
      createdAt,
    };

    const newSong: Song = {
      id,
      title,
      artist,
      aliases: [],
      tags: finalTags,
      genres: finalTags,
      status: "practice",
      difficulty: 2,
      memo: form.reason.trim() || "요청으로 추가된 곡이에요.",
      youtubeUrl: form.youtubeUrl.trim(),
      youtubeVideoId: videoId,
      thumbnailUrl: videoId ? youtubeThumbnailUrl(videoId) : "",
      thumbnailSource: selectedThumb ? "manual" : videoId ? "youtube" : "pending",
      thumbnailConfidence: selectedThumb?.confidence ?? (videoId ? 78 : 0),
      requestCommand: `!신청 ${id} ${artist} - ${title}`,
      likeCount: 0,
      isFeatured: false,
      isHidden: false,
      createdAt,
      updatedAt: createdAt,
    };

    const nextRequests = [request, ...requests];
    setRequests(nextRequests);
    saveRequests(nextRequests);

    if (firebaseMode) {
      try {
        await createSongRequestInFirestore(request);
      } catch {
        showToast("Firestore 저장에 실패해 로컬 요청으로만 저장했어요");
      }
    } else {
      setSongs((prev) => [newSong, ...prev]);
    }

    setForm(emptyForm);
    setThumbState("idle");
    setThumbCandidates([]);
    setSelectedThumb(null);
    setRequestOpen(false);
    setSort("recent");
    setActiveTag("전체");
    showToast(firebaseMode ? "노래 추가 요청이 접수됐어요" : "노래 추가 요청이 저장됐어요");
    scrollToSongbook();
  }

  return (
    <main className="songbook-shell pb-20">
      <div className="container-main">
        <NavBar
          siteTitle={siteSettings.siteTitle}
          adminProfile={adminProfile}
          onReset={resetAll}
          onRequest={openRequestModal}
          onGoogleLogin={handleGoogleLogin}
          onLogout={handleGoogleLogout}
        />

        <HeroSection
          songs={visibleSongs.length ? visibleSongs : songs}
          settings={siteSettings}
          favoriteCount={favoriteCount}
          featuredCount={featuredCount}
          recentCount={recentCount}
          onFind={scrollToSongbook}
          onRandom={randomPick}
          onRequest={openRequestModal}
        />

        <FeatureStrip />

        {siteSettings.announcement ? (
          <section className="mt-5 rounded-[22px] border border-[#E7D6BE] bg-white/75 p-4 text-sm font-bold leading-6 text-[#7A5A2E] shadow-card">
            {siteSettings.announcement}
          </section>
        ) : null}

        <section
          id="songbook"
          className="sticky top-3 z-30 mt-12 rounded-[26px] border border-white/70 bg-white/70 p-4 shadow-soft backdrop-blur-xl md:p-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="whitespace-nowrap text-sm font-bold text-[#5b5368] md:text-[15px]">
              총 {songs.length}곡 중 <span className="text-deep-lavender">{visibleSongs.length}곡</span>
            </div>
            <label className="relative flex min-w-[230px] flex-1 items-center">
              <Search className="pointer-events-none absolute left-4 h-4 w-4 text-deep-lavender" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="곡명, 가수, 분위기로 검색"
                aria-label="노래 검색"
                className="focus-ring h-12 w-full rounded-2xl border border-[#EAE0F5] bg-white pl-11 pr-4 text-sm font-semibold text-ink outline-none transition focus:border-deep-lavender"
              />
            </label>
            <button
              type="button"
              onClick={() => setLikedOnly((prev) => !prev)}
              className={`focus-ring lift inline-flex h-12 items-center gap-2 rounded-2xl border px-4 text-sm font-bold ${
                likedOnly
                  ? "border-lotionpink bg-lotionpink text-white shadow-[0_8px_18px_rgba(245,168,200,.35)]"
                  : "border-[#E7DEF7] bg-white text-[#4a3f6b]"
              }`}
            >
              <Heart className="h-4 w-4" fill={likedOnly ? "currentColor" : "none"} />
              좋아요만
            </button>
            <button
              type="button"
              onClick={randomPick}
              className="focus-ring lift inline-flex h-12 items-center gap-2 rounded-2xl border border-[#E7DEF7] bg-white px-4 text-sm font-bold text-[#4a3f6b]"
            >
              <Shuffle className="h-4 w-4" />
              랜덤
            </button>
            <div className="flex h-12 items-center gap-1 rounded-2xl bg-[#F1EBE0] p-1">
              <ViewButton active={viewMode === "card"} label="카드형" onClick={() => setViewMode("card")}>
                <Grid2X2 className="h-4 w-4" />
              </ViewButton>
              <ViewButton active={viewMode === "compact"} label="컴팩트형" onClick={() => setViewMode("compact")}>
                <List className="h-4 w-4" />
              </ViewButton>
            </div>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
              aria-label="정렬"
              className="focus-ring h-12 rounded-2xl border border-[#E7DEF7] bg-white px-4 text-sm font-bold text-[#4a3f6b] outline-none"
            >
              <option value="recent">최신순</option>
              <option value="title">제목순</option>
              <option value="artist">가수순</option>
              <option value="likes">좋아요순</option>
              <option value="difficulty">난이도순</option>
              <option value="random">랜덤순</option>
            </select>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {defaultTags.map((tag, index) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag)}
                className={`focus-ring shrink-0 rounded-xl border px-4 py-2 text-[13px] font-bold transition hover:-translate-y-0.5 ${
                  activeTag === tag
                    ? "border-deep-lavender bg-deep-lavender text-white shadow-[0_8px_18px_rgba(123,97,255,.26)]"
                    : "border-[#EBE1D2] bg-white text-[#5b5368]"
                }`}
                style={{ transform: `rotate(${(index % 5) - 2}deg)` }}
              >
                {tag}
              </button>
            ))}
          </div>
        </section>

        {visibleSongs.length ? (
          viewMode === "card" ? (
            <section className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visibleSongs.map((song) => (
                <SongCard
                  key={song.id}
                  song={song}
                  liked={likedIds.has(song.id)}
                  highlighted={highlightId === song.id}
                  onLike={toggleLike}
                  onCopy={copyCommand}
                  onOpen={() => setDetailSongId(song.id)}
                />
              ))}
            </section>
          ) : (
            <section className="mt-7 space-y-3">
              {visibleSongs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  liked={likedIds.has(song.id)}
                  highlighted={highlightId === song.id}
                  onLike={toggleLike}
                  onCopy={copyCommand}
                  onOpen={() => setDetailSongId(song.id)}
                />
              ))}
            </section>
          )
        ) : (
          <EmptyState onReset={resetAll} onRequest={openRequestModal} />
        )}

        <section className="mt-16 rounded-[28px] border border-white/70 bg-white/70 p-7 shadow-card md:flex md:items-center md:justify-between md:p-9">
          <div>
            <p className="text-sm font-extrabold text-deep-lavender">찾는 노래가 없다면</p>
            <h2 className="mt-2 text-2xl font-extrabold text-ink md:text-3xl">노래 추가 요청을 남겨주세요.</h2>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-muted">
              요청은 운영자가 확인한 뒤 노래책에 반영됩니다. YouTube 링크를 함께 남기면 썸네일 후보 확인이 빨라집니다.
            </p>
          </div>
          <button
            type="button"
            onClick={openRequestModal}
            disabled={!siteSettings.requestEnabled}
            className="focus-ring lift mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-deep-lavender px-5 text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(123,97,255,.30)] disabled:opacity-50 md:mt-0"
          >
            <Plus className="h-4 w-4" />
            노래 추가 요청
          </button>
        </section>

        <footer className="py-12 text-center text-xs font-semibold text-muted">
          {siteSettings.siteTitle} · 검색, 좋아요, 랜덤, 요청까지 촉촉하게 준비 중
        </footer>
      </div>

      {detailSong ? (
        <DetailModal
          song={detailSong}
          liked={likedIds.has(detailSong.id)}
          onClose={() => setDetailSongId(null)}
          onLike={(songId) => toggleLike(songId)}
          onCopy={(song) => copyCommand(song)}
        />
      ) : null}

      {requestOpen ? (
        <RequestModal
          form={form}
          thumbState={thumbState}
          candidates={thumbCandidates}
          selectedThumb={selectedThumb}
          onClose={() => setRequestOpen(false)}
          onChange={updateForm}
          onFindThumbnails={findThumbnails}
          onSelectThumbnail={setSelectedThumb}
          onSubmit={submitRequest}
        />
      ) : null}

      {toast ? (
        <div className="animate-toast fixed bottom-6 left-1/2 z-50 max-w-[calc(100%-32px)] -translate-x-1/2 rounded-2xl border border-white/70 bg-ink px-5 py-3 text-sm font-bold text-white shadow-soft">
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function NavBar({
  siteTitle,
  adminProfile,
  onReset,
  onRequest,
  onGoogleLogin,
  onLogout,
}: {
  siteTitle: string;
  adminProfile: AdminProfile | null;
  onReset: () => void;
  onRequest: () => void;
  onGoogleLogin: () => void;
  onLogout: () => void;
}) {
  return (
    <nav className="sticky top-3 z-40 mt-4 flex items-center gap-3 rounded-full border border-white/70 bg-cream/80 px-4 py-3 shadow-card backdrop-blur-xl">
      <button type="button" onClick={onReset} className="focus-ring flex items-center gap-3 rounded-full">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-lavender to-deep-lavender text-white shadow-[0_6px_14px_rgba(123,97,255,.32)]">
          <Music2 className="h-5 w-5" />
        </span>
        <span className="text-[17px] font-extrabold text-ink">{siteTitle}</span>
      </button>
      <div className="ml-auto hidden items-center gap-2 text-sm font-bold text-muted md:flex">
        <a className="rounded-full px-3 py-2 hover:bg-white/70" href="#songbook">
          노래책
        </a>
        <button type="button" onClick={onRequest} className="rounded-full px-3 py-2 hover:bg-white/70">
          요청하기
        </button>
      </div>
      {adminProfile ? (
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            href="/admin"
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-deep-lavender px-4 text-sm font-extrabold text-white shadow-card"
          >
            <Settings className="h-4 w-4" />
            설정
          </Link>
          <button
            type="button"
            onClick={onLogout}
            aria-label="로그아웃"
            title="로그아웃"
            className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-white text-muted shadow-card"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <button
            type="button"
            onClick={onGoogleLogin}
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-extrabold text-ink shadow-card"
          >
            G
            로그인
          </button>
          <button
            type="button"
            onClick={onRequest}
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-extrabold text-deep-lavender shadow-card"
          >
            <Plus className="h-4 w-4" />
            요청
          </button>
        </div>
      )}
    </nav>
  );
}

function HeroSection({
  songs,
  settings,
  favoriteCount,
  featuredCount,
  recentCount,
  onFind,
  onRandom,
  onRequest,
}: {
  songs: Song[];
  settings: SiteSettings;
  favoriteCount: number;
  featuredCount: number;
  recentCount: number;
  onFind: () => void;
  onRandom: () => void;
  onRequest: () => void;
}) {
  return (
    <header className="grid gap-10 px-2 pb-10 pt-16 md:grid-cols-[1fr_440px] md:items-center md:pt-20">
      <div className="animate-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#EAE0FB] bg-white px-4 py-2 text-sm font-bold text-deep-lavender shadow-card">
          <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_0_4px_rgba(98,201,155,.18)]" />
          총 {songs.length}곡 · 로션픽 업데이트 중
        </span>
        <h1 className="mt-6 max-w-2xl text-[42px] font-extrabold leading-[1.06] text-ink md:text-[58px]">
          {settings.heroTitle}
          <br />
          {settings.siteTitle}에서 골라봐요.
        </h1>
        <p className="mt-6 max-w-[520px] text-base font-medium leading-7 text-muted">
          {settings.heroSubtitle}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onFind}
            className="focus-ring lift inline-flex h-13 items-center gap-2 rounded-2xl bg-deep-lavender px-6 py-4 text-[15px] font-extrabold text-white shadow-[0_12px_26px_rgba(123,97,255,.30)]"
          >
            <Search className="h-5 w-5" />
            노래 찾기
          </button>
          <button
            type="button"
            onClick={onRandom}
            className="focus-ring lift inline-flex items-center gap-2 rounded-2xl border border-[#E7DEF7] bg-white px-6 py-4 text-[15px] font-extrabold text-[#4a3f6b] shadow-card"
          >
            <Shuffle className="h-5 w-5" />
            랜덤으로 뽑기
          </button>
          <button
            type="button"
            onClick={onRequest}
            className="focus-ring lift inline-flex items-center gap-2 rounded-2xl border-2 border-deep-lavender bg-white px-6 py-4 text-[15px] font-extrabold text-deep-lavender shadow-card"
          >
            <Plus className="h-5 w-5" />
            노래 추가 요청
          </button>
        </div>
      </div>

      <div className="relative hidden h-[430px] animate-fade-up md:block">
        {songs.slice(0, 3).map((song, index) => (
          <FloatingSong key={song.id} song={song} index={index} />
        ))}
        <div className="absolute bottom-4 left-3 w-[250px] rounded-[24px] border border-white/80 bg-white/80 p-5 shadow-soft backdrop-blur-md">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted">로션욤 대시보드</div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <Stat value={favoriteCount} label="좋아요" tone="text-deep-lavender" />
            <Stat value={featuredCount} label="로션픽" tone="text-lotionpink" />
            <Stat value={recentCount} label="최근추가" tone="text-success" />
          </div>
        </div>
      </div>
    </header>
  );
}

function FloatingSong({ song, index }: { song: Song; index: number }) {
  const positions = [
    "right-3 top-0 w-[196px] [--card-rotate:-4deg]",
    "right-[138px] top-[104px] w-[184px] [--card-rotate:5deg]",
    "right-6 top-[198px] w-[190px] [--card-rotate:-6deg]",
  ];

  return (
    <div
      className={`absolute overflow-hidden rounded-[22px] border border-white/75 bg-[#FFFDFA] shadow-soft ${positions[index]}`}
      style={{ animation: `floatSoft ${8 + index}s ease-in-out infinite` }}
    >
      <Thumbnail song={song} className="h-[118px]" />
      <div className="p-4">
        <div className="truncate text-[15px] font-extrabold text-ink">{song.title}</div>
        <div className="mt-1 text-xs font-semibold text-muted">{song.artist}</div>
      </div>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div>
      <div className={`text-2xl font-extrabold ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] font-bold text-muted">{label}</div>
    </div>
  );
}

function FeatureStrip() {
  const features = [
    { icon: Search, title: "빠른 검색", desc: "곡명, 가수, 태그, 초성으로 찾기", bg: "bg-pale-lavender text-deep-lavender" },
    { icon: Heart, title: "좋아요 저장", desc: "자주 듣고 싶은 곡만 따로 보기", bg: "bg-[#FDE7F0] text-[#C85C8E]" },
    { icon: BadgeCheck, title: "썸네일 후보", desc: "요청 단계에서 후보를 고르는 구조", bg: "bg-[#F3E9D8] text-[#9A7B3F]" },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {features.map((feature) => (
        <div key={feature.title} className="lift rounded-[22px] border border-[#EFE6D6] bg-white/70 p-5 shadow-card">
          <div className={`grid h-11 w-11 place-items-center rounded-2xl ${feature.bg}`}>
            <feature.icon className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-extrabold text-ink">{feature.title}</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-muted">{feature.desc}</p>
        </div>
      ))}
    </section>
  );
}

function ViewButton({
  active,
  label,
  children,
  onClick,
}: {
  active: boolean;
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`focus-ring grid h-10 w-10 place-items-center rounded-xl border-0 transition ${
        active ? "bg-white text-ink shadow-card" : "bg-transparent text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function SongCard({
  song,
  liked,
  highlighted,
  onLike,
  onCopy,
  onOpen,
}: {
  song: Song;
  liked: boolean;
  highlighted: boolean;
  onLike: (songId: string, event?: MouseEvent) => void;
  onCopy: (song: Song, event?: MouseEvent) => void;
  onOpen: () => void;
}) {
  return (
    <article
      id={`song-${song.id}`}
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
      className={`lift group cursor-pointer overflow-hidden rounded-[22px] border border-[#F0E7D8] bg-[#FFFDFA] shadow-card ${
        highlighted ? "highlight-card" : ""
      }`}
    >
      <div className="relative">
        <Thumbnail song={song} className="h-[150px]" />
        <button
          type="button"
          onClick={(event) => onLike(song.id, event)}
          aria-label={liked ? "좋아요 취소" : "좋아요"}
          className="focus-ring absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/85 text-lotionpink shadow-card backdrop-blur transition group-hover:scale-105"
        >
          <Heart className="h-4 w-4" fill={liked ? "currentColor" : "none"} />
        </button>
        <span className="absolute bottom-3 left-3 rounded-xl bg-white/90 px-3 py-1.5 text-[11px] font-extrabold text-deep-lavender backdrop-blur">
          {thumbnailBadge(song)}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-lg font-extrabold leading-tight text-ink">{song.title}</h3>
            <p className="mt-1 truncate text-sm font-semibold text-muted">{song.artist}</p>
          </div>
          <span className="shrink-0 rounded-lg bg-pale-lavender px-2.5 py-1 text-[11px] font-extrabold text-deep-lavender">
            {statusLabel[song.status]}
          </span>
        </div>
        <TagList tags={song.tags} />
        <div className="mt-4 flex items-center justify-between gap-3">
          <Difficulty value={song.difficulty} />
          <button
            type="button"
            onClick={(event) => onCopy(song, event)}
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E7DEF7] bg-white px-3 text-xs font-extrabold text-[#4a3f6b]"
          >
            <Clipboard className="h-3.5 w-3.5" />
            복사
          </button>
        </div>
      </div>
    </article>
  );
}

function SongRow({
  song,
  liked,
  highlighted,
  onLike,
  onCopy,
  onOpen,
}: {
  song: Song;
  liked: boolean;
  highlighted: boolean;
  onLike: (songId: string, event?: MouseEvent) => void;
  onCopy: (song: Song, event?: MouseEvent) => void;
  onOpen: () => void;
}) {
  return (
    <article
      id={`song-${song.id}`}
      onClick={onOpen}
      className={`lift flex cursor-pointer items-center gap-4 rounded-[20px] border border-[#F0E7D8] bg-[#FFFDFA] p-3 shadow-card ${
        highlighted ? "highlight-card" : ""
      }`}
    >
      <Thumbnail song={song} className="h-16 w-20 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-extrabold text-ink">{song.title}</h3>
          <span className="rounded-lg bg-pale-lavender px-2 py-1 text-[11px] font-extrabold text-deep-lavender">
            {statusLabel[song.status]}
          </span>
        </div>
        <p className="mt-1 text-sm font-semibold text-muted">{song.artist}</p>
        <div className="mt-2 hidden md:block">
          <TagList tags={song.tags} compact />
        </div>
      </div>
      <Difficulty value={song.difficulty} />
      <button
        type="button"
        onClick={(event) => onLike(song.id, event)}
        aria-label={liked ? "좋아요 취소" : "좋아요"}
        className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#EFE6D6] bg-white text-lotionpink"
      >
        <Heart className="h-4 w-4" fill={liked ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        onClick={(event) => onCopy(song, event)}
        aria-label="신청 문구 복사"
        title="신청 문구 복사"
        className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#E7DEF7] bg-white text-[#4a3f6b]"
      >
        <Clipboard className="h-4 w-4" />
      </button>
    </article>
  );
}

function Thumbnail({ song, className }: { song: Song; className: string }) {
  const fallbacks = song.youtubeVideoId ? youtubeThumbnailCandidates(song.youtubeVideoId) : [];
  const thumbnailSources = song.thumbnailUrl ? [song.thumbnailUrl, ...fallbacks.filter((url) => url !== song.thumbnailUrl)] : fallbacks;
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const videoThumb = thumbnailSources[fallbackIndex] || "";
  const gradient = gradientFor(song.id + song.title);

  useEffect(() => {
    const timer = window.setTimeout(() => setFallbackIndex(0), 0);
    return () => window.clearTimeout(timer);
  }, [song.thumbnailUrl, song.youtubeVideoId]);

  return (
    <div className={`relative overflow-hidden bg-cover bg-center ${className}`} style={{ background: gradient }}>
      {videoThumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={videoThumb}
          alt={`${song.title} 썸네일`}
          className="h-full w-full object-cover opacity-95 transition duration-300 group-hover:scale-105"
          onError={(event) => {
            if (fallbackIndex < thumbnailSources.length - 1) {
              setFallbackIndex((prev) => prev + 1);
            } else {
              event.currentTarget.style.display = "none";
            }
          }}
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/18" />
      <div className="absolute bottom-3 right-4 text-4xl font-extrabold text-white/60">{song.title.trim().charAt(0)}</div>
    </div>
  );
}

function TagList({ tags, compact = false }: { tags: string[]; compact?: boolean }) {
  const visible = tags.slice(0, compact ? 4 : 3);
  const hidden = tags.length - visible.length;

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "mt-3"}`}>
      {visible.map((tag) => (
        <span key={tag} className={`rounded-lg border px-2.5 py-1 font-bold ${tagClass(tag)}`}>
          {tag}
        </span>
      ))}
      {hidden > 0 ? (
        <span className="rounded-lg border border-[#E4DBCB] bg-[#F1ECE3] px-2.5 py-1 text-[11px] font-bold text-muted">
          +{hidden}
        </span>
      ) : null}
    </div>
  );
}

function Difficulty({ value }: { value: Song["difficulty"] }) {
  return (
    <div className="flex items-center gap-1" aria-label={`난이도 ${value}`}>
      {[1, 2, 3].map((step) => (
        <span
          key={step}
          className={`h-1.5 w-4 rounded-full ${step <= value ? "bg-deep-lavender" : "bg-[#E7DED0]"}`}
        />
      ))}
    </div>
  );
}

function EmptyState({ onReset, onRequest }: { onReset: () => void; onRequest: () => void }) {
  return (
    <section className="mt-8 rounded-[28px] border border-white/70 bg-white/75 p-10 text-center shadow-card">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-pale-lavender text-deep-lavender">
        <Search className="h-6 w-6" />
      </div>
      <h2 className="mt-5 text-2xl font-extrabold text-ink">조건에 맞는 노래가 없어요.</h2>
      <p className="mt-2 text-sm font-medium text-muted">필터를 초기화하거나 새 노래를 요청해보세요.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={onReset}
          className="focus-ring inline-flex h-11 items-center gap-2 rounded-2xl border border-[#E7DEF7] bg-white px-4 text-sm font-extrabold text-[#4a3f6b]"
        >
          <RotateCcw className="h-4 w-4" />
          초기화
        </button>
        <button
          type="button"
          onClick={onRequest}
          className="focus-ring inline-flex h-11 items-center gap-2 rounded-2xl bg-deep-lavender px-4 text-sm font-extrabold text-white"
        >
          <Plus className="h-4 w-4" />
          요청하기
        </button>
      </div>
    </section>
  );
}

function DetailModal({
  song,
  liked,
  onClose,
  onLike,
  onCopy,
}: {
  song: Song;
  liked: boolean;
  onClose: () => void;
  onLike: (songId: string) => void;
  onCopy: (song: Song) => void;
}) {
  return (
    <ModalShell onClose={onClose}>
      <div className="animate-modal w-full max-w-xl overflow-hidden rounded-[28px] bg-[#FFFDFA] shadow-soft">
        <Thumbnail song={song} className="h-[230px]" />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-ink">{song.title}</h2>
              <p className="mt-1 text-sm font-bold text-muted">{song.artist}</p>
            </div>
            <button type="button" onClick={onClose} className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-[#F4ECE0]">
              <X className="h-5 w-5" />
            </button>
          </div>
          <TagList tags={song.tags} />
          <div className="mt-5 rounded-2xl bg-[#F8F2E8] p-4 text-sm font-medium leading-6 text-muted">
            {song.memo || "메모가 아직 없어요."}
          </div>
          <div className="mt-4 rounded-2xl border border-[#EFE6D6] bg-white p-4 text-sm font-bold text-[#4a3f6b]">
            {song.requestCommand}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onLike(song.id)}
              className={`focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold ${
                liked ? "bg-lotionpink text-white" : "bg-deep-lavender text-white"
              }`}
            >
              <Heart className="h-4 w-4" fill={liked ? "currentColor" : "none"} />
              {liked ? "좋아요 됨" : "좋아요"}
            </button>
            <button
              type="button"
              onClick={() => onCopy(song)}
              className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#E7DEF7] bg-white text-sm font-extrabold text-[#4a3f6b]"
            >
              <Clipboard className="h-4 w-4" />
              신청 문구 복사
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function RequestModal({
  form,
  thumbState,
  candidates,
  selectedThumb,
  onClose,
  onChange,
  onFindThumbnails,
  onSelectThumbnail,
  onSubmit,
}: {
  form: RequestForm;
  thumbState: "idle" | "loading" | "done";
  candidates: YoutubeCandidate[];
  selectedThumb: YoutubeCandidate | null;
  onClose: () => void;
  onChange: (key: keyof RequestForm, value: string) => void;
  onFindThumbnails: () => void;
  onSelectThumbnail: (candidate: YoutubeCandidate) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <ModalShell onClose={onClose}>
      <form
        onSubmit={onSubmit}
        className="animate-modal max-h-[min(760px,calc(100vh-32px))] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-[#FFFDFA] p-6 shadow-soft"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-extrabold text-deep-lavender">노래 추가 요청</p>
            <h2 className="mt-1 text-2xl font-extrabold text-ink">찾는 노래를 남겨주세요.</h2>
          </div>
          <button type="button" onClick={onClose} className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-[#F4ECE0]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="곡명" value={form.title} onChange={(value) => onChange("title", value)} required />
          <Field label="가수" value={form.artist} onChange={(value) => onChange("artist", value)} required />
          <Field label="태그" value={form.tags} onChange={(value) => onChange("tags", value)} placeholder="K-POP, 발라드" />
          <Field label="닉네임" value={form.nickname} onChange={(value) => onChange("nickname", value)} />
          <div className="sm:col-span-2">
            <Field
              label="YouTube URL"
              value={form.youtubeUrl}
              onChange={(value) => onChange("youtubeUrl", value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </div>
          <label className="sm:col-span-2">
            <span className="text-sm font-extrabold text-ink">요청 이유</span>
            <textarea
              value={form.reason}
              onChange={(event) => onChange("reason", event.target.value)}
              rows={4}
              className="focus-ring mt-2 w-full resize-none rounded-2xl border border-[#E7DEF7] bg-white p-4 text-sm font-semibold text-ink outline-none"
              placeholder="어떤 분위기에 어울리는 노래인지 적어주세요"
            />
          </label>
        </div>

        <div className="mt-5 rounded-[22px] border border-[#EFE6D6] bg-[#F8F2E8] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-ink">유튜브 썸네일 후보</h3>
              <p className="mt-1 text-xs font-semibold text-muted">현재는 샘플 후보이며, 9차에서 실제 YouTube API로 연결합니다.</p>
            </div>
            <button
              type="button"
              onClick={onFindThumbnails}
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-4 text-xs font-extrabold text-deep-lavender shadow-card"
            >
              {thumbState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              썸네일 찾기
            </button>
          </div>

          {thumbState === "loading" ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="skeleton h-[62px] rounded-2xl" />
              ))}
            </div>
          ) : null}

          {thumbState === "done" ? (
            <div className="mt-4 space-y-3">
              {candidates.map((candidate) => {
                const selected = selectedThumb?.id === candidate.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => onSelectThumbnail(candidate)}
                    className={`focus-ring flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left ${
                      selected ? "border-deep-lavender shadow-[0_0_0_3px_rgba(123,97,255,.16)]" : "border-[#EFE6D6]"
                    }`}
                  >
                    <div
                      className="grid h-14 w-20 shrink-0 place-items-center rounded-xl text-xs font-extrabold text-white"
                      style={{ background: gradientFor(candidate.gradientSeed) }}
                    >
                      {candidate.confidence}%
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-extrabold text-ink">{candidate.title}</div>
                      <div className="mt-1 text-xs font-bold text-muted">
                        {candidate.channelTitle} {candidate.official ? "· 공식 후보" : ""}
                      </div>
                    </div>
                    <span
                      className={`rounded-xl px-3 py-2 text-xs font-extrabold ${
                        selected ? "bg-deep-lavender text-white" : "bg-pale-lavender text-deep-lavender"
                      }`}
                    >
                      {selected ? "선택됨" : "사용"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring h-12 rounded-2xl border border-[#E7DEF7] bg-white px-5 text-sm font-extrabold text-[#4a3f6b]"
          >
            취소
          </button>
          <button type="submit" className="focus-ring h-12 rounded-2xl bg-deep-lavender px-5 text-sm font-extrabold text-white">
            요청 저장
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="text-sm font-extrabold text-ink">
        {label}
        {required ? <span className="text-deep-lavender"> *</span> : null}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="focus-ring mt-2 h-12 w-full rounded-2xl border border-[#E7DEF7] bg-white px-4 text-sm font-semibold text-ink outline-none"
      />
    </label>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-ink/35 p-4 backdrop-blur-sm"
    >
      <div role="presentation" onMouseDown={(event) => event.stopPropagation()} className="w-full">
        {children}
      </div>
    </div>
  );
}

function thumbnailBadge(song: Song) {
  if (song.thumbnailSource === "manual") return "직접 등록";
  if (song.thumbnailSource === "pending" || !song.thumbnailConfidence) return "썸네일 대기";
  if (song.thumbnailSource === "default") return "기본 썸네일";
  return `공식 후보 ${song.thumbnailConfidence}%`;
}

function gradientFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const pair = gradientPairs[hash % gradientPairs.length];
  return `linear-gradient(135deg, ${pair[0]} 0%, ${pair[1]} 100%)`;
}

function tagClass(tag: string) {
  const base = "text-[11px]";
  const map: Record<string, string> = {
    "K-POP": "border-[#DCD2FF] bg-pale-lavender text-deep-lavender",
    "J-POP": "border-[#CDE9DE] bg-[#E3F2EC] text-[#2E8B6B]",
    POP: "border-[#D5E0F5] bg-[#EAF0FB] text-[#3E63B8]",
    발라드: "border-[#E7D6BE] bg-[#F3E9D8] text-[#9A7B3F]",
    애니메이션: "border-[#F8CFDE] bg-[#FDE7F0] text-[#C85C8E]",
    로션픽: "border-deep-lavender bg-deep-lavender text-white",
    신나는: "border-[#F6DDBB] bg-[#FFF0DE] text-[#C9822F]",
    잔잔한: "border-[#D3E7EE] bg-[#EAF3F6] text-[#3E7E93]",
    "락/밴드": "border-[#F3D2CC] bg-[#FBE9E7] text-[#C0563F]",
    인디: "border-[#DCDEE3] bg-[#EDEEF0] text-[#5B6270]",
    요청곡: "border-[#DCD2FF] bg-pale-lavender text-deep-lavender",
  };

  return `${base} ${map[tag] ?? "border-[#E4DBCB] bg-[#F1ECE3] text-muted"}`;
}
