import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { LEARNING_THEME_OPTIONS, type LearningThemeId } from "@/types/learningTheme";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import { downloadStoragePathsSequentially } from "@/lib/downloads";
import { recordStudentDownload } from "@/lib/studentDownloads";
import { PublicShell } from "@/components/PublicShell";
import type { ContentType, LibraryCategory } from "@/types/content";
import { SUPER_ADMIN_EMAIL } from "@/types/user";
import "@/pages/pages.css";

type LibraryVisibility = "public" | "internal";
type LibraryMode = "theme" | "problem_bank" | "source_material";

type LibraryRow = {
  id: string;
  subject: string;
  identifier: string;
  learningTopic: string;
  type: ContentType;
  homeworkCode: string | null;
  shortCode: string | null;
  createdAtLabel: string;
  createdAtMs: number;
  allFilePaths: string[];
  visibility: LibraryVisibility;
  category: LibraryCategory;
};

function formatCreatedAt(raw: unknown): string {
  if (raw instanceof Timestamp) {
    return raw.toDate().toLocaleString();
  }
  if (
    raw !== null &&
    typeof raw === "object" &&
    "toDate" in raw &&
    typeof (raw as { toDate?: () => Date }).toDate === "function"
  ) {
    try {
      return (raw as { toDate: () => Date }).toDate().toLocaleString();
    } catch {
      return "—";
    }
  }
  return "—";
}

function TypeBadge({ type }: { type: ContentType }) {
  if (type === "share") {
    return (
      <span className="content-type-badge content-type-badge--share">
        공유
      </span>
    );
  }
  if (type === "paid") {
    return (
      <span className="content-type-badge content-type-badge--paid">
        유료
      </span>
    );
  }
  return (
    <span className="content-type-badge content-type-badge--homework">
      과제
    </span>
  );
}

/** 유형 열: 과제는 배지 옆에 안내 번호(4자리) 또는 전체 코드 표시 */
function LibraryTypeCell({ row }: { row: LibraryRow }) {
  if (row.visibility === "internal") {
    return (
      <span className="content-type-badge content-type-badge--internal">
        비공개
      </span>
    );
  }
  if (row.type !== "homework") {
    return <TypeBadge type={row.type} />;
  }
  const pin = row.shortCode?.trim();
  const full = row.homeworkCode?.trim();
  const display = pin || full || "—";
  return (
    <span className="library-type-with-code">
      <span className="content-type-badge content-type-badge--homework">과제</span>
      <span className="library-hw-code" title={pin ? `전체 코드: ${full ?? ""}` : "과제번호"}>
        {display}
      </span>
    </span>
  );
}

function listTitle(row: LibraryRow): string {
  return row.subject.trim() || "—";
}

