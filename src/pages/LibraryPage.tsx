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
import type { ContentType } from "@/types/content";
import "@/pages/pages.css";

type ViewMode = "card" | "list";

type LibraryRow = {
  id: string;
  subject: string;
  identifier: string;
  learningTopic: string;
  type: ContentType;
  homeworkCode: string | null;
  shortCode: string | null;
  createdAtLabel: string;
  allFilePaths: string[];
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
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("card");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const q = themeFilter
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
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: LibraryRow[] = [];
        snap.forEach((d) => {
          const x = d.data();
          const lm = (x.learningMaterialFilePaths as string[]) ?? [];
          const rf = (x.referenceMaterialFilePaths as string[]) ?? [];
          const t = (x.type as ContentType) ?? "share";
          if (themeFilter && !["share", "paid", "homework"].includes(t)) return;
          list.push({
            id: d.id,
            subject: String(x.subject ?? ""),
            identifier: String(x.identifier ?? ""),
            learningTopic: String(x.learningTopic ?? ""),
            type: t,
            homeworkCode: x.homeworkCode != null ? String(x.homeworkCode) : null,
            shortCode: x.shortCode != null ? String(x.shortCode) : null,
            createdAtLabel: formatCreatedAt(x.createdAt),
            allFilePaths: [...lm, ...rf],
          });
        });
        setRows(list);
        setLoading(false);
      },
      (err) => {
        setError(err.message || "목록을 불러오지 못했습니다.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [themeFilter]);

  const toggle = useCallback((id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const displayRows = useMemo(() => {
    if (!librarySearch) return rows;
    return rows.filter((r) => {
      const blob =
        `${listTitle(r)} ${r.shortCode ?? ""} ${r.homeworkCode ?? ""} ${r.learningTopic} ${r.identifier} ${r.subject}`.toLowerCase();
      return blob.includes(librarySearch);
    });
  }, [rows, librarySearch]);

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
          <span className="ui-ko">승인된 자료 · 공유 / 유료 / 과제</span>
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
              className="btn btn--stack btn--ghost"
            >
              <span className="ui-en">By theme</span>
              <span className="ui-ko">테마별 보기</span>
            </Link>
            <button
              type="button"
              className={`btn btn--stack ${view === "card" ? "btn--primary" : "btn--ghost"}`}
              onClick={() => setView("card")}
            >
              <span className="ui-en">Card</span>
              <span className="ui-ko">카드</span>
            </button>
            <button
              type="button"
              className={`btn btn--stack ${view === "list" ? "btn--primary" : "btn--ghost"}`}
              onClick={() => setView("list")}
            >
              <span className="ui-en">List</span>
              <span className="ui-ko">리스트</span>
            </button>
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
        ) : view === "card" ? (
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
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--light admin-table--contents">
              <thead>
                <tr>
                  <th aria-label="select" />
                  <th>유형</th>
                  <th>제목</th>
                  <th>주제</th>
                  <th>등록</th>
                  <th>상세</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--light-text-muted, #6b7280)" }}>
                      {librarySearch ? "검색 결과가 없습니다." : "표시할 자료가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  displayRows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <input type="checkbox" checked={!!selected[r.id]} onChange={() => toggle(r.id)} />
                      </td>
                      <td>
                        <LibraryTypeCell row={r} />
                      </td>
                      <td>{listTitle(r)}</td>
                      <td>{r.learningTopic}</td>
                      <td>{r.createdAtLabel}</td>
                      <td>
                        <Link to={`/content/${r.id}`} className="btn btn--ghost btn--stack">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </PublicShell>
  );
}
