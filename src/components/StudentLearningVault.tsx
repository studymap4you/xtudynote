import { useCallback, useEffect, useState } from "react";
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
import { removeStudentDownload } from "@/lib/studentDownloads";
import "@/pages/pages.css";

type VaultRow = {
  id: string;
  contentId: string;
  title: string;
  storagePaths: string[];
  lastLabel: string;
};

function formatAt(raw: unknown): string {
  if (raw instanceof Timestamp) return raw.toDate().toLocaleString();
  return "—";
}

export function StudentLearningVault() {
  const { firebaseUser, profile } = useAuth();
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser || profile?.role !== "student") {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "student_downloads"),
      where("studentId", "==", firebaseUser.uid),
      orderBy("lastDownloadedAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: VaultRow[] = [];
        snap.forEach((d) => {
          const x = d.data();
          list.push({
            id: d.id,
            contentId: String(x.contentId ?? ""),
            title: String(x.title ?? "제목 없음"),
            storagePaths: (x.storagePaths as string[]) ?? [],
            lastLabel: formatAt(x.lastDownloadedAt),
          });
        });
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [firebaseUser, profile?.role]);

  const redownload = useCallback(
    async (row: VaultRow) => {
      if (!firebaseUser) return;
      if (row.storagePaths.length === 0) {
        window.alert("저장된 파일 경로가 없습니다.");
        return;
      }
      setBusy(row.id);
      try {
        await downloadStoragePathsSequentially(row.storagePaths);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "다운로드에 실패했습니다.");
      } finally {
        setBusy(null);
      }
    },
    [firebaseUser]
  );

  const remove = useCallback(
    async (row: VaultRow) => {
      if (!firebaseUser) return;
      if (!window.confirm("보관함에서 삭제할까요? (파일은 다시 라이브러리에서 받을 수 있습니다)")) return;
      setBusy(row.id);
      try {
        await removeStudentDownload(firebaseUser.uid, row.contentId);
      } finally {
        setBusy(null);
      }
    },
    [firebaseUser]
  );

  if (profile?.role !== "student") return null;

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">나의 학습자료실</h2>
          <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
            다운로드한 자료 · 재다운로드 및 삭제
          </span>
        </div>
      </div>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="materials-placeholder">
          <span className="ui-en">No saved downloads yet.</span>
          <span className="ui-ko" style={{ display: "block", marginTop: "0.5rem" }}>
            라이브러리에서 자료를 받으면 여기에 쌓입니다.
          </span>
        </p>
      ) : (
        <ul className="student-vault__list">
          {rows.map((row) => (
            <li key={row.id} className="student-vault__item">
              <div>
                <strong>{row.title}</strong>
                <span className="student-vault__meta">{row.lastLabel}</span>
              </div>
              <div className="student-vault__actions">
                <Link to={`/content/${row.contentId}`} className="btn btn--ghost btn--stack">
                  <span className="ui-en">Detail</span>
                  <span className="ui-ko">상세</span>
                </Link>
                <button
                  type="button"
                  className="btn btn--primary btn--stack"
                  disabled={busy === row.id}
                  onClick={() => void redownload(row)}
                >
                  <span className="ui-en">Download again</span>
                  <span className="ui-ko">재다운로드</span>
                </button>
                <button
                  type="button"
                  className="btn btn--danger btn--stack"
                  disabled={busy === row.id}
                  onClick={() => void remove(row)}
                >
                  <span className="ui-en">Remove</span>
                  <span className="ui-ko">삭제</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
