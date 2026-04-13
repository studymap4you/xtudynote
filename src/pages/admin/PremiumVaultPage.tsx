import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { AdminTopNav } from "@/components/AdminTopNav";
import { db } from "@/firebase/config";
import { SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC } from "@/lib/siteConfig";
import type { ContentDocument } from "@/types/content";
import "@/pages/pages.css";

type PaidRow = { id: string; data: ContentDocument };

export function PremiumVaultPage() {
  const [pool, setPool] = useState<PaidRow[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [queryText, setQueryText] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
      (snap) => {
        const ids = (snap.data()?.premiumPaidContentIds as string[] | undefined) ?? [];
        setSelectedIds(Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []);
        setConfigLoading(false);
      },
      () => {
        setSelectedIds([]);
        setConfigLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPoolLoading(true);
      try {
        const q = query(
          collection(db, "contents"),
          where("status", "==", "approved"),
          where("type", "==", "paid"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const list: PaidRow[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, data: d.data() as ContentDocument });
        });
        if (!cancelled) setPool(list);
      } catch {
        if (!cancelled) setPool([]);
      } finally {
        if (!cancelled) setPoolLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPool = useMemo(() => {
    const t = queryText.trim().toLowerCase();
    if (!t) return pool;
    return pool.filter((r) => {
      const blob = `${r.data.subject} ${r.data.learningTopic} ${r.data.identifier}`.toLowerCase();
      return blob.includes(t);
    });
  }, [pool, queryText]);

  const addId = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const removeId = useCallback((id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const move = useCallback((index: number, dir: -1 | 1) => {
    setSelectedIds((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[index];
      next[index] = next[j];
      next[j] = tmp;
      return next;
    });
  }, []);

  async function save() {
    setSaving(true);
    try {
      await setDoc(
        doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC),
        {
          premiumPaidContentIds: selectedIds,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      window.alert("홈 프리미엄 볼트에 반영되었습니다.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const selectedRows = useMemo(() => {
    const map = new Map(pool.map((r) => [r.id, r]));
    return selectedIds.map((id) => map.get(id)).filter(Boolean) as PaidRow[];
  }, [pool, selectedIds]);

  return (
    <div className="app-shell">
      <AdminTopNav />
      <main className="admin-layout admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>Premium Vault</h1>
          <span className="ui-ko">홈 화면 프리미엄 유료 자료 선별</span>
        </div>
        <p style={{ color: "var(--text-muted)", maxWidth: "42rem" }}>
          승인된 <strong>유료</strong> 콘텐츠만 후보로 표시됩니다. 순서대로 저장하면 랜딩의 Premium Vault에 실시간
          반영됩니다.
        </p>

        <div className="premium-vault-grid" style={{ display: "grid", gap: "1.5rem", marginTop: "1.5rem" }}>
          <section className="panel panel--light">
            <div className="panel__head">
              <h2 className="panel__title">후보 목록</h2>
            </div>
            <label className="auth-field" style={{ marginBottom: "0.75rem" }}>
              <span className="ui-ko">검색</span>
              <input
                className="add-passage__control"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="제목·주제·식별자"
              />
            </label>
            {poolLoading ? (
              <p>불러오는 중…</p>
            ) : (
              <ul className="premium-vault-pool" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {filteredPool.map((row) => (
                  <li
                    key={row.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      padding: "0.5rem 0",
                      borderBottom: "1px solid rgba(15,23,42,0.08)",
                    }}
                  >
                    <div>
                      <strong>{row.data.subject || "—"}</strong>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        {row.data.learningTopic || ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary btn--stack"
                      disabled={selectedIds.includes(row.id)}
                      onClick={() => addId(row.id)}
                    >
                      추가
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel panel--light">
            <div className="panel__head">
              <h2 className="panel__title">홈 노출 순서</h2>
            </div>
            {configLoading ? (
              <p>설정 불러오는 중…</p>
            ) : selectedRows.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>선택된 항목이 없습니다. 왼쪽에서 추가하세요.</p>
            ) : (
              <ol style={{ paddingLeft: "1.25rem" }}>
                {selectedRows.map((row, i) => (
                  <li key={row.id} style={{ marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                      <span style={{ flex: "1 1 12rem" }}>{row.data.subject}</span>
                      <button type="button" className="btn btn--ghost btn--stack" onClick={() => move(i, -1)}>
                        ↑
                      </button>
                      <button type="button" className="btn btn--ghost btn--stack" onClick={() => move(i, 1)}>
                        ↓
                      </button>
                      <button type="button" className="btn btn--ghost btn--stack" onClick={() => removeId(row.id)}>
                        제거
                      </button>
                      <Link to={`/content/${row.id}`} className="btn btn--ghost btn--stack">
                        보기
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <button
              type="button"
              className="btn btn--primary btn--stack"
              style={{ marginTop: "1rem" }}
              disabled={saving || configLoading}
              onClick={() => void save()}
            >
              {saving ? "저장 중…" : "순서 저장 (홈 반영)"}
            </button>
          </section>
        </div>

        <p style={{ marginTop: "1.5rem" }}>
          <Link to="/admin/contents" className="btn btn--ghost btn--stack">
            ← 콘텐츠 DB
          </Link>
        </p>
      </main>
    </div>
  );
}
