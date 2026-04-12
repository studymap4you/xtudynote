import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import { downloadStoragePathsSequentially } from "@/lib/downloads";
import { recordStudentDownload } from "@/lib/studentDownloads";
import { PublicShell } from "@/components/PublicShell";
import type { ContentDocument } from "@/types/content";
import "@/pages/pages.css";

type QRow = {
  id: string;
  question: string;
  answer: string | null;
  studentLabel: string;
};

export function ContentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { firebaseUser, profile } = useAuth();
  const [content, setContent] = useState<ContentDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qa, setQa] = useState<QRow[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const snap = await getDoc(doc(db, "contents", id));
        if (!snap.exists()) {
          if (!cancelled) setLoadError("자료를 찾을 수 없습니다.");
          return;
        }
        const d = snap.data() as ContentDocument;
        if (!cancelled) setContent(d);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "불러오지 못했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, "content_qa"),
      where("contentId", "==", id),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: QRow[] = [];
        snap.forEach((d) => {
          const x = d.data();
          list.push({
            id: d.id,
            question: String(x.question ?? ""),
            answer: x.answer != null ? String(x.answer) : null,
            studentLabel: String(x.studentId ?? "").slice(0, 8) + "…",
          });
        });
        setQa(list);
      },
      () => setQa([])
    );
    return () => unsub();
  }, [id]);

  const displayTitle = useMemo(() => {
    if (!content) return "";
    if ((content.type ?? "share") === "homework" && content.homeworkCode) {
      const pin = content.shortCode?.trim();
      return pin ? `${pin} · ${content.subject}` : `${content.homeworkCode} · ${content.subject}`;
    }
    return content.subject;
  }, [content]);

  const lectureUrls = useMemo(() => {
    const raw = content?.lectureLink?.trim();
    if (!raw) return [];
    return raw
      .split(/\n+/)
      .map((u) => u.trim())
      .filter(Boolean);
  }, [content?.lectureLink]);

  const isUploader =
    !!profile && content && profile.accountStatus === "active" && profile.uid === content.authorId;

  async function submitQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !id || !question.trim()) return;
    setBusy(true);
    try {
      await addDoc(collection(db, "content_qa"), {
        contentId: id,
        studentId: firebaseUser.uid,
        question: question.trim(),
        answer: null,
        createdAt: serverTimestamp(),
      });
      setQuestion("");
    } finally {
      setBusy(false);
    }
  }

  async function saveAnswer(qaId: string, text: string) {
    if (!id) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "content_qa", qaId), {
        answer: text,
        answeredAt: serverTimestamp(),
      });
    } finally {
      setBusy(false);
    }
  }

  async function downloadAll() {
    if (!firebaseUser) {
      window.alert("다운로드는 로그인 후 이용할 수 있습니다.");
      return;
    }
    if (!content) return;
    const paths = [...content.learningMaterialFilePaths, ...content.referenceMaterialFilePaths];
    if (paths.length === 0) {
      window.alert("다운로드할 파일이 없습니다.");
      return;
    }
    await downloadStoragePathsSequentially(paths);
    if (profile?.role === "student" && id) {
      await recordStudentDownload({
        studentId: firebaseUser.uid,
        contentId: id,
        title: displayTitle || content.subject,
        storagePaths: paths,
      });
    }
  }

  if (!id) {
    return (
      <PublicShell>
        <main className="admin-layout admin-layout--light">
          <p>잘못된 경로입니다.</p>
        </main>
      </PublicShell>
    );
  }

  if (loadError || !content) {
    return (
      <PublicShell>
        <main className="admin-layout admin-layout--light">
          <p className="auth-error">{loadError ?? "불러오는 중…"}</p>
          <Link to="/library" className="btn btn--ghost btn--stack">
            라이브러리로
          </Link>
        </main>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <main className="admin-layout content-detail admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>{displayTitle}</h1>
          <span className="ui-ko">{content.learningTopic}</span>
        </div>
        <p className="content-detail__intro">{content.introduction}</p>
        {lectureUrls.length > 0 && (
          <section className="content-detail__lecture-links" aria-label="강의 영상 링크">
            <h2 className="content-detail__lecture-links-title">강의 영상 링크</h2>
            <ul className="content-detail__lecture-url-list">
              {lectureUrls.map((u, i) => (
                <li key={`lecture-${i}-${u.slice(0, 48)}`}>
                  <a href={u} target="_blank" rel="noreferrer">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(content.type ?? "share") === "paid" && content.purchaseLink && (
          <p>
            <a href={content.purchaseLink} target="_blank" rel="noreferrer">
              구매 링크
            </a>
          </p>
        )}
        <div className="content-detail__actions">
          <button type="button" className="btn btn--primary btn--stack" onClick={() => void downloadAll()}>
            <span className="ui-en">Download all files</span>
            <span className="ui-ko">파일 순차 다운로드</span>
          </button>
          {!firebaseUser && (
            <p className="auth-error" style={{ marginTop: "0.75rem" }}>
              비회원은 다운로드할 수 없습니다. 로그인해 주세요.
            </p>
          )}
        </div>

        <section className="panel panel--light content-detail__qa">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Q&amp;A</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                이 자료에 대한 질문 · 선생님(업로더)만 답변
              </span>
            </div>
          </div>
          <ul className="content-detail__qa-list">
            {qa.map((row) => (
              <li key={row.id} className="content-detail__qa-item">
                <p>
                  <strong>Q</strong> ({row.studentLabel}) {row.question}
                </p>
                {row.answer && (
                  <p className="content-detail__qa-answer">
                    <strong>A</strong> {row.answer}
                  </p>
                )}
                {isUploader && (
                  <AnswerEditor
                    key={`ed-${row.id}-${row.answer ?? ""}`}
                    initial={row.answer ?? ""}
                    disabled={busy}
                    onSave={(t) => void saveAnswer(row.id, t)}
                  />
                )}
              </li>
            ))}
          </ul>
          {firebaseUser && profile?.role === "student" ? (
            <form onSubmit={(e) => void submitQuestion(e)} className="content-detail__qa-form">
              <label className="auth-field">
                질문 작성
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={3}
                  className="add-passage__control add-passage__intro"
                />
              </label>
              <button type="submit" className="btn btn--primary btn--stack" disabled={busy}>
                질문 등록
              </button>
            </form>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>질문은 학생 로그인 후 작성할 수 있습니다.</p>
          )}
        </section>

        <p style={{ marginTop: "1.5rem" }}>
          <Link to="/library" className="btn btn--ghost btn--stack">
            ← Library
          </Link>
        </p>
      </main>
    </PublicShell>
  );
}

function AnswerEditor({
  initial,
  disabled,
  onSave,
}: {
  initial: string;
  disabled: boolean;
  onSave: (t: string) => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <div className="content-detail__qa-reply">
      <textarea
        className="add-passage__control"
        rows={3}
        value={val}
        disabled={disabled}
        onChange={(e) => setVal(e.target.value)}
        placeholder="답변을 입력하세요."
      />
      <button type="button" className="btn btn--primary btn--stack" disabled={disabled} onClick={() => onSave(val)}>
        답변 저장
      </button>
    </div>
  );
}
