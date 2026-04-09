import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import { downloadStoragePathsSequentially } from "@/lib/downloads";
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

export function LibraryPage() {
  const { firebaseUser } = useAuth();
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("card");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const q = query(
      collection(db, "contents"),
      where("status", "==", "approved"),
      where("type", "in", ["share", "paid"]),
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
          list.push({
            id: d.id,
            subject: String(x.subject ?? ""),
            identifier: String(x.identifier ?? ""),
            learningTopic: String(x.learningTopic ?? ""),
            type: (x.type as ContentType) ?? "share",
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
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const selectAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    rows.forEach((r) => {
      next[r.id] = true;
    });
    setSelected(next);
  }, [rows]);

  const clearSel = useCallback(() => setSelected({}), []);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected[r.id]),
    [rows, selected]
  );

  const pathsToDownload = useMemo(() => {
    const paths: string[] = [];
    selectedRows.forEach((r) => paths.push(...r.allFilePaths));
    return paths;
  }, [selectedRows]);

  async function handleDownloadSelected() {
    if (!firebaseUser) {
      window.alert("파일 다운로드는 로그인 후 이용할 수 있습니다.");
      return;
    }
    if (pathsToDownload.length === 0) {
      window.alert("다운로드할 파일이 있는 자료를 선택해 주세요.");
      return;
    }
    setDownloading(true);
    try {
      await downloadStoragePathsSequentially(pathsToDownload);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "다운로드에 실패했습니다.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <PublicShell>
      <main className="admin-layout library-page">
        <div className="admin-layout__title-row">
          <h1>Library</h1>
          <span className="ui-ko">승인된 공유·유료 자료 (과제 제외)</span>
        </div>

        <div className="library-toolbar">
          <div className="library-toolbar__views">
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
          <p className="library-guest-hint auth-error" role="status">
            비회원은 목록을 볼 수 있으나, 파일 다운로드는 로그인이 필요합니다.
          </p>
        )}

        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <div className="route-loading">
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
            {rows.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>표시할 자료가 없습니다.</p>
            ) : (
              rows.map((r) => (
                <article key={r.id} className="library-card">
                  <label className="library-card__check">
                    <input
                      type="checkbox"
                      checked={!!selected[r.id]}
                      onChange={() => toggle(r.id)}
                    />
                    <span className="library-card__title">{r.subject}</span>
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
            <table className="admin-table admin-table--contents">
              <thead>
                <tr>
                  <th aria-label="select" />
                  <th>과목</th>
                  <th>주제</th>
                  <th>등록</th>
                  <th>상세</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: "var(--text-muted)" }}>
                      표시할 자료가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <input type="checkbox" checked={!!selected[r.id]} onChange={() => toggle(r.id)} />
                      </td>
                      <td>{r.subject}</td>
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
