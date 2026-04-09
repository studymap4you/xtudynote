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
          });
        });
        setRows(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message || "목록을 불러오지 못했습니다.");
        setLoading(false);
      }
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
    <div className="app-shell">
      <AdminTopNav />
      <main className="admin-layout contents-list">
        <div className="admin-layout__title-row">
          <h1>콘텐츠 DB 관리</h1>
          <span className="ui-ko">등록된 지문·자료 목록 · 최신순(실시간)</span>
        </div>
        <div className="contents-list__toolbar contents-list__toolbar--top">
          <AddNewMaterialButton />
        </div>
        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <div className="route-loading">
            <div className="route-loading__spinner" />
            <p>
              <span className="ui-en">Connecting…</span>
              <span className="ui-ko" style={{ display: "block", marginTop: "0.25rem" }}>
                목록 연결 중…
              </span>
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--contents">
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
                    <td colSpan={7} style={{ color: "var(--text-muted)" }}>
                      No items yet. Add a passage to get started.
                      <span className="ui-ko" style={{ display: "block", marginTop: "0.35rem" }}>
                        아직 등록된 항목이 없습니다. 새 자료 등록으로 시작하세요.
                      </span>
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.subject}</td>
                      <td>{labelType(r.type)}</td>
                      <td>{labelStatus(r.status)}</td>
                      <td>{r.homeworkCode ?? "—"}</td>
                      <td>{r.learningTopic}</td>
                      <td>{r.createdAtLabel}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          {r.type !== "homework" && r.status === "approved" && (
                            <Link to={`/content/${r.id}`} className="btn btn--ghost btn--stack">
                              공개 상세
                            </Link>
                          )}
                          {r.type === "homework" && r.homeworkCode && (
                            <Link
                              to={`/homework/${encodeURIComponent(r.homeworkCode)}`}
                              className="btn btn--ghost btn--stack"
                            >
                              과제 보기
                            </Link>
                          )}
                          {isSuperAdmin && r.status === "pending" && (
                            <>
                              <button
                                type="button"
                                className="btn btn--success btn--stack"
                                disabled={busyId === r.id}
                                onClick={() => void setStatus(r, "approved")}
                              >
                                승인
                              </button>
                              <button
                                type="button"
                                className="btn btn--danger btn--stack"
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
