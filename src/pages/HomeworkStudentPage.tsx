import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/firebase/config";
import { downloadStoragePathsSequentially } from "@/lib/downloads";
import { getHomeworkCodeDocByRouteParam } from "@/lib/homeworkLookup";
import { PublicShell } from "@/components/PublicShell";
import type { HomeworkCodeDocument } from "@/types/content";
import "@/pages/pages.css";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-가-힣]+/g, "_").slice(0, 180) || "file";
}

export function HomeworkStudentPage() {
  const { code: codeParam } = useParams<{ code: string }>();
  const { firebaseUser, profile } = useAuth();
  const [snap, setSnap] = useState<HomeworkCodeDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const code = decodeURIComponent(codeParam ?? "").trim();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const resolved = await getHomeworkCodeDocByRouteParam(code);
        if (!resolved) {
          if (!cancelled) setError("해당 번호의 과제를 찾을 수 없습니다.");
          setSnap(null);
          return;
        }
        const d = resolved.data;
        if (!cancelled) setSnap(d);
      } catch (e) {
        const codeMsg =
          e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "permission-denied"
            ? "승인되지 않았거나 잘못된 과제 번호입니다."
            : e instanceof Error
              ? e.message
              : "조회에 실패했습니다.";
        if (!cancelled) setError(codeMsg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!firebaseUser || !snap?.contentId) return;
    let cancelled = false;
    (async () => {
      const q = query(
        collection(db, "submissions"),
        where("contentId", "==", snap.contentId),
        where("studentId", "==", firebaseUser.uid),
        limit(1)
      );
      const res = await getDocs(q);
      if (cancelled) return;
      if (!res.empty) setSubmittedId(res.docs[0].id);
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, snap?.contentId]);

  async function handleDownload() {
    if (!firebaseUser) {
      window.alert("다운로드는 로그인 후 이용할 수 있습니다.");
      return;
    }
    if (!snap) return;
    const paths = [...snap.learningMaterialFilePaths, ...snap.referenceMaterialFilePaths];
    if (paths.length === 0) {
      window.alert("첨부 파일이 없습니다.");
      return;
    }
    await downloadStoragePathsSequentially(paths);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !snap) return;
    if (profile?.role !== "student") {
      window.alert("과제 제출은 학생 계정으로만 가능합니다.");
      return;
    }
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) {
      window.alert("텍스트 또는 파일 중 최소 한 가지를 제출해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const subId = doc(collection(db, "submissions")).id;
      const filePaths: string[] = [];
      const uploadBase = `submissions/${snap.authorId}/${firebaseUser.uid}/${subId}`;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = `${uploadBase}/${safeFileName(f.name)}`;
        const sref = ref(storage, path);
        await uploadBytes(sref, f);
        filePaths.push(sref.fullPath);
      }
      await setDoc(doc(db, "submissions", subId), {
        contentId: snap.contentId,
        studentId: firebaseUser.uid,
        teacherId: snap.authorId,
        submissionText: trimmed,
        submissionFiles: filePaths,
        score: null,
        feedback: null,
        submittedAt: serverTimestamp(),
      });
      setSubmittedId(subId);
      setText("");
      setFiles([]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!code) {
    return (
      <PublicShell>
        <main className="admin-layout admin-layout--light">
          <p>과제 번호가 없습니다.</p>
        </main>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <main className="admin-layout homework-student admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>과제</h1>
          <span className="ui-ko">코드 {code}</span>
        </div>
        {loading && (
          <div className="route-loading">
            <div className="route-loading__spinner" />
          </div>
        )}
        {error && <p className="auth-error">{error}</p>}
        {snap && (
          <>
            <section className="panel homework-student__instruction">
              <h2 className="panel__title">과제 수행 가이드 및 주의사항</h2>
              <pre className="homework-student__pre">{snap.homeworkInstruction || "—"}</pre>
            </section>
            <section className="panel">
              <h2 className="panel__title">자료 소개</h2>
              <p>{snap.introduction}</p>
              <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>
                {snap.subject} · {snap.learningTopic}
              </p>
            </section>
            <div className="homework-student__actions">
              <button type="button" className="btn btn--primary btn--stack" onClick={() => void handleDownload()}>
                <span className="ui-en">Download materials</span>
                <span className="ui-ko">학습·참고 파일 받기 (로그인 필요)</span>
              </button>
              {!firebaseUser && (
                <p className="auth-error" style={{ marginTop: "0.5rem" }}>
                  파일 다운로드·제출은 로그인이 필요합니다.
                </p>
              )}
            </div>

            {firebaseUser && profile?.role === "student" && (
              <section className="panel homework-student__submit">
                <h2 className="panel__title">제출</h2>
                {submittedId ? (
                  <p style={{ color: "var(--text-muted)" }}>
                    제출이 접수되었습니다. (ID: {submittedId.slice(0, 8)}…)
                  </p>
                ) : (
                  <form onSubmit={(e) => void handleSubmit(e)}>
                    <label className="auth-field">
                      직접 입력
                      <textarea
                        className="add-passage__control add-passage__intro"
                        rows={8}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="답안을 텍스트로 작성할 수 있습니다."
                      />
                    </label>
                    <label className="auth-field">
                      파일 업로드 (복수 선택 가능)
                      <input
                        type="file"
                        multiple
                        className="add-passage__control add-passage__control--file"
                        onChange={(ev) => {
                          const list = ev.target.files;
                          setFiles(list ? Array.from(list) : []);
                        }}
                      />
                    </label>
                    <button type="submit" className="btn btn--primary btn--stack" disabled={submitting}>
                      {submitting ? "제출 중…" : "제출하기"}
                    </button>
                  </form>
                )}
              </section>
            )}

            <p style={{ marginTop: "1rem" }}>
              <Link to="/homework" className="btn btn--ghost btn--stack">
                ← 과제 검색
              </Link>
            </p>
          </>
        )}
      </main>
    </PublicShell>
  );
}
