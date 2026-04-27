import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import { AdminTopNav } from "@/components/AdminTopNav";
import { syncHomeworkCodeStatus } from "@/lib/homeworkSync";
import type { ContentStatus, ContentType } from "@/types/content";
import "@/pages/pages.css";

type ContentRow = {
  id: string;
  subject: string;
  identifier: string;
  learningTopic: string;
  createdAtLabel: string;
  type: ContentType;
  status: ContentStatus;
  homeworkCode: string | null;
  shortCode: string | null;
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

function labelType(t: ContentType): string {
  if (t === "share") return "공유";
  if (t === "paid") return "유료";
  return "과제";
}

function labelStatus(s: ContentStatus): string {
  if (s === "pending") return "대기";
  if (s === "approved") return "승인";
  return "반려";
}

function AddNewMaterialButton() {
  return (
    <Link to="/admin/contents/new" className="btn btn--primary btn--stack contents-list__add-btn">
      <span className="ui-en">+ Add New Material</span>
      <span className="ui-ko">+ 새 자료 등록</span>
    </Link>
  );
}

export function ContentsListPage() {
  const { isSuperAdmin } = useAuth();
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const q = query(collection(db, "contents"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ContentRow[] = [];
        snap.forEach((d) => {
          const x = d.data();
          const rawType = (x.type as ContentType | undefined) ?? "share";
          const rawStatus = (x.status as ContentStatus | undefined) ?? "approved";
          list.push({
            id: d.id,
            subject: String(x.subject ?? ""),
            identifier: String(x.identifier ?? ""),
            learningTopic: String(x.learningTopic ?? ""),
            createdAtLabel: formatCreatedAt(x.createdAt),
            type: rawType,
            status: rawStatus,
            homeworkCode: x.homeworkCode != null ? String(x.homeworkCode) : null,
            shortCode: x.shortCode != null ? String(x.shortCode) : null,
          });
        });
        setRows(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message || "목록을 불러오지 못했습니다.");
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  const setStatus = useCallback(async (row: ContentRow, next: ContentStatus) => {
    setBusyId(row.id);
    setError(null);
    try {
      await updateDoc(doc(db, "contents", row.id), { status: next });
      if (row.type === "homework" && row.homeworkCode) {
        await syncHomeworkCodeStatus(db, row.homeworkCode, next);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "상태 변경에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <div className="app-shell app-shell--admin app-shell--light">
      <AdminTopNav />
      <main className="admin-layout admin-layout--light contents-list contents-list--bright">
        <header className="contents-list__hero">
          <div className="contents-list__hero-bg" aria-hidden />
          <div className="contents-list__hero-main">
            <p className="contents-list__eyebrow ui-en">Content database</p>
            <div className="contents-list__title-wrap">
              <h1 className="contents-list__h1">콘텐츠 DB 관리</h1>
              <p className="contents-list__subtitle ui-ko">등록된 지문·자료 목록 · 최신순(실시간)</p>
            </div>
          </div>
          <div className="contents-list__hero-cta">
            <AddNewMaterialButton />
          </div>
        </header>

        {error ? <p className="auth-error">{error}</p> : null}
        {loading ? (
          <div className="route-loading route-loading--light">
            <div className="route-loading__spinner" />
            <p>
              <span className="ui-en">Connecting…</span>
              <span className="ui-ko contents-list__loading-ko">
                목록 연결 중…
              </span>
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap contents-list__table-shell">
            <table className="admin-table admin-table--contents admin-table--light contents-list__table">
              <thead>
                <tr>
                  <th className="th-bilingual th-bilingual--professional">
                    <span className="admin-th__en">SUBJECT</span>
                    <span className="admin-th__sub">(과목)</span>
                  </th>
                  <th>유형</th>
                  <th>상태</th>
                  <th>과제번호</th>
                  <th className="th-bilingual th-bilingual--professional">
                    <span className="admin-th__en">TOPIC</span>
                    <span className="admin-th__sub">(학습주제)</span>
                  </th>
                  <th className="th-bilingual th-bilingual--professional">
                    <span className="admin-th__en">CREATED</span>
                    <span className="admin-th__sub">(등록일)</span>
                  </th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="contents-list__empty">
                      <span className="ui-en">No items yet. Add a passage to get started.</span>
                      <span className="ui-ko contents-list__empty-ko">
                        아직 등록된 항목이 없습니다. 새 자료 등록으로 시작하세요.
                      </span>
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td className="contents-list__cell-strong">{r.subject}</td>
                      <td>
                        <span className={`contents-list__pill contents-list__pill--type-${r.type}`}>
                          {labelType(r.type)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`contents-list__pill contents-list__pill--status contents-list__pill--status-${r.status}`}
                        >
                          {labelStatus(r.status)}
                        </span>
                      </td>
                      <td className="contents-list__cell-mono">
                        {r.shortCode || r.homeworkCode ? (
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>
                            {r.shortCode ?? r.homeworkCode}
                            {r.shortCode && r.homeworkCode && r.shortCode !== r.homeworkCode ? (
                              <span className="contents-list__code-sub">{r.homeworkCode}</span>
                            ) : null}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{r.learningTopic}</td>
                      <td className="contents-list__cell-muted">{r.createdAtLabel}</td>
                      <td>
                        <div className="contents-list__actions">
                          {r.type !== "homework" && r.status === "approved" && (
                            <Link to={`/content/${r.id}`} className="btn btn--stack contents-list__action-link">
                              공개 상세
                            </Link>
                          )}
                          {r.type === "homework" && (r.shortCode || r.homeworkCode) && (
                            <Link
                              to={`/homework/${encodeURIComponent(r.shortCode || r.homeworkCode || "")}`}
                              className="btn btn--stack contents-list__action-link"
                            >
                              과제 보기
                            </Link>
                          )}
                          {isSuperAdmin && r.status === "pending" && (
                            <>
                              <button
                                type="button"
                                className="btn btn--success btn--stack contents-list__mini-action"
                                disabled={busyId === r.id}
                                onClick={() => void setStatus(r, "approved")}
                              >
                                승인
                              </button>
                              <button
                                type="button"
                                className="btn btn--danger btn--stack contents-list__mini-action"
                                disabled={busyId === r.id}
                                onClick={() => void setStatus(r, "rejected")}
                              >
                                반려
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="contents-list__toolbar contents-list__toolbar--bottom">
          <AddNewMaterialButton />
        </div>
      </main>
    </div>
  );
}
