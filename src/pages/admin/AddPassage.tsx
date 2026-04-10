import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addDoc, collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { useAuth } from "@/contexts/AuthContext";
import { AdminTopNav } from "@/components/AdminTopNav";
import { db, storage } from "@/firebase/config";
import { allocateUniqueHomeworkCode } from "@/lib/allocateHomeworkCode";
import type { ContentStatus, ContentType } from "@/types/content";
import "@/pages/pages.css";

function suggestsUniversityLecture(subject: string, audience: string, learningTopic: string): boolean {
  const t = `${subject}\n${audience}\n${learningTopic}`;
  return /(?:대학|대학원|학부|강의|학점|캠퍼스|학과|전공|과목코드|syllabus|lecture|course|undergraduate|graduate)/i.test(
    t
  );
}

function buildPlaceholders(uni: boolean) {
  if (uni) {
    return {
      subject: "예: 금융공학개론, 데이터베이스 (수강 코드 CS301)",
      audience: "예: 경영학부 2학년, 전공 필수 수강자",
      section: "예: 3주차 — 관계형 모델 / 중간고사 범위 A절",
      identifier: "예: MID-2026-03, 출제안 v2",
      learningTopic: "예: 정규화(Normalization), 트랜잭션 격리 수준",
    };
  }
  return {
    subject: "예: 수학 I, 읽기·쓰기 기초",
    audience: "예: 고등학교 2학년, 내신 대비반",
    section: "예: 지수·로그, 독해 전략 ②",
    identifier: "예: SET-A-12, 교육청 기출 변형",
    learningTopic: "예: 로그방정식, 주장·근거 찾기",
  };
}

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-가-힣]+/g, "_").slice(0, 180) || "file";
}

type ContentDocumentInput = {
  authorId: string;
  subject: string;
  audience: string;
  section: string;
  identifier: string;
  learningTopic: string;
  introduction: string;
  lectureLink: string | null;
  learningMaterialFilePaths: string[];
  referenceMaterialFilePaths: string[];
  type: ContentType;
  status: ContentStatus;
  purchaseLink: string | null;
  homeworkCode: string | null;
  shortCode?: string | null;
  homeworkInstruction: string | null;
  createdAt: ReturnType<typeof serverTimestamp>;
};

async function uploadFilesForKind(
  files: File[],
  authorId: string,
  uploadStarted: number,
  kindPrefix: "lm" | "ref"
): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = `contents/${authorId}/${kindPrefix}_${Math.floor(uploadStarted)}_${i}_${safeFileName(file.name)}`;
    const sref = ref(storage, path);
    await uploadBytes(sref, file);
    const pathWritten = sref.fullPath;
    if (!pathWritten) {
      throw new Error("Storage 업로드 후 경로를 확인할 수 없습니다.");
    }
    paths.push(pathWritten);
  }
  if (paths.length !== files.length) {
    throw new Error("업로드된 파일 수와 기록된 경로 수가 일치하지 않습니다.");
  }
  return paths;
}

