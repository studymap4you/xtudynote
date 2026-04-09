import { useEffect, useState } from "react";
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
import type { SalesRecord } from "@/types/sales";
import "@/pages/pages.css";

type Row = SalesRecord & { id: string };

function formatTs(raw: unknown): string {
  if (raw instanceof Timestamp) return raw.toDate().toLocaleString();
  return "—";
}

/** 본인 sellerId 기준 판매·수익 (관리자가 sales_records에 sellerId=학생 uid로 등록) */
export function StudentSalesSection() {
  const { firebaseUser, profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser || profile?.role !== "student") {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "sales_records"),
      where("sellerId", "==", firebaseUser.uid),
      orderBy("soldAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Row[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as SalesRecord) }));
        setRows(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [firebaseUser, profile?.role]);

  if (profile?.role !== "student") return null;

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">판매 및 수익 통계</h2>
          <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
            등록 자료의 판매 현황 · 관리자 집계 기준
          </span>
        </div>
      </div>
      {error && <p className="auth-error">{error}</p>}
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="materials-placeholder" style={{ color: "var(--text-muted)" }}>
          <span className="ui-en">No sales data yet.</span>
          <span className="ui-ko" style={{ display: "block", marginTop: "0.5rem" }}>
            자료가 승인·판매되면 관리자가 수익 내역을 연결합니다.
          </span>
        </p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--contents">
            <thead>
              <tr>
                <th>
                  <span className="th-bi-en">Date</span>
                  <span className="th-bi-ko">일시</span>
                </th>
                <th>
                  <span className="th-bi-en">Title</span>
                  <span className="th-bi-ko">자료 제목</span>
                </th>
                <th>
                  <span className="th-bi-en">Revenue (₩)</span>
                  <span className="th-bi-ko">수익금</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatTs(r.soldAt)}</td>
                  <td>{r.contentTitle || r.contentId}</td>
                  <td>{Number(r.amount ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
