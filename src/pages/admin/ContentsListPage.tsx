import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebase/config";
import { AdminTopNav } from "@/components/AdminTopNav";
import "@/pages/pages.css";

type ContentRow = {
  id: string;
  subject: string;
  identifier: string;
  learningTopic: string;
  createdAtLabel: string;
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

function AddNewMaterialButton() {
  return (
    <Link to="/admin/contents/new" className="btn btn--primary btn--stack contents-list__add-btn">
      <span className="ui-en">+ Add New Material</span>
      <span className="ui-ko">+ 새 자료 등록</span>
    </Link>
  );
}

export function ContentsListPage() {
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    /** 최신 등록이 위로 오도록 항상 createdAt 내림차순 */
    const q = query(collection(db, "contents"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ContentRow[] = [];
        snap.forEach((d) => {
          const x = d.data();
          list.push({
            id: d.id,
            subject: String(x.subject ?? ""),
            identifier: String(x.identifier ?? ""),
            learningTopic: String(x.learningTopic ?? ""),
            createdAtLabel: formatCreatedAt(x.createdAt),
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
                  <th className="th-bilingual th-bilingual--professional">
                    <span className="admin-th__en">ID</span>
                    <span className="admin-th__sub">(식별번호)</span>
                  </th>
                  <th className="th-bilingual th-bilingual--professional">
                    <span className="admin-th__en">TOPIC</span>
                    <span className="admin-th__sub">(학습주제)</span>
                  </th>
                  <th className="th-bilingual th-bilingual--professional">
                    <span className="admin-th__en">CREATED</span>
                    <span className="admin-th__sub">(등록일)</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--text-muted)" }}>
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
                      <td>{r.identifier}</td>
                      <td>{r.learningTopic}</td>
                      <td>{r.createdAtLabel}</td>
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