export function AddPassage() {
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const [subject, setSubject] = useState("");
  const [audience, setAudience] = useState("");
  const [section, setSection] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [learningTopic, setLearningTopic] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [lectureLink, setLectureLink] = useState("");
  const [learningMaterialFiles, setLearningMaterialFiles] = useState<File[]>([]);
  const [referenceMaterialFiles, setReferenceMaterialFiles] = useState<File[]>([]);
  const [contentType, setContentType] = useState<ContentType>("share");
  const [contentStatus, setContentStatus] = useState<ContentStatus>("approved");
  const [purchaseLink, setPurchaseLink] = useState("");
  const [homeworkInstruction, setHomeworkInstruction] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uniMode = useMemo(
    () => suggestsUniversityLecture(subject, audience, learningTopic),
    [subject, audience, learningTopic]
  );
  const ph = useMemo(() => buildPlaceholders(uniMode), [uniMode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) {
      setError("로그인이 필요합니다.");
      return;
    }
    const trimmed = {
      subject: subject.trim(),
      audience: audience.trim(),
      section: section.trim(),
      identifier: identifier.trim(),
      learningTopic: learningTopic.trim(),
      introduction: introduction.trim(),
      lectureLink: lectureLink.trim(),
      purchaseLink: purchaseLink.trim(),
      homeworkInstruction: homeworkInstruction.trim(),
    };
    if (
      !trimmed.subject ||
      !trimmed.audience ||
      !trimmed.section ||
      !trimmed.identifier ||
      !trimmed.learningTopic ||
      !trimmed.introduction
    ) {
      setError("표준 분류 5개 항목과 자료 소개·안내(Introduction)는 필수입니다.");
      return;
    }
    if (contentType === "homework" && !trimmed.homeworkInstruction) {
      setError("과제 타입은 과제 수행 가이드(Instruction)가 필수입니다.");
      return;
    }
    setError(null);
    setSaving(true);
    const authorId = firebaseUser.uid.trim();
    if (!authorId) {
      setError("작성자 식별자(authorId)를 확인할 수 없습니다. 다시 로그인해 주세요.");
      setSaving(false);
      return;
    }

    const uploadStarted = performance.now();

    try {
      const learningMaterialFilePaths = await uploadFilesForKind(
        learningMaterialFiles,
        authorId,
        uploadStarted,
        "lm"
      );
      const referenceMaterialFilePaths = await uploadFilesForKind(
        referenceMaterialFiles,
        authorId,
        uploadStarted + 1,
        "ref"
      );

      const common = {
        authorId,
        subject: trimmed.subject,
        audience: trimmed.audience,
        section: trimmed.section,
        identifier: trimmed.identifier,
        learningTopic: trimmed.learningTopic,
        introduction: trimmed.introduction,
        lectureLink: trimmed.lectureLink.length > 0 ? trimmed.lectureLink : null,
        learningMaterialFilePaths,
        referenceMaterialFilePaths,
        type: contentType,
        status: contentStatus,
        purchaseLink:
          contentType === "paid" && trimmed.purchaseLink.length > 0 ? trimmed.purchaseLink : null,
        createdAt: serverTimestamp(),
      };

      if (contentType === "homework") {
        const { homeworkCode: hwCode, shortCode } = await allocateUniqueHomeworkCode();
        const contentRef = doc(collection(db, "contents"));
        const batch = writeBatch(db);
        const payload: ContentDocumentInput = {
          ...common,
          homeworkCode: hwCode,
          shortCode,
          homeworkInstruction: trimmed.homeworkInstruction,
        };
        batch.set(contentRef, payload);
        batch.set(doc(db, "homework_codes", hwCode), {
          contentId: contentRef.id,
          homeworkCode: hwCode,
          shortCode,
          authorId,
          subject: trimmed.subject,
          learningTopic: trimmed.learningTopic,
          introduction: trimmed.introduction,
          homeworkInstruction: trimmed.homeworkInstruction,
          lectureLink: common.lectureLink,
          learningMaterialFilePaths,
          referenceMaterialFilePaths,
          status: contentStatus,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        window.alert(
          `과제가 등록되었습니다.\n\n학생에게 안내할 번호(4자리): ${shortCode}\n전체 코드: ${hwCode}`
        );
      } else {
        const payload: ContentDocumentInput = {
          ...common,
          homeworkCode: null,
          homeworkInstruction: null,
        };
        await addDoc(collection(db, "contents"), payload);
        window.alert("자료가 성공적으로 등록되었습니다!");
      }
      navigate("/admin/contents", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <AdminTopNav />
      <main className="admin-layout add-passage">
        <div className="admin-layout__title-row">
          <h1>Register learning material</h1>
          <span className="ui-ko">학습 자료 등록</span>
        </div>
        <p>
          <span className="ui-en" style={{ display: "block", color: "var(--text-muted)" }}>
            Standard taxonomy, introduction, links, and categorized file uploads — saved with your author id.
          </span>
          <span className="ui-ko" style={{ display: "block", marginTop: "0.35rem" }}>
            표준 분류·소개·링크·학습/참고 자료 업로드를 Firestore contents에 저장합니다.
          </span>
        </p>
        {uniMode && (
          <p className="add-passage__hint-banner">
            <span className="ui-en">University-style cues detected — placeholders show lecture-friendly examples.</span>
            <span className="ui-ko" style={{ display: "block", marginTop: "0.3rem" }}>
              대학 강의와 관련된 입력으로 보입니다. 예시 placeholder가 강의·수업 맥락에 맞게 바뀝니다.
            </span>
          </p>
        )}
        {error && <p className="auth-error">{error}</p>}

        <form onSubmit={handleSubmit} className="add-passage__form">
          <fieldset className="add-passage__fieldset">
            <legend className="add-passage__legend">
              <span className="ui-en">Standard classification</span>
              <span className="ui-ko">표준 분류 (5)</span>
            </legend>
            <div className="add-passage__grid">
              <label className="auth-field add-passage__field">
                <span className="ui-en">Subject · 과목</span>
                <span className="ui-ko">분야·과목명</span>
                <input
                  className="add-passage__control"
                  value={subject}
                  onChange={(ev) => setSubject(ev.target.value)}
                  placeholder={ph.subject}
                  autoComplete="off"
                />
              </label>
              <label className="auth-field add-passage__field">
                <span className="ui-en">Audience · 대상</span>
                <span className="ui-ko">학년·수준·대상 독자</span>
                <input
                  className="add-passage__control"
                  value={audience}
                  onChange={(ev) => setAudience(ev.target.value)}
                  placeholder={ph.audience}
                  autoComplete="off"
                />
              </label>
              <label className="auth-field add-passage__field">
                <span className="ui-en">Unit / section · 단원·섹션</span>
                <span className="ui-ko">차시·범위·챕터</span>
                <input
                  className="add-passage__control"
                  value={section}
                  onChange={(ev) => setSection(ev.target.value)}
                  placeholder={ph.section}
                  autoComplete="off"
                />
              </label>
              <label className="auth-field add-passage__field">
                <span className="ui-en">Number / id · 번호·식별자</span>
                <span className="ui-ko">세트·문항·자료 코드</span>
                <input
                  className="add-passage__control"
                  value={identifier}
                  onChange={(ev) => setIdentifier(ev.target.value)}
                  placeholder={ph.identifier}
                  autoComplete="off"
                />
              </label>
              <label className="auth-field add-passage__field add-passage__field--wide">
                <span className="ui-en">Learning topic · 학습 주제</span>
                <span className="ui-ko">핵심 개념·스킬 한 줄 요약</span>
                <input
                  className="add-passage__control"
                  value={learningTopic}
                  onChange={(ev) => setLearningTopic(ev.target.value)}
                  placeholder={ph.learningTopic}
                  autoComplete="off"
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="add-passage__fieldset">
            <legend className="add-passage__legend">
              <span className="ui-en">Type · status · links</span>
              <span className="ui-ko">유형 · 공개 상태 · 구매 링크</span>
            </legend>
            <div className="add-passage__grid">
              <label className="auth-field add-passage__field">
                <span className="ui-en">Type</span>
                <span className="ui-ko">유형 (공유 / 유료 / 과제)</span>
                <select
                  className="add-passage__control"
                  value={contentType}
                  onChange={(ev) => setContentType(ev.target.value as ContentType)}
                >
                  <option value="share">공유 (share)</option>
                  <option value="paid">유료 (paid)</option>
                  <option value="homework">과제 (homework)</option>
                </select>
              </label>
              <label className="auth-field add-passage__field">
                <span className="ui-en">Status</span>
                <span className="ui-ko">상태 (대기 / 승인 / 반려)</span>
                <select
                  className="add-passage__control"
                  value={contentStatus}
                  onChange={(ev) => setContentStatus(ev.target.value as ContentStatus)}
                >
                  <option value="pending">대기</option>
                  <option value="approved">승인</option>
                  <option value="rejected">반려</option>
                </select>
              </label>
              {contentType === "paid" && (
                <label className="auth-field add-passage__field add-passage__field--wide">
                  <span className="ui-en">Purchase link</span>
                  <span className="ui-ko">구매 URL (유료)</span>
                  <input
                    className="add-passage__control"
                    type="url"
                    value={purchaseLink}
                    onChange={(ev) => setPurchaseLink(ev.target.value)}
                    placeholder="https://..."
                    autoComplete="off"
                  />
                </label>
              )}
            </div>
            {contentType === "homework" && (
              <div className="add-passage__block" style={{ marginTop: "1rem" }}>
                <label className="auth-field">
                  <span className="ui-en">Homework instruction</span>
                  <span className="ui-ko">과제 수행 가이드 및 주의사항 (학생이 번호 검색 시 최우선 표시)</span>
                </label>
                <textarea
                  className="add-passage__control add-passage__intro"
                  value={homeworkInstruction}
                  onChange={(ev) => setHomeworkInstruction(ev.target.value)}
                  rows={12}
                  spellCheck
                  placeholder="과제 목표, 제출 형식, 금지 사항 등을 적습니다."
                />
              </div>
            )}
          </fieldset>

          <fieldset className="add-passage__fieldset">
            <legend className="add-passage__legend">
              <span className="ui-en">Learning tools</span>
              <span className="ui-ko">학습도구</span>
            </legend>

            <div className="add-passage__block">
              <label className="auth-field">
                <span className="ui-en">Introduction · 자료 소개 및 안내</span>
                <span className="ui-ko">(Introduction) 학습자에게 보여줄 개요·주의사항·활용 방법</span>
              </label>
              <p className="add-passage__guide">
                이 자료의 목적, 구성, 풀이 시 참고할 점 등을 적습니다. 공지성 문구도 이 영역에 두면 됩니다.
              </p>
              <textarea
                className="add-passage__control add-passage__intro"
                value={introduction}
                onChange={(ev) => setIntroduction(ev.target.value)}
                rows={10}
                spellCheck
                placeholder="예: 본 세트는 중간 범위 3~5주차이며, 서술형은 별도 배점입니다."
              />
            </div>

            <div className="add-passage__block">
              <label className="auth-field">
                <span className="ui-en">Lecture link · 강의 링크</span>
                <span className="ui-ko">선택 — LMS·녹화·참고 영상 URL</span>
              </label>
              <p className="add-passage__guide">
                Blackboard, Canvas, YouTube, Zoom 녹화 등 전체 URL을 넣으면 학습자가 바로 이동할 수 있습니다. 공개
                가능한 링크만 입력하세요.
              </p>
              <input
                className="add-passage__control"
                type="url"
                inputMode="url"
                value={lectureLink}
                onChange={(ev) => setLectureLink(ev.target.value)}
                placeholder="https://..."
                autoComplete="off"
              />
            </div>

            <div className="add-passage__block">
              <label className="auth-field">
                <span className="ui-en">Learning material upload · 학습 자료 업로드</span>
                <span className="ui-ko">(Learning Material)</span>
              </label>
              <div className="add-passage__upload-row">
                <input
                  type="file"
                  multiple
                  className="add-passage__file-input add-passage__control add-passage__control--file"
                  onChange={(ev) => {
                    const list = ev.target.files;
                    setLearningMaterialFiles(list ? Array.from(list) : []);
                  }}
                />
                <p className="add-passage__upload-hint">
                  문제지·강의 노트·학습용 PDF 등 <strong>본 학습의 주 자료</strong>를 올립니다. 여러 파일을 한 번에
                  선택할 수 있습니다.
                </p>
              </div>
              {learningMaterialFiles.length > 0 && (
                <ul className="upload-list add-passage__file-list">
                  {learningMaterialFiles.map((f) => (
                    <li key={`lm-${f.name}-${f.size}`}>{f.name}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="add-passage__block">
              <label className="auth-field">
                <span className="ui-en">Reference / answer key upload · 참고 자료·해설서 업로드</span>
                <span className="ui-ko">(Reference / Answer Key)</span>
              </label>
              <div className="add-passage__upload-row">
                <input
                  type="file"
                  multiple
                  className="add-passage__file-input add-passage__control add-passage__control--file"
                  onChange={(ev) => {
                    const list = ev.target.files;
                    setReferenceMaterialFiles(list ? Array.from(list) : []);
                  }}
                />
                <p className="add-passage__upload-hint">
                  해설지·참고서·부록·정답표 등 <strong>보조·참고용 자료</strong>를 올립니다. 학습 자료와 구분하여
                  관리됩니다.
                </p>
              </div>
              {referenceMaterialFiles.length > 0 && (
                <ul className="upload-list add-passage__file-list">
                  {referenceMaterialFiles.map((f) => (
                    <li key={`ref-${f.name}-${f.size}`}>{f.name}</li>
                  ))}
                </ul>
              )}
            </div>
          </fieldset>

          <div className="add-passage__actions">
            <button type="submit" className="btn btn--primary btn--stack" disabled={saving}>
              <span className="ui-en">{saving ? "Saving…" : "Save to Firestore"}</span>
              <span className="ui-ko">{saving ? "저장 중…" : "저장 후 목록으로"}</span>
            </button>
            <Link to="/admin/contents" className="btn btn--ghost btn--stack">
              <span className="ui-en">Cancel</span>
              <span className="ui-ko">취소</span>
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
