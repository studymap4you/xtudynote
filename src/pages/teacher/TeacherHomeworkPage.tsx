import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { useAuth } from "@/contexts/AuthContext";
import { TeacherRoute } from "@/components/TeacherRoute";
import { DashboardShell } from "@/components/DashboardShell";
import { db, storage } from "@/firebase/config";
import { allocateUniqueHomeworkCode } from "@/lib/allocateHomeworkCode";
import { getClassroomIfTeacher } from "@/lib/classroom";
import { listClassroomsByTeacher, type ClassroomRow } from "@/lib/classroom/listTeacherClassrooms";
import "@/pages/pages.css";
import styles from "@/pages/teacher/teacherHomework.module.css";

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
  const [searchParams] = useSearchParams();
  const { firebaseUser, isSuperAdmin, isTeacherApproved } = useAuth();
  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);
  const [classroomsLoading, setClassroomsLoading] = useState(true);
  const [selectedClassroomId, setSelectedClassroomId] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [learningTopic, setLearningTopic] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [homeworkInstruction, setHomeworkInstruction] = useState("");
  const [lectureLink, setLectureLink] = useState("");
  const [learningMaterialFiles, setLearningMaterialFiles] = useState<File[]>([]);
  const [referenceMaterialFiles, setReferenceMaterialFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classroomIdParam = searchParams.get("classroomId")?.trim() || null;

  const defaultStatus = useMemo(() => (isSuperAdmin ? "approved" : "pending"), [isSuperAdmin]);

  useEffect(() => {
    if (!firebaseUser?.uid) {
      setClassrooms([]);
      setClassroomsLoading(false);
      return;
    }
    let cancelled = false;
    setClassroomsLoading(true);
    listClassroomsByTeacher(firebaseUser.uid).then((rows) => {
      if (!cancelled) {
        setClassrooms(rows);
        setClassroomsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (!classroomIdParam || classrooms.length === 0) return;
    const ok = classrooms.some((c) => c.id === classroomIdParam);
    if (ok) setSelectedClassroomId(classroomIdParam);
  }, [classroomIdParam, classrooms]);

  const selectedClassroom = useMemo(
    () => classrooms.find((c) => c.id === selectedClassroomId) ?? null,
    [classrooms, selectedClassroomId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;

    const classroomId = selectedClassroomId.trim();
    const titleTrim = assignmentTitle.trim();
    const lt = learningTopic.trim();
    const trimmed = {
      learningTopic: lt,
      introduction: introduction.trim(),
      homeworkInstruction: homeworkInstruction.trim(),
      lectureLink: lectureLink.trim(),
    };

    if (!classroomId) {
      setError("과제를 등록할 강의실을 선택해 주세요.");
      return;
    }
    if (!titleTrim) {
      setError("과제 제목을 입력해 주세요.");
      return;
    }
    if (!trimmed.introduction || !trimmed.homeworkInstruction) {
      setError("자료 소개와 과제 가이드(Instruction)를 입력해 주세요.");
      return;
    }
    if (!trimmed.learningTopic && learningMaterialFiles.length === 0) {
      setError("학습 주제를 입력하거나 학습 자료 파일을 최소 1개 업로드해 주세요.");
      return;
    }

    const cr = await getClassroomIfTeacher(classroomId, firebaseUser.uid);
    if (!cr) {
      setError("강의실을 찾을 수 없거나 이 강의실에 과제를 등록할 권한이 없습니다.");
      return;
    }

    const classroomTitle = (cr.title ?? "").trim() || selectedClassroom?.data.title?.trim() || "";

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
      const { homeworkCode: code, shortCode } = await allocateUniqueHomeworkCode();
      const contentRef = doc(collection(db, "contents"));
      const batch = writeBatch(db);
      const publishStatus = isSuperAdmin || isTeacherApproved ? "approved" : defaultStatus;
      batch.set(contentRef, {
        authorId,
        subject: titleTrim,
        audience: "",
        section: "",
        identifier: "",
        learningTopic: trimmed.learningTopic,
        introduction: trimmed.introduction,
        lectureLink: trimmed.lectureLink.length > 0 ? trimmed.lectureLink : null,
        learningMaterialFilePaths,
        referenceMaterialFilePaths,
        type: "homework",
        status: publishStatus,
        purchaseLink: null,
        homeworkCode: code,
        shortCode,
        homeworkInstruction: trimmed.homeworkInstruction,
        classroomId,
        classroomTitle: classroomTitle.length > 0 ? classroomTitle : null,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, "homework_codes", code), {
        contentId: contentRef.id,
        homeworkCode: code,
        shortCode,
        authorId,
        subject: titleTrim,
        learningTopic: trimmed.learningTopic,
        introduction: trimmed.introduction,
        homeworkInstruction: trimmed.homeworkInstruction,
        lectureLink: trimmed.lectureLink.length > 0 ? trimmed.lectureLink : null,
        learningMaterialFilePaths,
        referenceMaterialFilePaths,
        status: publishStatus,
        classroomId,
        classroomTitle: classroomTitle.length > 0 ? classroomTitle : null,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      window.alert(
        `과제가 등록되었습니다.\n\n학생에게 안내할 번호(4자리): ${shortCode}\n전체 코드: ${code}`
      );
      navigate(`/classroom/${classroomId}/manage`, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const noClassrooms = !classroomsLoading && classrooms.length === 0;

  return (
    <DashboardShell>
      <main className={`admin-layout admin-layout--light ${styles.wrap}`}>
        <header className={styles.hero}>
          <h1 className={styles.heroTitle}>
            <span className={styles.heroTitleAccent}>과제 출제</span>
          </h1>
          <p className={styles.heroMeta}>배포 강의실 · 과제 제목 · 자동 과제번호 · 가이드(Instruction)</p>
          <p className={styles.lede}>
            먼저 과제를 낼 강의실을 선택한 뒤 과제 제목과 안내를 입력합니다. 학생은{" "}
            <strong>강의실 이름·과제 제목·안내 번호</strong>로 과제를 찾을 수 있습니다.
            {!isSuperAdmin ? (
              <>
                {" "}
                승인된 선생님 계정으로 강의실에 연 과제는 검수 없이 학생 과제함에 반영됩니다.
              </>
            ) : (
              <> 관리자 계정으로 등록 시 바로 승인 상태로 저장됩니다.</>
            )}
          </p>
        </header>

        {error ? <p className="auth-error">{error}</p> : null}

        {noClassrooms ? (
          <div className={styles.emptyClassrooms}>
            개설된 강의실이 없습니다. 과제를 내려면 먼저 강의실을 만든 뒤 다시 오세요.{" "}
            <Link to="/classroom">강의실 개설로 이동</Link>
          </div>
        ) : null}

        {!noClassrooms ? (
          <form onSubmit={(e) => void handleSubmit(e)} className={styles.fieldGrid}>
            <fieldset className={`${styles.panel}`}>
              <legend className={styles.panelLegend}>표준 분류</legend>
              <p className={styles.panelHint}>강의실 → 과제 제목 순으로 입력</p>

              <div className={`${styles.fieldGrid} ${styles.fieldGridTwo}`}>
                <label className={styles.label}>
                  배포 강의실
                  <select
                    className={styles.select}
                    value={selectedClassroomId}
                    onChange={(e) => setSelectedClassroomId(e.target.value)}
                    disabled={classroomsLoading || saving}
                    required
                  >
                    <option value="">{classroomsLoading ? "불러오는 중…" : "강의실을 선택하세요"}</option>
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.data.title?.trim() || c.id}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.label}>
                  과제 제목
                  <input
                    className={styles.input}
                    value={assignmentTitle}
                    onChange={(e) => setAssignmentTitle(e.target.value)}
                    placeholder="예: 3월 둘째 주 독해 과제"
                    autoComplete="off"
                  />
                </label>
              </div>

              <label className={`${styles.label}`} style={{ marginTop: "1rem" }}>
                학습 주제 <span className={styles.optionalTag}>(선택 · 비워두려면 학습 자료 업로드 필수)</span>
                <input
                  className={styles.input}
                  value={learningTopic}
                  onChange={(e) => setLearningTopic(e.target.value)}
                  placeholder="비워두면 학습 자료 파일을 반드시 첨부해 주세요."
                  autoComplete="off"
                />
              </label>

              <div className={styles.noticeStrip} role="note">
                <strong>안내:</strong> 과목·대상·단원·식별번호는 더 이상 사용하지 않습니다. 검색은 강의실 이름과 과제
                제목으로 충분합니다.
              </div>
            </fieldset>

            <fieldset className={styles.panel}>
              <legend className={styles.panelLegend}>과제 가이드 (최우선 표시)</legend>
              <label className={styles.label}>
                과제 수행 가이드 및 주의사항 (Instruction)
                <textarea
                  className={`${styles.textarea} ${styles.textareaTall}`}
                  rows={12}
                  value={homeworkInstruction}
                  onChange={(e) => setHomeworkInstruction(e.target.value)}
                  placeholder="학생이 과제 번호로 들어왔을 때 가장 먼저 보게 됩니다."
                />
              </label>
            </fieldset>

            <fieldset className={styles.panel}>
              <legend className={styles.panelLegend}>자료 소개·링크·파일</legend>
              <label className={styles.label}>
                자료 소개 (Introduction)
                <textarea
                  className={`${styles.textarea}`}
                  rows={8}
                  value={introduction}
                  onChange={(e) => setIntroduction(e.target.value)}
                />
              </label>
              <label className={`${styles.label}`} style={{ marginTop: "0.85rem" }}>
                강의 링크 (선택)
                <input
                  className={styles.input}
                  type="url"
                  value={lectureLink}
                  onChange={(e) => setLectureLink(e.target.value)}
                />
              </label>
              <div style={{ marginTop: "0.85rem" }}>
                <label className={styles.label}>
                  학습 자료 업로드
                  <input
                    type="file"
                    multiple
                    className={`${styles.input} ${styles.fileInput}`}
                    onChange={(ev) => {
                      const list = ev.target.files;
                      setLearningMaterialFiles(list ? Array.from(list) : []);
                    }}
                  />
                </label>
              </div>
              <div style={{ marginTop: "0.85rem" }}>
                <label className={styles.label}>
                  참고 자료 업로드
                  <input
                    type="file"
                    multiple
                    className={`${styles.input} ${styles.fileInput}`}
                    onChange={(ev) => {
                      const list = ev.target.files;
                      setReferenceMaterialFiles(list ? Array.from(list) : []);
                    }}
                  />
                </label>
              </div>
            </fieldset>

            <div className={styles.actions}>
              <button type="submit" className={styles.btnPrimary} disabled={saving || classroomsLoading}>
                {saving ? "저장 중…" : "과제 등록"}
              </button>
              <Link to="/dashboard" className={styles.btnGhost}>
                취소
              </Link>
            </div>
          </form>
        ) : null}
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
