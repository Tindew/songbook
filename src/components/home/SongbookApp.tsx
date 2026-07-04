"use client";

import {
  Clipboard,
  Grid2X2,
  Heart,
  List,
  Loader2,
  LogOut,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shuffle,
  Sparkles,
  X,
} from "lucide-react";
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { defaultTags, songTagOptions } from "@/data/seedSongs";
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
  fetchAdminProfileByIdentity,
  fetchSiteSettings,
  fetchSongsFromFirestore,
  firebaseAvailable,
} from "@/lib/firebase/firestore";
import { loginWithGoogle, logoutAdmin, subscribeAuth } from "@/lib/firebase/auth";
import { fetchUserLikedSongIds, setSongLike } from "@/lib/firebase/likes";
import { describeFirebaseError } from "@/lib/firebase/errors";
import { buildRequestCommand } from "@/lib/songs/command";
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
  tags: string[];
  youtubeUrl: string;
  nickname: string;
  reason: string;
};

const emptyForm: RequestForm = {
  title: "",
  artist: "",
  tags: [],
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
  const [sort, setSort] = useState<SortOption>("likes");
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
    // Firebase 모드에서는 좋아요를 유저 계정(Firestore)에 저장하므로 로컬 저장을 건너뛴다.
    if (!hydrated || firebaseMode) return;
    saveLikedIds(likedIds);
  }, [firebaseMode, hydrated, likedIds]);

  useEffect(() => {
    if (!firebaseMode) return;

    const uid = adminSession?.firebaseUid;
    let cancelled = false;

    if (!uid) {
      const timer = window.setTimeout(() => {
        if (!cancelled) setLikedIds(new Set());
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    void fetchUserLikedSongIds(uid)
      .then((ids) => {
        if (!cancelled) setLikedIds(ids);
      })
      .catch(() => {
        if (!cancelled) setLikedIds(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [firebaseMode, adminSession?.firebaseUid]);

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
    const sessionEmail = adminSession.email;
    const timer = window.setTimeout(() => {
      async function verifyAdmin() {
        try {
          const profile = await fetchAdminProfileByIdentity({ uid: firebaseUid, googleId, email: sessionEmail });
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

        // 관리자 여부 확인은 로그인 성공과 분리한다.
        // 일반 유저는 admins 컬렉션 조회 권한이 없어 실패할 수 있는데, 이는 로그인 실패가 아니다.
        let profile: AdminProfile | null = null;
        try {
          profile = await fetchAdminProfileByIdentity({ uid: session.firebaseUid, googleId: session.googleId, email: session.email });
        } catch (adminError) {
          console.debug("Admin lookup skipped for non-admin user", adminError);
        }
        setAdminProfile(profile ?? localAdminProfile(session.googleId));
        showToast("Google로 로그인했어요");
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
        profile = (await fetchAdminProfileByIdentity({ uid: session.firebaseUid, googleId: session.googleId, email: session.email })) ?? profile;
      } catch {
        profile = localAdminProfile(session.googleId);
      }
    }

    setAdminProfile(profile);
    showToast("로그인했어요");
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
    setSort("likes");
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

  function adjustLikeCount(songId: string, delta: number) {
    setSongs((prev) =>
      prev.map((song) => (song.id === songId ? { ...song, likeCount: Math.max(0, song.likeCount + delta) } : song)),
    );
  }

  async function toggleLike(songId: string, event?: MouseEvent) {
    event?.stopPropagation();

    const willLike = !likedIds.has(songId);

    if (firebaseMode) {
      const uid = adminSession?.firebaseUid;
      if (!uid) {
        showToast("좋아요는 로그인 후 이용할 수 있어요");
        return;
      }

      // 낙관적 업데이트
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (willLike) next.add(songId);
        else next.delete(songId);
        return next;
      });
      adjustLikeCount(songId, willLike ? 1 : -1);

      try {
        await setSongLike(uid, songId, willLike);
      } catch (error) {
        console.error("Failed to update like", error);
        // 실패 시 롤백
        setLikedIds((prev) => {
          const next = new Set(prev);
          if (willLike) next.delete(songId);
          else next.add(songId);
          return next;
        });
        adjustLikeCount(songId, willLike ? -1 : 1);
        showToast("좋아요를 저장하지 못했어요. 잠시 후 다시 시도해주세요");
      }
      return;
    }

    // 로컬 모드: 기기 단위 좋아요 (누적 카운트도 로컬에서 반영)
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (willLike) next.add(songId);
      else next.delete(songId);
      return next;
    });
    adjustLikeCount(songId, willLike ? 1 : -1);
  }

  async function copyCommand(song: Song, event?: MouseEvent) {
    event?.stopPropagation();
    if (!siteSettings.copyCommandEnabled) {
      showToast("지금은 신청 문구 복사가 잠시 닫혀 있어요");
      return;
    }

    const command = buildRequestCommand(song);
    try {
      await navigator.clipboard.writeText(command);
      showToast("신청 문구를 복사했어요");
    } catch {
      showToast(command);
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

  function updateForm(key: "title" | "artist" | "youtubeUrl" | "nickname" | "reason", value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleRequestTag(tag: string) {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((item) => item !== tag) : [...prev.tags, tag],
    }));
  }

  async function findThumbnails() {
    const title = form.title.trim();
    const artist = form.artist.trim();

    if (!title && !artist) {
      showToast("곡명 또는 가수명을 입력한 뒤 썸네일을 찾아주세요.");
      return;
    }

    setThumbState("loading");
    setSelectedThumb(null);
    setThumbCandidates([]);

    try {
      const response = await fetch("/api/youtube/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, artist }),
      });
      const data = (await response.json()) as { candidates?: YoutubeCandidate[] };
      setThumbCandidates(data.candidates ?? []);
      setThumbState("done");
    } catch {
      setThumbState("idle");
      showToast("유튜브 썸네일 후보를 불러오지 못했습니다.");
    }
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
    const tags = form.tags.map((tag) => tag.trim()).filter(Boolean);
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
      requestCommand: buildRequestCommand({ artist, title }),
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
          userName={adminSession?.displayName ?? null}
          isLoggedIn={Boolean(adminSession)}
          onReset={resetAll}
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

          <div className="mt-4 flex flex-wrap gap-2 pb-1">
            {defaultTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag)}
                className={`focus-ring shrink-0 rounded-xl border px-4 py-2 text-[13px] font-bold transition hover:-translate-y-0.5 ${
                  activeTag === tag
                    ? "border-deep-lavender bg-deep-lavender text-white shadow-[0_8px_18px_rgba(123,97,255,.26)]"
                    : "border-[#EBE1D2] bg-white text-[#5b5368]"
                }`}
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
          tagOptions={songTagOptions}
          thumbState={thumbState}
          candidates={thumbCandidates}
          selectedThumb={selectedThumb}
          onClose={() => setRequestOpen(false)}
          onChange={updateForm}
          onToggleTag={toggleRequestTag}
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
  userName,
  isLoggedIn,
  onReset,
  onGoogleLogin,
  onLogout,
}: {
  siteTitle: string;
  adminProfile: AdminProfile | null;
  userName: string | null;
  isLoggedIn: boolean;
  onReset: () => void;
  onGoogleLogin: () => void;
  onLogout: () => void;
}) {
  return (
    <nav className="sticky top-3 z-40 mt-4 flex items-center gap-3 rounded-full border border-white/70 bg-cream/80 px-4 py-3 shadow-card backdrop-blur-xl">
      <button type="button" onClick={onReset} className="focus-ring flex items-center gap-3 rounded-full">
        <span className="grid h-9 w-9 place-items-center rounded-xl">
          <Image src="/logo.svg" alt="" width={36} height={36} className="h-9 w-9" />
        </span>
        <span className="text-[17px] font-extrabold text-ink">{siteTitle}</span>
      </button>
      {isLoggedIn ? (
        <div className="ml-auto flex items-center gap-2">
          {userName ? (
            <span className="hidden max-w-[160px] truncate rounded-full bg-white px-4 py-2 text-sm font-bold text-[#4a3f6b] shadow-card sm:inline-block">
              {userName}
            </span>
          ) : null}
          {adminProfile ? (
            <Link
              href="/admin"
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-deep-lavender px-4 text-sm font-extrabold text-white shadow-card"
            >
              <Settings className="h-4 w-4" />
              설정
            </Link>
          ) : null}
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
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onGoogleLogin}
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-extrabold text-ink shadow-card"
          >
            G
            로그인
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
  const badge = thumbnailBadge(song);

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
        {badge ? (
          <span className="absolute bottom-3 left-3 rounded-xl bg-white/90 px-3 py-1.5 text-[11px] font-extrabold text-deep-lavender backdrop-blur">
            {badge}
          </span>
        ) : null}
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
        <TagList tags={song.tags} likeCount={song.likeCount} />
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
          <TagList tags={song.tags} compact likeCount={song.likeCount} />
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
    </div>
  );
}

function TagList({ tags, compact = false, likeCount }: { tags: string[]; compact?: boolean; likeCount?: number }) {
  const visible = tags.slice(0, compact ? 4 : 3);
  const hidden = tags.length - visible.length;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "mt-3"}`}>
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
      {typeof likeCount === "number" ? (
        <span className="inline-flex items-center gap-1 rounded-lg border border-[#F3D6E2] bg-[#FDEFF4] px-2.5 py-1 text-[11px] font-bold text-lotionpink">
          <Heart className="h-3 w-3" fill="currentColor" />
          좋아요 {likeCount}개
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
          <TagList tags={song.tags} likeCount={song.likeCount} />
          {song.memo && (
            <div className="mt-5 rounded-2xl bg-[#F8F2E8] p-4 text-sm font-medium leading-6 text-muted">
              {song.memo}
            </div>
          )}
          <div className="mt-4 rounded-2xl border border-[#EFE6D6] bg-white p-4 text-sm font-bold text-[#4a3f6b]">
            {buildRequestCommand(song)}
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
  tagOptions,
  thumbState,
  candidates,
  selectedThumb,
  onClose,
  onChange,
  onToggleTag,
  onFindThumbnails,
  onSelectThumbnail,
  onSubmit,
}: {
  form: RequestForm;
  tagOptions: readonly string[];
  thumbState: "idle" | "loading" | "done";
  candidates: YoutubeCandidate[];
  selectedThumb: YoutubeCandidate | null;
  onClose: () => void;
  onChange: (key: "title" | "artist" | "youtubeUrl" | "nickname" | "reason", value: string) => void;
  onToggleTag: (tag: string) => void;
  onFindThumbnails: () => void;
  onSelectThumbnail: (candidate: YoutubeCandidate) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <ModalShell onClose={onClose}>
      <form
        onSubmit={onSubmit}
        className="animate-modal max-h-[min(820px,calc(100vh-32px))] w-full max-w-4xl overflow-x-hidden overflow-y-auto rounded-[28px] bg-[#FFFDFA] p-6 shadow-soft"
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
          <div className="sm:col-span-2">
            <TagSelector label="태그" options={tagOptions} selected={form.tags} onToggle={onToggleTag} />
          </div>
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
              <p className="mt-1 text-xs font-semibold text-muted">곡명과 가수명을 기준으로 YouTube 후보를 불러옵니다.</p>
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

function TagSelector({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div>
      <span className="text-sm font-extrabold text-ink">{label}</span>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((tag) => {
          const active = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggle(tag)}
              className={`focus-ring rounded-xl border px-3 py-2 text-sm font-bold transition ${
                active
                  ? "border-deep-lavender bg-deep-lavender text-white shadow-[0_8px_18px_rgba(123,97,255,.20)]"
                  : "border-[#E7DEF7] bg-white text-[#4a3f6b]"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-ink/35 p-4 backdrop-blur-sm"
    >
      <div role="presentation" onMouseDown={(event) => event.stopPropagation()} className="flex w-full justify-center">
        {children}
      </div>
    </div>
  );
}

function thumbnailBadge(song: Song) {
  if (song.thumbnailSource === "manual") return null;
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
