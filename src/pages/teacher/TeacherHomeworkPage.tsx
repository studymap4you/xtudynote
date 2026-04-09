import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { useAuth } from "@/contexts/AuthContext";
import { TeacherRoute } from "@/components/TeacherRoute";
import { DashboardShell } from "@/components/DashboardShell";
import { db, storage } from "@/firebase/config";
import { allocateUniqueHomeworkCode } from "@/lib/allocateHomeworkCode";
import "@/pages/pages.css";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-가-힣]+/g, "_").slice(0, 180) || "file";
}

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
    paths.push(sref.fullPath);
  }
  return paths;
}

function Inner() {
  const navigate = useNavigate();
  const { firebaseUser, isSuperAdmin } = useAuth();
  const [subject, setSubject] = useState("");
  const [audience, setAudience] = useState("");
  const [section, setSection] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [learningTopic, setLearningTopic] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [homeworkInstruction, setHomeworkInstruction] = useState("");
  const [lectureLink, setLectureLink] = useState("");
  const [learningMaterialFiles, setLearningMaterialFiles] = useState<File[]>([]);
  const [referenceMaterialFiles, setReferenceMaterialFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultStatus = useMemo(() => (isSuperAdmin ? "approved" : "pending"), [isSuperAdmin]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;
    const trimmed = {
      subject: subject.trim(),
      audience: audience.trim(),
      section: section.trim(),
      identifier: identifier.trim(),
      learningTopic: learningTopic.trim(),
      introduction: introduction.trim(),
      homeworkInstruction: homeworkInstruction.trim(),
      lectureLink: lectureLink.trim(),
    };
    if (
      !trimmed.subject ||
      !trimmed.audience ||
      !trimmed.section ||
      !trimmed.identifier ||
      !trimmed.learningTopic ||
      !trimmed.introduction ||
      !trimmed.homeworkInstruction
    ) {
      setError("필수 항목과 과제 가이드(Instruction)를 입력해 주세요.");
      return;
    }
    setError(null);
    setSaving(true);
    const authorId = firebaseUser.uid;
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
      const code = await allocateUniqueHomeworkCode();
      const contentRef = doc(collection(db, "contents"));
      const batch = writeBatch(db);
      batch.set(contentRef, {
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
        type: "homework",
        status: defaultStatus,
        purchaseLink: null,
        homeworkCode: code,
        homeworkInstruction: trimmed.homeworkInstruction,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, "homework_codes", code), {
        contentId: contentRef.id,
        homeworkCode: code,
        authorId,
        subject: trimmed.subject,
        learningTopic: trimmed.learningTopic,
        introduction: trimmed.introduction,
        homeworkInstruction: trimmed.homeworkInstruction,
        lectureLink: trimmed.lectureLink.length > 0 ? trimmed.lectureLink : null,
        learningMaterialFilePaths,
        referenceMaterialFilePaths,
        status: defaultStatus,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      window.alert(`과제가 등록되었습니다.\n과제 번호: ${code}`);
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell>
      <main className="admin-layout add-passage">
        <div className="admin-layout__title-row">
          <h1>과제 출제</h1>
          <span className="ui-ko">과제 타입 · 가이드(Instruction) · 자동 과제번호</span>
        </div>
        <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
          {isSuperAdmin
            ? "관리자 계정으로 등록 시 바로 승인 상태로 저장됩니다."
            : "등록 후 관리자 승인이 필요합니다. 승인 전까지 학생은 번호로 조회할 수 없습니다."}
        </p>
        {error && <p className="auth-error">{error}</p>}
        <form onSubmit={(e) => void handleSubmit(e)} className="add-passage__form">
          <fieldset className="add-passage__fieldset">
            <legend className="add-passage__legend">표준 분류</legend>
            <div className="add-passage__grid">
              <label className="auth-field add-passage__field">
                과목
                <input className="add-passage__control" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="auth-field add-passage__field">
                대상
                <input className="add-passage__control" value={audience} onChange={(e) => setAudience(e.target.value)} />
              </label>
              <label className="auth-field add-passage__field">
                단원·섹션
                <input className="add-passage__control" value={section} onChange={(e) => setSection(e.target.value)} />
              </label>
              <label className="auth-field add-passage__field">
                식별번호
                <input
                  className="add-passage__control"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </label>
              <label className="auth-field add-passage__field add-passage__field--wide">
                학습 주제
                <input
                  className="add-passage__control"
                  value={learningTopic}
                  onChange={(e) => setLearningTopic(e.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="add-passage__fieldset">
            <legend className="add-passage__legend">과제 가이드 (최우선 표시)</legend>
            <label className="auth-field">
              과제 수행 가이드 및 주의사항 (Instruction)
              <textarea
                className="add-passage__control add-passage__intro"
                rows={12}
                value={homeworkInstruction}
                onChange={(e) => setHomeworkInstruction(e.target.value)}
                placeholder="학생이 과제 번호로 들어왔을 때 가장 먼저 보게 됩니다."
              />
            </label>
          </fieldset>

          <fieldset className="add-passage__fieldset">
            <legend className="add-passage__legend">자료 소개·링크·파일</legend>
            <label className="auth-field">
              자료 소개 (Introduction)
              <textarea
                className="add-passage__control add-passage__intro"
                rows={8}
                value={introduction}
                onChange={(e) => setIntroduction(e.target.value)}
              />
            </label>
            <label className="auth-field">
              강의 링크 (선택)
              <input
                className="add-passage__control"
                type="url"
                value={lectureLink}
                onChange={(e) => setLectureLink(e.target.value)}
              />
            </label>
            <div className="add-passage__block">
              <label className="auth-field">학습 자료 업로드</label>
              <input
                type="file"
                multiple
                className="add-passage__control add-passage__control--file"
                onChange={(ev) => {
                  const list = ev.target.files;
                  setLearningMaterialFiles(list ? Array.from(list) : []);
                }}
              />
            </div>
            <div className="add-passage__block">
              <label className="auth-field">참고 자료 업로드</label>
              <input
                type="file"
                multiple
                className="add-passage__control add-passage__control--file"
                onChange={(ev) => {
                  const list = ev.target.files;
                  setReferenceMaterialFiles(list ? Array.from(list) : []);
                }}
              />
            </div>
          </fieldset>

          <div className="add-passage__actions">
            <button type="submit" className="btn btn--primary btn--stack" disabled={saving}>
              {saving ? "저장 중…" : "과제 등록"}
            </button>
            <Link to="/dashboard" className="btn btn--ghost btn--stack">
              취소
            </Link>
          </div>
        </form>
      </main>
    </DashboardShell>
  );
}

export function TeacherHomeworkPage() {
  return (
    <TeacherRoute>
      <Inner />
    </TeacherRoute>
  );
}