export function LibraryPage() {
  const { firebaseUser, profile } = useAuth();
  const canSeeInternalReferences = profile?.role === "super_admin" && profile.accountStatus === "active";
  const canRequestInternalReferences = Boolean(
    firebaseUser &&
      (canSeeInternalReferences || firebaseUser.email?.trim().toLowerCase() === SUPER_ADMIN_EMAIL),
  );
  const [searchParams] = useSearchParams();
  const librarySearch = (searchParams.get("q") ?? "").trim().toLowerCase();
  const themeParam = searchParams.get("theme");
  const themeFilter = useMemo((): LearningThemeId | null => {
    if (!themeParam) return null;
    return LEARNING_THEME_OPTIONS.some((o) => o.id === themeParam) ? (themeParam as LearningThemeId) : null;
  }, [themeParam]);
  const themeLabel = useMemo(() => {
    if (!themeFilter) return null;
    return LEARNING_THEME_OPTIONS.find((o) => o.id === themeFilter);
  }, [themeFilter]);
  const libraryMode: LibraryMode = themeFilter
    ? "theme"
    : searchParams.get("view") === "source-material"
      ? "source_material"
      : "problem_bank";
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    let approvedRows: LibraryRow[] = [];
    let internalRows: LibraryRow[] = [];
    let approvedReady = false;
    let internalReady = !canRequestInternalReferences;
    const internalRequestController = new AbortController();

    const rowFromData = (
      id: string,
      x: Record<string, unknown>,
      visibility: LibraryVisibility,
    ): LibraryRow => {
      const lm = (x.learningMaterialFilePaths as string[]) ?? [];
      const rf = (x.referenceMaterialFilePaths as string[]) ?? [];
      const sourceDatabase = String(x.sourceDatabase ?? "");
      const category: LibraryCategory =
        x.libraryCategory === "problem_bank" || x.libraryCategory === "source_material"
          ? x.libraryCategory
          : sourceDatabase === "csat_english_questions"
            ? "problem_bank"
            : "source_material";
      return {
        id,
        subject: String(x.subject ?? ""),
        identifier: String(x.identifier ?? ""),
        learningTopic: String(x.learningTopic ?? ""),
        type: (x.type as ContentType) ?? "share",
        homeworkCode: x.homeworkCode != null ? String(x.homeworkCode) : null,
        shortCode: x.shortCode != null ? String(x.shortCode) : null,
        createdAtLabel:
          typeof x.createdAtMs === "number" && x.createdAtMs > 0
            ? new Date(x.createdAtMs).toLocaleString()
            : formatCreatedAt(x.createdAt),
        createdAtMs:
          typeof x.createdAtMs === "number"
            ? x.createdAtMs
            : x.createdAt instanceof Timestamp
            ? x.createdAt.toMillis()
            : typeof (x.createdAt as { toMillis?: unknown } | null)?.toMillis === "function"
              ? (x.createdAt as { toMillis: () => number }).toMillis()
              : 0,
        allFilePaths: [...lm, ...rf],
        visibility,
        category,
      };
    };

    const publishRows = () => {
      setRows(
        [...internalRows, ...approvedRows].sort(
          (a, b) => b.createdAtMs - a.createdAtMs || a.subject.localeCompare(b.subject, "ko"),
        ),
      );
      setLoading(!(approvedReady && internalReady));
    };

    const approvedQuery = themeFilter
      ? query(
          collection(db, "contents"),
          where("status", "==", "approved"),
          where("themes", "array-contains", themeFilter),
          orderBy("createdAt", "desc")
        )
      : query(
          collection(db, "contents"),
          where("status", "==", "approved"),
          where("type", "in", ["share", "paid", "homework"]),
          orderBy("createdAt", "desc")
        );
    const unsubApproved = onSnapshot(
      approvedQuery,
      (snap) => {
        const list: LibraryRow[] = [];
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          const t = (x.type as ContentType) ?? "share";
          if (themeFilter && !["share", "paid", "homework"].includes(t)) return;
          list.push(rowFromData(d.id, x, "public"));
        });
        approvedRows = list;
        approvedReady = true;
        publishRows();
      },
      (err) => {
        setError(err.message || "목록을 불러오지 못했습니다.");
        approvedReady = true;
        publishRows();
      }
    );

    if (canRequestInternalReferences && firebaseUser) {
      void (async () => {
        try {
          const token = await firebaseUser.getIdToken();
          const response = await fetch("/api/internal-library", {
            headers: { Authorization: `Bearer ${token}` },
            signal: internalRequestController.signal,
          });
          const payload = (await response.json().catch(() => ({}))) as {
            items?: Array<Record<string, unknown> & { id?: unknown }>;
            error?: string;
          };
          if (!response.ok) {
            throw new Error(payload.error || "비공개 참고 자료를 불러오지 못했습니다.");
          }
          internalRows = (payload.items ?? [])
            .filter((item) => {
              if (!themeFilter) return true;
              const themes = Array.isArray(item.themes) ? item.themes.map(String) : [];
              return themes.includes(themeFilter);
            })
            .map((item) => rowFromData(String(item.id ?? ""), item, "internal"))
            .filter((item) => item.id);
          internalReady = true;
          publishRows();
        } catch (err) {
          if (internalRequestController.signal.aborted) return;
          setError(err instanceof Error ? err.message : "비공개 참고 자료를 불러오지 못했습니다.");
          internalReady = true;
          publishRows();
        }
      })();
    }

    return () => {
      unsubApproved();
      internalRequestController.abort();
    };
  }, [themeFilter, canRequestInternalReferences, firebaseUser]);

  const toggle = useCallback((id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const displayRows = useMemo(() => {
    const modeRows = libraryMode === "theme" ? rows : rows.filter((row) => row.category === libraryMode);
    if (!librarySearch) return modeRows;
    return modeRows.filter((r) => {
      const blob =
        `${listTitle(r)} ${r.shortCode ?? ""} ${r.homeworkCode ?? ""} ${r.learningTopic} ${r.identifier} ${r.subject}`.toLowerCase();
      return blob.includes(librarySearch);
    });
  }, [rows, librarySearch, libraryMode]);

  const selectAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    displayRows.forEach((r) => {
      next[r.id] = true;
    });
    setSelected(next);
  }, [displayRows]);

  const clearSel = useCallback(() => setSelected({}), []);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected[r.id]),
    [rows, selected]
  );

  async function handleDownloadSelected() {
    if (!firebaseUser) {
      window.alert("파일 다운로드는 로그인 후 이용할 수 있습니다.");
      return;
    }
    if (selectedRows.length === 0 || !selectedRows.some((r) => r.allFilePaths.length > 0)) {
      window.alert("다운로드할 파일이 있는 자료를 선택해 주세요.");
      return;
    }
    setDownloading(true);
    try {
      for (const row of selectedRows) {
        if (row.allFilePaths.length === 0) continue;
        await downloadStoragePathsSequentially(row.allFilePaths);
        if (profile?.role === "student") {
          const dlTitle =
            row.type === "homework" && (row.shortCode?.trim() || row.homeworkCode?.trim())
              ? `${(row.shortCode ?? row.homeworkCode)!.trim()} · ${row.subject}`
              : row.subject;
          await recordStudentDownload({
            studentId: firebaseUser.uid,
            contentId: row.id,
            title: dlTitle,
            storagePaths: row.allFilePaths,
          });
        }
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "다운로드에 실패했습니다.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <PublicShell>
      <main className="admin-layout library-page admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>Library</h1>
          <span className="ui-ko">
            {canRequestInternalReferences ? "승인된 자료 · 관리자 비공개 참고 자료" : "승인된 자료 · 공유 / 유료 / 과제"}
          </span>
        </div>

        {themeLabel && (
          <p className="library-query-hint" role="status">
            테마: <strong>{themeLabel.titleEn}</strong> ({themeLabel.titleKo}) —{" "}
            <Link to="/library">전체 목록</Link>
          </p>
        )}

        {librarySearch && (
          <p className="library-query-hint" role="status">
            검색: <strong>{searchParams.get("q")}</strong> — 제목·주제·식별자에서 필터합니다.
          </p>
        )}

        <div className="library-toolbar">
          <div className="library-toolbar__views">
            <Link
              to="/library/themes"
              className={`btn btn--stack ${libraryMode === "theme" ? "btn--primary" : "btn--ghost"}`}
            >
              <span className="ui-en">By theme</span>
              <span className="ui-ko">테마별 보기</span>
            </Link>
            <Link
              to="/library?view=problem-bank"
              className={`btn btn--stack ${libraryMode === "problem_bank" ? "btn--primary" : "btn--ghost"}`}
            >
              <span className="ui-en">Question bank</span>
              <span className="ui-ko">문제은행</span>
            </Link>
            <Link
              to="/library?view=source-material"
              className={`btn btn--stack ${libraryMode === "source_material" ? "btn--primary" : "btn--ghost"}`}
            >
              <span className="ui-en">Source materials</span>
              <span className="ui-ko">원문소스</span>
            </Link>
          </div>
          <div className="library-toolbar__bulk">
            <button type="button" className="btn btn--ghost btn--stack" onClick={selectAll}>
              <span className="ui-en">Select all</span>
              <span className="ui-ko">전체 선택</span>
            </button>
            <button type="button" className="btn btn--ghost btn--stack" onClick={clearSel}>
              <span className="ui-en">Clear</span>
              <span className="ui-ko">선택 해제</span>
            </button>
            <button
              type="button"
              className="btn btn--primary btn--stack"
              disabled={downloading}
              onClick={() => void handleDownloadSelected()}
            >
              <span className="ui-en">{downloading ? "Downloading…" : "Download selected"}</span>
              <span className="ui-ko">{downloading ? "진행 중…" : "선택 파일 순차 다운로드"}</span>
            </button>
          </div>
        </div>

        {!firebaseUser && (
          <p className="library-guest-hint library-guest-hint--light" role="status">
            비회원은 목록을 볼 수 있으나, 파일 다운로드는 로그인이 필요합니다.
          </p>
        )}

        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <div className="route-loading route-loading--light">
            <div className="route-loading__spinner" />
            <p>
              <span className="ui-en">Loading…</span>
              <span className="ui-ko" style={{ display: "block", marginTop: "0.25rem" }}>
                불러오는 중…
              </span>
            </p>
          </div>
        ) : (
          <div className="library-cards">
            {displayRows.length === 0 ? (
              <p style={{ color: "var(--light-text-muted, #6b7280)" }}>
                {librarySearch ? "검색 결과가 없습니다." : "표시할 자료가 없습니다."}
              </p>
            ) : (
              displayRows.map((r) => (
                <article key={r.id} className="library-card library-card--light">
                  <label className="library-card__check">
                    <input
                      type="checkbox"
                      checked={!!selected[r.id]}
                      onChange={() => toggle(r.id)}
                    />
                    <span className="library-card__badges">
                      <LibraryTypeCell row={r} />
                    </span>
                    <span className="library-card__title">{listTitle(r)}</span>
                  </label>
                  <p className="library-card__meta">{r.learningTopic}</p>
                  <p className="library-card__meta-sub">{r.createdAtLabel}</p>
                  <Link to={`/content/${r.id}`} className="btn btn--ghost btn--stack library-card__link">
                    <span className="ui-en">View</span>
                    <span className="ui-ko">상세</span>
                  </Link>
                </article>
              ))
            )}
          </div>
        )}
      </main>
    </PublicShell>
  );
}
