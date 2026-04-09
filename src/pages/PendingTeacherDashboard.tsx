import { useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/firebase/config";
import "@/pages/pages.css";

export function PendingTeacherDashboard() {
  const { firebaseUser, profile, refreshProfile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urls = profile?.verificationFileUrls ?? [];

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !firebaseUser) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const safeName = `${Date.now()}_${file.name.replace(/[^\w.-]/g, "_")}`;
        const sref = ref(storage, `verification/${firebaseUser.uid}/${safeName}`);
        await uploadBytes(sref, file);
        const url = await getDownloadURL(sref);
        await updateDoc(doc(db, "users", firebaseUser.uid), {
          verificationFileUrls: arrayUnion(url),
          verificationSubmittedAt: serverTimestamp(),
        });
      }
      setMessage("UPLOAD_OK");
      await refreshProfile();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Upload failed. 업로드에 실패했습니다."
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <main className="dashboard">
      <div className="dashboard__title-wrap">
        <h1 className="dashboard__title">Verification in progress</h1>
        <span className="ui-ko">교육자 신원 검토 중</span>
      </div>
      <p className="dashboard__subtitle">
        <span className="ui-en">
          Upload proof of eligibility (e.g. ID, employment letter). Publishing to the Smart Library
          stays disabled until a Super Admin approves you.
        </span>
        <span className="ui-ko">
          신분증·재직증명서 등 증빙을 업로드해 주세요. 승인 전까지 학습 자료 등록은 비활성화됩니다.
        </span>
      </p>
      <div className="dashboard-grid dashboard-grid--teacher">
        <section className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Verification documents</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                증빙 서류 업로드
              </span>
            </div>
            <span className="panel__badge">pending_teacher</span>
          </div>
          <div className="upload-zone">
            <p style={{ margin: 0, color: "var(--text-muted)" }}>
              <span className="ui-en">PDF or images · max 10 MB per file</span>
              <span className="ui-ko" style={{ display: "block", marginTop: "0.35rem" }}>
                PDF 또는 이미지 · 파일당 10MB 이하
              </span>
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.pdf,application/pdf"
              multiple
              disabled={busy}
              onChange={onFiles}
            />
          </div>
          {error && <p className="auth-error">{error}</p>}
          {message === "UPLOAD_OK" && (
            <p style={{ color: "var(--success)", fontSize: "0.9rem" }}>
              <span className="ui-en">Files uploaded. An admin will review shortly.</span>
              <span className="ui-ko" style={{ display: "block", marginTop: "0.35rem" }}>
                서류가 업로드되었습니다. 관리자 검토를 기다려 주세요.
              </span>
            </p>
          )}
          {urls.length > 0 && (
            <>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                <span className="ui-en">Submitted files ({urls.length})</span>
                <span className="ui-ko" style={{ display: "block", marginTop: "0.2rem" }}>
                  제출된 파일 ({urls.length})
                </span>
              </p>
              <ul className="upload-list">
                {urls.map((u) => (
                  <li key={u}>
                    <a href={u} target="_blank" rel="noreferrer">
                      Open / download · 열기
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <aside className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Publish materials</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                자료 등록
              </span>
            </div>
            <span className="panel__badge panel__badge--locked">Locked · 잠금</span>
          </div>
          <div className="materials-placeholder materials-placeholder--blocked">
            <span className="ui-en">
              Unlocks once a Super Admin upgrades you to Teacher.
            </span>
            <span className="ui-ko" style={{ display: "block", marginTop: "0.5rem" }}>
              슈퍼 관리자가 Teacher로 승인하면 활성화됩니다.
            </span>
          </div>
        </aside>
      </div>
    </main>
  );
}
