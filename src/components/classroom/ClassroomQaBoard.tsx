import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase/config";
import { useAuth } from "@/contexts/AuthContext";
import type { ClassroomQaPostDocument } from "@/types/classroom";

type Row = { id: string; data: ClassroomQaPostDocument };

function tsMillis(t: unknown): number {
  if (t && typeof t === "object" && "toMillis" in t && typeof (t as { toMillis: () => number }).toMillis === "function") {
    return (t as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function ClassroomQaBoard({
  classroomId,
  isClassroomTeacher,
}: {
  classroomId: string;
  /** 강의실 소유 선생님 — 타인 글 삭제 가능 */
  isClassroomTeacher: boolean;
}) {
  const { firebaseUser, profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [questionBody, setQuestionBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "classrooms", classroomId, "qa_posts"),
      (snap) => {
        const list: Row[] = [];
        snap.forEach((d) => list.push({ id: d.id, data: d.data() as ClassroomQaPostDocument }));
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [classroomId]);

  const { roots, repliesByParent } = useMemo(() => {
    const roots: Row[] = [];
    const repliesByParent: Record<string, Row[]> = {};
    for (const r of rows) {
      const pid = r.data.parentPostId;
      if (!pid) {
        roots.push(r);
      } else {
        if (!repliesByParent[pid]) repliesByParent[pid] = [];
        repliesByParent[pid].push(r);
      }
    }
    roots.sort((a, b) => tsMillis(b.data.createdAt) - tsMillis(a.data.createdAt));
    for (const k of Object.keys(repliesByParent)) {
      repliesByParent[k].sort((a, b) => tsMillis(a.data.createdAt) - tsMillis(b.data.createdAt));
    }
    return { roots, repliesByParent };
  }, [rows]);

  const authorLabel = profile?.displayName?.trim() || firebaseUser?.email?.split("@")[0] || "익명";

  async function postQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !questionBody.trim()) return;
    setBusy(true);
    try {
      await addDoc(collection(db, "classrooms", classroomId, "qa_posts"), {
        authorId: firebaseUser.uid,
        authorName: authorLabel,
        body: questionBody.trim(),
        parentPostId: null,
        createdAt: serverTimestamp(),
      });
      setQuestionBody("");
    } finally {
      setBusy(false);
    }
  }

  async function postReply(parentPostId: string) {
    const text = (replyDrafts[parentPostId] ?? "").trim();
    if (!firebaseUser || !text) return;
    setBusy(true);
    try {
      await addDoc(collection(db, "classrooms", classroomId, "qa_posts"), {
        authorId: firebaseUser.uid,
        authorName: authorLabel,
        body: text,
        parentPostId,
        createdAt: serverTimestamp(),
      });
      setReplyDrafts((prev) => ({ ...prev, [parentPostId]: "" }));
    } finally {
      setBusy(false);
    }
  }

  async function removePost(postId: string) {
    if (!firebaseUser) return;
    if (!window.confirm("이 글을 삭제할까요?")) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, "classrooms", classroomId, "qa_posts", postId));
    } finally {
      setBusy(false);
    }
  }

  if (!firebaseUser) {
    return <p className="classroom-qa__hint">질의응답에 참여하려면 로그인해 주세요.</p>;
  }

  return (
    <div className="classroom-qa">
      <form className="classroom-qa__composer" onSubmit={(e) => void postQuestion(e)}>
        <label className="classroom-qa__label" htmlFor={`qa-q-${classroomId}`}>
          새 질문
        </label>
        <textarea
          id={`qa-q-${classroomId}`}
          className="classroom-qa__textarea"
          rows={3}
          value={questionBody}
          onChange={(e) => setQuestionBody(e.target.value)}
          placeholder="수업·자료에 대해 질문을 남겨 주세요."
          disabled={busy}
        />
        <button type="submit" className="btn btn--primary btn--stack" disabled={busy || !questionBody.trim()}>
          질문 등록
        </button>
      </form>

      {loading ? (
        <p className="classroom-qa__hint">불러오는 중…</p>
      ) : roots.length === 0 ? (
        <p className="classroom-qa__hint">아직 질문이 없습니다. 첫 질문을 남겨 보세요.</p>
      ) : (
        <ul className="classroom-qa__threads">
          {roots.map((q) => {
            const replies = repliesByParent[q.id] ?? [];
            return (
              <li key={q.id} className="classroom-qa__thread">
                <div className="classroom-qa__post classroom-qa__post--question">
                  <div className="classroom-qa__meta">
                    <strong>{q.data.authorName}</strong>
                    <span className="classroom-qa__date">
                      {new Date(tsMillis(q.data.createdAt)).toLocaleString()}
                    </span>
                  </div>
                  <p className="classroom-qa__body">{q.data.body}</p>
                  {(isClassroomTeacher || q.data.authorId === firebaseUser.uid) && (
                    <button
                      type="button"
                      className="classroom-qa__delete"
                      onClick={() => void removePost(q.id)}
                      disabled={busy}
                    >
                      삭제
                    </button>
                  )}
                </div>
                {replies.length > 0 && (
                  <ul className="classroom-qa__replies">
                    {replies.map((r) => (
                      <li key={r.id} className="classroom-qa__post classroom-qa__post--reply">
                        <div className="classroom-qa__meta">
                          <strong>{r.data.authorName}</strong>
                          <span className="classroom-qa__date">
                            {new Date(tsMillis(r.data.createdAt)).toLocaleString()}
                          </span>
                        </div>
                        <p className="classroom-qa__body">{r.data.body}</p>
                        {(isClassroomTeacher || r.data.authorId === firebaseUser.uid) && (
                          <button
                            type="button"
                            className="classroom-qa__delete"
                            onClick={() => void removePost(r.id)}
                            disabled={busy}
                          >
                            삭제
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="classroom-qa__reply-box">
                  <textarea
                    className="classroom-qa__textarea classroom-qa__textarea--sm"
                    rows={2}
                    value={replyDrafts[q.id] ?? ""}
                    onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="답글을 입력하세요 (선생님·학습자 모두)"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="btn btn--ghost btn--stack"
                    disabled={busy || !(replyDrafts[q.id] ?? "").trim()}
                    onClick={() => void postReply(q.id)}
                  >
                    답글 등록
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
