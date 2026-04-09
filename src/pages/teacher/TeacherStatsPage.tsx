import { useMemo, useEffect, useState } from "react";
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
import { DashboardShell } from "@/components/DashboardShell";
import { TeacherRoute } from "@/components/TeacherRoute";
import { db } from "@/firebase/config";
import type { SalesRecord } from "@/types/sales";
import "@/pages/pages.css";

type Row = SalesRecord & { id: string };

function formatTs(raw: unknown): string {
  if (raw instanceof Timestamp) return raw.toDate().toLocaleString();
  return "—";
}

function dayKey(raw: unknown): string {
  if (raw instanceof Timestamp) {
    const d = raw.toDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "—";
}

function Inner() {
  const { firebaseUser } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(
      collection(db, "sales_records"),
      where("teacherId", "==", firebaseUser.uid),
      orderBy("soldAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Row[] = [];
        snap.forEach((d) => {
          const x = d.data() as SalesRecord;
          list.push({ id: d.id, ...x });
        });
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
  }, [firebaseUser]);

  const byDate = useMemo(() => {
    const m = new Map<string, { units: number; amount: number }>();
    rows.forEach((r) => {
      const k = dayKey(r.soldAt);
      if (k === "—") return;
      const cur = m.get(k) ?? { units: 0, amount: 0 };
      cur.units += r.units ?? 1;
      cur.amount += Number(r.amount ?? 0);
      m.set(k, cur);
    });
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const byContent = useMemo(() => {
    const m = new Map<string, { title: string; units: number; amount: number }>();
    rows.forEach((r) => {
      const cur = m.get(r.contentId) ?? { title: r.contentTitle, units: 0, amount: 0 };
      cur.units += r.units ?? 1;
      cur.amount += Number(r.amount ?? 0);
      cur.title = r.contentTitle || cur.title;
      m.set(r.contentId, cur);
    });
    return Array.from(m.entries()).map(([contentId, v]) => ({ contentId, ...v }));
  }, [rows]);

  return (
    <DashboardShell light>
      <main className="admin-layout teacher-stats admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>판매 통계 · 정산</h1>
          <span className="ui-ko">날짜별·자료별 건수와 금액 (관리자 집계 데이터)</span>
        </div>
        <p style={{ marginBottom: "1rem" }}>
          <Link to="/dashboard" className="btn btn--ghost btn--stack">
            ← 대시보드
          </Link>
        </p>
        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <div className="route-loading">
            <div className="route-loading__spinner" />
          </div>
        ) : (
          <>
            <section className="panel panel--light">
              <h2 className="panel__title">날짜별</h2>
              {byDate.length === 0 ? (
                <p style={{ color: "var(--light-text-muted, #6b7280)" }}>집계된 판매 데이터가 없습니다.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table admin-table--light">
                    <thead>
                      <tr>
                        <th>날짜</th>
                        <th>건수</th>
                        <th>금액 (원)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byDate.map(([date, v]) => (
                        <tr key={date}>
                          <td>{date}</td>
                          <td>{v.units}</td>
                          <td>{v.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel panel--light" style={{ marginTop: "1.5rem" }}>
              <h2 className="panel__title">자료별</h2>
              {byContent.length === 0 ? (
                <p style={{ color: "var(--light-text-muted, #6b7280)" }}>집계된 판매 데이터가 없습니다.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table admin-table--light">
                    <thead>
                      <tr>
                        <th>자료</th>
                        <th>건수</th>
                        <th>금액 (원)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byContent.map((r) => (
                        <tr key={r.contentId}>
                          <td>{r.title || r.contentId}</td>
                          <td>{r.units}</td>
                          <td>{r.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel panel--light" style={{ marginTop: "1.5rem" }}>
              <h2 className="panel__title">최근 거래</h2>
              {rows.length === 0 ? (
                <p style={{ color: "var(--light-text-muted, #6b7280)" }}>기록이 없습니다.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table admin-table--light">
                    <thead>
                      <tr>
                        <th>일시</th>
                        <th>자료</th>
                        <th>건</th>
                        <th>금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>{formatTs(r.soldAt)}</td>
                          <td>{r.contentTitle}</td>
                          <td>{r.units ?? 1}</td>
                          <td>{(r.amount ?? 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </DashboardShell>
  );
}

export function TeacherStatsPage() {
  return (
    <TeacherRoute>
      <Inner />
    </TeacherRoute>
  );
}
