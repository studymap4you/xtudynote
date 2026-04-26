import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { BookOpen, DollarSign, FileStack, GraduationCap, ImageOff, Layers, Type } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { DescriptionAssetQueue } from "@/components/DescriptionAssetQueue";
import { MaterialRegisterPreviewModal } from "@/components/MaterialRegisterPreviewModal";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/RichTextEditor";
import { db, storage } from "@/firebase/config";
import { uploadEditorAttachmentWithProgress, uploadEditorImageWithProgress } from "@/lib/editorUploads";
import { uploadBytesResumableWithProgress } from "@/lib/storageUploadProgress";
import { LearningThemeChecklist } from "@/components/LearningThemeChecklist";
import { extractImageSrcsFromHtml, isEmptyRichText } from "@/lib/richTextUtils";
import type { ContentType } from "@/types/content";
import type { LearningThemeId } from "@/types/learningTheme";
import type { UserProfile } from "@/types/user";
import type { MaterialRequestDocument } from "@/types/materialRequest";
import { getClassroomIfTeacher } from "@/lib/classroom";
import "@/pages/pages.css";
import "@/pages/material-register-premium.css";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-가-힣]+/g, "_").slice(0, 180) || "file";
}

function newFileSlotId(): string {
  return crypto.randomUUID();
}

const MAX_DESC_QUEUE_IMAGE = 10 * 1024 * 1024;
const MAX_DESC_QUEUE_FILE = 35 * 1024 * 1024;

async function uploadPendingFilesResumable(
  files: File[],
  uploaderId: string,
  requestId: string,
  kindPrefix: "lm" | "ref",
  uploadStarted: number,
  byteOffset: number,
  byteTotal: number,
  setPct: (n: number) => void
): Promise<string[]> {
  const paths: string[] = [];
  let done = byteOffset;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = `pending_materials/${uploaderId}/${requestId}/${kindPrefix}_${Math.floor(uploadStarted)}_${i}_${safeFileName(file.name)}`;
    const { fullPath } = await uploadBytesResumableWithProgress(storage, path, file, (p) => {
      const cur = done + (file.size * p) / 100;
      setPct(Math.min(99, Math.round((cur / byteTotal) * 100)));
    });
    paths.push(fullPath);
    done += file.size;
  }
  return paths;
}

function resolveSubmitterRole(profile: UserProfile): MaterialRequestDocument["submitterRole"] {
  if (profile.role === "super_admin") return "super_admin";
  if (profile.role === "teacher") return "teacher";
  return "student";
}

function formatFileSizeBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type MatPremiumFieldProps = {
  id: string;
  labelEn: string;
  labelKo: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  icon: React.ReactNode;
  multiline?: boolean;
  rows?: number;
};

function MatPremiumField({
  id,
  labelEn,
  labelKo,
  value,
  onChange,
  required,
  type,
  inputMode,
  placeholder,
  icon,
  multiline,
  rows,
}: MatPremiumFieldProps) {
  return (
    <div className="mat-premium-field">
      <div className="mat-premium-field__label-row">
        <span className="mat-premium-field__icon-wrap" aria-hidden>
          {icon}
        </span>
        <label className="mat-premium-field__text-label" htmlFor={id}>
          <span className="mat-premium-field__en">{labelEn}</span>
          <span className="mat-premium-field__ko">{labelKo}</span>
        </label>
      </div>
      <div className="mat-premium-field__input-shell">
        {multiline ? (
          <textarea
            id={id}
            className="mat-premium-field__input mat-premium-field__input--textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            rows={rows ?? 6}
            placeholder={placeholder}
            spellCheck
          />
        ) : (
          <input
            id={id}
            type={type ?? "text"}
            inputMode={inputMode}
            className="mat-premium-field__input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            placeholder={placeholder}
            autoComplete="off"
          />
        )}
      </div>
    </div>
  );
}

function MatFilePickList({ files }: { files: File[] }) {
  if (!files.length) {
    return <p className="mat-file-pick-empty">선택된 파일이 없습니다.</p>;
  }
  return (
    <ul className="mat-file-pick-ul">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="mat-file-pick-li">
          <span className="mat-file-pick-name">{f.name}</span>
          <span className="mat-file-pick-size">{formatFileSizeBytes(f.size)}</span>
        </li>
      ))}
    </ul>
  );
}

export function MaterialRegisterPage() {
  const { firebaseUser, profile, canManageMaterials, isStudent, isSuperAdmin } = useAuth();
  const [searchParams] = useSearchParams();

  const canSubmit =
    !!profile &&
    (isStudent || canManageMaterials || isSuperAdmin) &&
    profile.role !== "pending_teacher";

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [audienceGrade, setAudienceGrade] = useState("");
  const [materialType, setMaterialType] = useState<ContentType>("share");
  const [description, setDescription] = useState("");
  const [desiredPrice, setDesiredPrice] = useState("");
  const [homeworkInstruction, setHomeworkInstruction] = useState("");
  const [lmSlots, setLmSlots] = useState(() => [newFileSlotId()]);
  const [refSlots, setRefSlots] = useState(() => [newFileSlotId()]);
  const [lmBySlot, setLmBySlot] = useState<Record<string, File[]>>({});
  const [refBySlot, setRefBySlot] = useState<Record<string, File[]>>({});
  const [themes, setThemes] = useState<LearningThemeId[]>([]);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbObjectUrl, setThumbObjectUrl] = useState<string | null>(null);
  const [previewSampleFile, setPreviewSampleFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const descriptionEditorRef = useRef<RichTextEditorHandle>(null);
  const [descQueue, setDescQueue] = useState<{ id: string; file: File }[]>([]);
  const [descInsertBusy, setDescInsertBusy] = useState(false);
  const [descInsertProgress, setDescInsertProgress] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const descImageSrcs = useMemo(() => extractImageSrcsFromHtml(description), [description]);

  const learningFileRows = useMemo(() => {
    const rows: { name: string; size: number }[] = [];
    for (const id of lmSlots) {
      for (const f of lmBySlot[id] ?? []) {
        rows.push({ name: f.name, size: f.size });
      }
    }
    return rows;
  }, [lmSlots, lmBySlot]);

  const referenceFileRows = useMemo(() => {
    const rows: { name: string; size: number }[] = [];
    for (const id of refSlots) {
      for (const f of refBySlot[id] ?? []) {
        rows.push({ name: f.name, size: f.size });
      }
    }
    return rows;
  }, [refSlots, refBySlot]);

  useEffect(() => {
    if (!thumbnailFile) {
      setThumbObjectUrl(null);
      return;
    }
    const u = URL.createObjectURL(thumbnailFile);
    setThumbObjectUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [thumbnailFile]);

  const showPrice = materialType === "paid";
  const showHomeworkNotes = materialType === "homework";

  const priceNum = useMemo(() => {
    const t = desiredPrice.trim();
    if (!t) return null;
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }, [desiredPrice]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !profile || !canSubmit) return;

    if (!title.trim() || !subject.trim() || !audienceGrade.trim() || isEmptyRichText(description)) {
      window.alert("제목·과목·학년·상세 설명은 필수입니다.");
      return;
    }
    if (themes.length === 0) {
      window.alert("테마를 하나 이상 선택해 주세요. (라이브러리 분류에 사용됩니다.)");
      return;
    }
    if (materialType === "paid" && (priceNum == null || priceNum < 0)) {
      window.alert("유료 자료는 희망 판매 가격(원)을 입력해 주세요.");
      return;
    }
    if (materialType === "paid" && !thumbnailFile) {
      window.alert("유료 자료는 썸네일 이미지를 업로드해 주세요.");
      return;
    }
    if (previewSampleFile) {
      const lower = previewSampleFile.name.toLowerCase();
      const okType =
        previewSampleFile.type === "application/pdf" || previewSampleFile.type === "application/x-pdf" || lower.endsWith(".pdf");
      if (!okType) {
        window.alert("미리보기 파일은 PDF만 업로드할 수 있습니다.");
        return;
      }
      if (previewSampleFile.size > 25 * 1024 * 1024) {
        window.alert("미리보기 PDF는 25MB 이하여야 합니다.");
        return;
      }
    }
    if (materialType === "homework" && !homeworkInstruction.trim()) {
      window.alert("과제 유형은 과제 주의사항을 입력해 주세요.");
      return;
    }

    let classroomId: string | null = searchParams.get("classroomId")?.trim() || null;
    if (classroomId) {
      const ok = await getClassroomIfTeacher(classroomId, firebaseUser.uid);
      if (!ok) {
        window.alert("강의실을 찾을 수 없거나 이 강의실에 자료를 연결할 권한이 없습니다.");
        return;
      }
    }

    setSaving(true);
    setUploadPct(0);
    try {
      const reqRef = doc(collection(db, "material_requests"));
      const requestId = reqRef.id;
      const t0 = performance.now();
      const learningFiles = lmSlots.flatMap((id) => lmBySlot[id] ?? []);
      const referenceFiles = refSlots.flatMap((id) => refBySlot[id] ?? []);
      const thumbBytes = materialType === "paid" && thumbnailFile ? thumbnailFile.size : 0;
      const previewBytes = previewSampleFile?.size ?? 0;
      const byteTotal =
        learningFiles.reduce((s, f) => s + f.size, 0) +
          referenceFiles.reduce((s, f) => s + f.size, 0) +
          thumbBytes +
          previewBytes || 1;
      let doneBytes = 0;

      const learningMaterialFilePaths = await uploadPendingFilesResumable(
        learningFiles,
        firebaseUser.uid,
        requestId,
        "lm",
        t0,
        doneBytes,
        byteTotal,
        setUploadPct
      );
      doneBytes += learningFiles.reduce((s, f) => s + f.size, 0);

      const referenceMaterialFilePaths = await uploadPendingFilesResumable(
        referenceFiles,
        firebaseUser.uid,
        requestId,
        "ref",
        t0 + 1,
        doneBytes,
        byteTotal,
        setUploadPct
      );
      doneBytes += referenceFiles.reduce((s, f) => s + f.size, 0);

      let thumbnailPendingPath: string | null = null;
      if (materialType === "paid" && thumbnailFile) {
        const path = `pending_materials/${firebaseUser.uid}/${requestId}/thumb_${Math.floor(t0)}_${safeFileName(thumbnailFile.name)}`;
        const { fullPath } = await uploadBytesResumableWithProgress(storage, path, thumbnailFile, (p) => {
          const cur = doneBytes + (thumbnailFile.size * p) / 100;
          setUploadPct(Math.min(99, Math.round((cur / byteTotal) * 100)));
        });
        thumbnailPendingPath = fullPath;
        doneBytes += thumbnailFile.size;
      }

      let previewPendingPath: string | null = null;
      let previewUrl: string | null = null;
      if (previewSampleFile) {
        const path = `pending_materials/${firebaseUser.uid}/${requestId}/preview_${Math.floor(t0)}_${safeFileName(previewSampleFile.name)}`;
        const { fullPath } = await uploadBytesResumableWithProgress(storage, path, previewSampleFile, (p) => {
          const cur = doneBytes + (previewSampleFile.size * p) / 100;
          setUploadPct(Math.min(99, Math.round((cur / byteTotal) * 100)));
        });
        previewPendingPath = fullPath;
        previewUrl = await getDownloadURL(ref(storage, path));
        doneBytes += previewSampleFile.size;
      }
      setUploadPct(100);

      const role = resolveSubmitterRole(profile);

      await setDoc(reqRef, {
        submitterId: firebaseUser.uid,
        submitterRole: role,
        studentId: firebaseUser.uid,
        title: title.trim(),
        materialType,
        subject: subject.trim(),
        audienceGrade: audienceGrade.trim(),
        section: "",
        description: description.trim(), // HTML (Quill)
        desiredPrice: materialType === "paid" ? priceNum : null,
        homeworkInstruction: materialType === "homework" ? homeworkInstruction.trim() : null,
        learningMaterialFilePaths,
        referenceMaterialFilePaths,
        themes,
        ...(thumbnailPendingPath ? { thumbnailPendingPath } : {}),
        ...(previewPendingPath && previewUrl ? { previewPendingPath, previewUrl } : {}),
        status: "pending",
        ...(classroomId ? { classroomId } : {}),
        createdAt: serverTimestamp(),
      });

      window.alert("신청이 접수되었습니다. 마스터의 검수 후 2~3일 내에 등록됩니다.");
      setDone(true);
      setTitle("");
      setSubject("");
      setAudienceGrade("");
      setDescription("");
      setDesiredPrice("");
      setHomeworkInstruction("");
      setLmSlots([newFileSlotId()]);
      setRefSlots([newFileSlotId()]);
      setLmBySlot({});
      setRefBySlot({});
      setThemes([]);
      setThumbnailFile(null);
      setPreviewSampleFile(null);
      setDescQueue([]);
      setMaterialType("share");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "제출에 실패했습니다.");
    } finally {
      setSaving(false);
      setUploadPct(null);
    }
  }

  function addDescQueueFiles(files: File[]) {
    if (!files.length) return;
    setDescQueue((q) => [...q, ...files.map((f) => ({ id: crypto.randomUUID(), file: f }))]);
  }

  function removeDescQueueItem(id: string) {
    setDescQueue((q) => q.filter((x) => x.id !== id));
  }

  function moveDescQueueItem(id: string, delta: -1 | 1) {
    setDescQueue((q) => {
      const i = q.findIndex((x) => x.id === id);
      if (i < 0) return q;
      const j = i + delta;
      if (j < 0 || j >= q.length) return q;
      const next = [...q];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function insertDescQueueToDescription() {
    if (!firebaseUser?.uid) {
      window.alert("로그인이 필요합니다.");
      return;
    }
    const ed = descriptionEditorRef.current;
    if (!ed || descQueue.length === 0) return;
    setDescInsertBusy(true);
    setDescInsertProgress(0);
    const uid = firebaseUser.uid;
    const total = descQueue.length;
    const imgs: string[] = [];
    const links: { url: string; name: string }[] = [];
    try {
      for (let i = 0; i < descQueue.length; i++) {
        const f = descQueue[i].file;
        if (f.type.startsWith("image/")) {
          if (f.size > MAX_DESC_QUEUE_IMAGE) {
            window.alert(`이미지는 ${MAX_DESC_QUEUE_IMAGE / (1024 * 1024)}MB 이하여야 합니다: ${f.name}`);
            continue;
          }
          const url = await uploadEditorImageWithProgress(uid, f, (p) =>
            setDescInsertProgress(Math.round(((i + p / 100) / total) * 100))
          );
          imgs.push(url);
        } else {
          if (f.size > MAX_DESC_QUEUE_FILE) {
            window.alert(`첨부는 ${MAX_DESC_QUEUE_FILE / (1024 * 1024)}MB 이하여야 합니다: ${f.name}`);
            continue;
          }
          const url = await uploadEditorAttachmentWithProgress(uid, f, (p) =>
            setDescInsertProgress(Math.round(((i + p / 100) / total) * 100))
          );
          links.push({ url, name: f.name });
        }
        setDescInsertProgress(Math.round(((i + 1) / total) * 100));
      }
      ed.insertImageUrls(imgs);
      ed.insertFileLinks(links);
      setDescQueue([]);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "업로드에 실패했습니다.");
    } finally {
      setDescInsertBusy(false);
      setDescInsertProgress(null);
    }
  }

  return (
    <DashboardShell light>
      <main
        className={`admin-layout material-register admin-layout--light material-register--unified material-register--premium${canSubmit ? " material-register--has-sticky" : ""}`}
      >
        <div className="admin-layout__title-row">
          <h1>자료 등록</h1>
          <span className="ui-ko material-register__subtitle-bi">
            <span className="reg-form__label-en" style={{ display: "block", fontWeight: 700 }}>
              Unified registration
            </span>
            <span className="reg-form__label-ko" style={{ display: "block", marginTop: "0.25rem" }}>
              스터디맵 검수 후 라이브러리에 반영됩니다
            </span>
          </span>
        </div>
        <p className="material-register__notice">
          마스터의 검수 후 <strong>2~3일 내에</strong> 등록됩니다.
        </p>

        {!firebaseUser && <p className="auth-error">로그인이 필요합니다.</p>}

        {profile?.role === "pending_teacher" && (
          <p className="auth-error">
            교육자 승인 완료 후 자료 등록 신청을 이용할 수 있습니다.
          </p>
        )}

        {canSubmit && (
          <>
            <div className="material-register__shell">
              <section className="material-register-form material-register-form--full">
                {done && (
                  <p className="material-register__success" style={{ marginBottom: "1rem" }}>
                    접수되었습니다. 감사합니다.
                  </p>
                )}
                <form
                  id="material-register-form"
                  onSubmit={(e) => void handleSubmit(e)}
                  className="material-register-form__grid"
                >
                  <div className="mat-premium-card">
                    <h2 className="mat-premium-card__title">기본 정보</h2>
                    <MatPremiumField
                      id="mat-title"
                      labelEn="Title"
                      labelKo="제목"
                      value={title}
                      onChange={setTitle}
                      required
                      icon={<Type size={18} strokeWidth={2} aria-hidden />}
                    />
                    <MatPremiumField
                      id="mat-subject"
                      labelEn="Subject"
                      labelKo="과목"
                      value={subject}
                      onChange={setSubject}
                      required
                      icon={<BookOpen size={18} strokeWidth={2} aria-hidden />}
                    />
                    <MatPremiumField
                      id="mat-grade"
                      labelEn="Grade / level"
                      labelKo="학년·수준"
                      value={audienceGrade}
                      onChange={setAudienceGrade}
                      required
                      placeholder="예: 고2, 대학 1학년"
                      icon={<GraduationCap size={18} strokeWidth={2} aria-hidden />}
                    />
                  </div>

                  <div className="mat-premium-card">
                    <h2 className="mat-premium-card__title">자료 유형 · 테마</h2>
                    <fieldset className="material-register-form__fieldset">
                      <legend className="material-register-form__legend">
                        <span className="reg-form__label-en">Material type</span>
                        <span className="reg-form__label-ko"> 자료 유형</span>
                      </legend>
                      <div className="material-register-form__radio-row">
                        {(
                          [
                            ["share", "Share · 공유"],
                            ["paid", "Paid · 유료"],
                            ["homework", "Homework · 과제"],
                          ] as const
                        ).map(([v, label]) => (
                          <label key={v} className="material-register-form__radio">
                            <input
                              type="radio"
                              name="materialType"
                              value={v}
                              checked={materialType === v}
                              onChange={() => setMaterialType(v)}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <LearningThemeChecklist value={themes} onChange={setThemes} disabled={saving} idPrefix="mat" />
                  </div>

                  {showPrice && (
                    <div className="mat-premium-card">
                      <h2 className="mat-premium-card__title">유료 설정</h2>
                      <MatPremiumField
                        id="mat-price"
                        labelEn="Desired price (KRW)"
                        labelKo="희망 판매 가격 (원)"
                        value={desiredPrice}
                        onChange={setDesiredPrice}
                        type="text"
                        inputMode="decimal"
                        placeholder="예: 15000"
                        required
                        icon={<DollarSign size={18} strokeWidth={2} aria-hidden />}
                      />
                      <div className="mat-premium-field material-register__thumb-block">
                        <div className="mat-premium-field__label-row">
                          <span className="mat-premium-field__icon-wrap" aria-hidden>
                            <Layers size={18} strokeWidth={2} />
                          </span>
                          <div className="mat-premium-field__text-label">
                            <span className="mat-premium-field__en">Thumbnail image</span>
                            <span className="mat-premium-field__ko">썸네일 이미지 (필수)</span>
                          </div>
                        </div>
                        <div className="material-register__thumb-row">
                          <div className="material-register__thumb-preview" aria-live="polite">
                            {thumbObjectUrl ? (
                              <img src={thumbObjectUrl} alt="선택한 썸네일 미리보기" />
                            ) : (
                              <div className="material-register__thumb-placeholder">
                                <ImageOff size={40} strokeWidth={1.35} aria-hidden />
                                <span>이미지 없음</span>
                              </div>
                            )}
                          </div>
                          <div className="material-register__thumb-side">
                            <input
                              type="file"
                              accept="image/*"
                              className="add-passage__control add-passage__control--file"
                              onChange={(e) => setThumbnailFile(e.target.files?.[0] ?? null)}
                            />
                            {thumbnailFile ? (
                              <button
                                type="button"
                                className="btn btn--ghost material-register__thumb-clear"
                                onClick={() => setThumbnailFile(null)}
                              >
                                선택 해제
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {showHomeworkNotes && (
                    <div className="mat-premium-card">
                      <h2 className="mat-premium-card__title">과제 안내</h2>
                      <MatPremiumField
                        id="mat-homework"
                        labelEn="Homework guidelines & cautions"
                        labelKo="과제 주의사항·안내"
                        value={homeworkInstruction}
                        onChange={setHomeworkInstruction}
                        required={showHomeworkNotes}
                        multiline
                        rows={10}
                        placeholder="제출 형식, 마감, 금지 사항 등"
                        icon={<FileStack size={18} strokeWidth={2} aria-hidden />}
                      />
                    </div>
                  )}

                  <div className="mat-premium-card material-register-form__field-rich">
                    <h2 className="mat-premium-card__title">상세 설명</h2>
                    <p className="material-register-form__rich-hint">
                      서식·색·정렬·이미지 다중 삽입·드래그 앤 드롭을 지원합니다. 하단 고정 바의「미리보기」로 학습자 화면과
                      동일하게 HTML이 렌더링된 결과를 확인할 수 있습니다.
                    </p>
                    <RichTextEditor
                      ref={descriptionEditorRef}
                      value={description}
                      onChange={setDescription}
                      userId={firebaseUser?.uid}
                      placeholder="자료 구성, 활용 방법, 목차 등을 작성해 주세요."
                    />
                    <DescriptionAssetQueue
                      items={descQueue}
                      disabled={saving}
                      insertBusy={descInsertBusy}
                      insertProgress={descInsertProgress}
                      onAddFiles={addDescQueueFiles}
                      onRemove={removeDescQueueItem}
                      onMove={moveDescQueueItem}
                      onInsertToDescription={() => void insertDescQueueToDescription()}
                    />
                  </div>

                  <div className="mat-premium-card material-register__optional-preview">
                    <h2 className="mat-premium-card__title">샘플 미리보기 PDF</h2>
                    <p className="material-register-form__rich-hint">
                      샘플 PDF 등을 올리면 Firestore에 <code>previewUrl</code>이 저장되어, 승인 후 학습자 화면의「샘플 보기」등에
                      바로 연결하기 쉽습니다. 없어도 신청은 가능합니다.
                      <span className="material-register__optional-badge" title="필수 아님">
                        Optional
                      </span>
                    </p>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      className="add-passage__control add-passage__control--file"
                      onChange={(e) => setPreviewSampleFile(e.target.files?.[0] ?? null)}
                    />
                    {previewSampleFile ? (
                      <div className="material-register__preview-file-meta">
                        <span className="material-register__preview-file-name">{previewSampleFile.name}</span>
                        <span className="mat-file-pick-size">{formatFileSizeBytes(previewSampleFile.size)}</span>
                        <button
                          type="button"
                          className="btn btn--ghost material-register__thumb-clear"
                          onClick={() => setPreviewSampleFile(null)}
                        >
                          파일 제거
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mat-premium-card">
                    <h2 className="mat-premium-card__title">파일 업로드</h2>
                    <div className="reg-form__field">
                      <span className="reg-form__label-line">
                        <span className="reg-form__label-en">Primary learning files</span>
                        <span className="reg-form__label-ko">학습용 주 자료</span>
                      </span>
                      <div className="material-register-form__multi-rows">
                        {lmSlots.map((slotId) => (
                          <div key={slotId} className="material-register-form__multi-row material-register-form__multi-row--file">
                            <input
                              type="file"
                              multiple
                              className="add-passage__control add-passage__control--file"
                              onChange={(ev) => {
                                const list = ev.target.files;
                                setLmBySlot((m) => ({
                                  ...m,
                                  [slotId]: list ? Array.from(list) : [],
                                }));
                              }}
                            />
                            <MatFilePickList files={lmBySlot[slotId] ?? []} />
                            {lmSlots.length > 1 && (
                              <button
                                type="button"
                                className="btn btn--ghost material-register-form__row-btn"
                                onClick={() => {
                                  setLmSlots((s) => s.filter((id) => id !== slotId));
                                  setLmBySlot((m) => {
                                    const n = { ...m };
                                    delete n[slotId];
                                    return n;
                                  });
                                }}
                              >
                                <span className="ui-en">Remove</span>
                                <span className="ui-ko">삭제</span>
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn btn--ghost material-register-form__add-row-btn"
                          onClick={() => setLmSlots((s) => [...s, newFileSlotId()])}
                        >
                          <span className="ui-en">+ Add file field</span>
                          <span className="ui-ko">+ 파일 입력 추가</span>
                        </button>
                      </div>
                    </div>
                    <div className="reg-form__field" style={{ marginTop: "1.25rem" }}>
                      <span className="reg-form__label-line">
                        <span className="reg-form__label-en">Answer key / reference</span>
                        <span className="reg-form__label-ko">해설·참고 자료</span>
                      </span>
                      <div className="material-register-form__multi-rows">
                        {refSlots.map((slotId) => (
                          <div key={slotId} className="material-register-form__multi-row material-register-form__multi-row--file">
                            <input
                              type="file"
                              multiple
                              className="add-passage__control add-passage__control--file"
                              onChange={(ev) => {
                                const list = ev.target.files;
                                setRefBySlot((m) => ({
                                  ...m,
                                  [slotId]: list ? Array.from(list) : [],
                                }));
                              }}
                            />
                            <MatFilePickList files={refBySlot[slotId] ?? []} />
                            {refSlots.length > 1 && (
                              <button
                                type="button"
                                className="btn btn--ghost material-register-form__row-btn"
                                onClick={() => {
                                  setRefSlots((s) => s.filter((id) => id !== slotId));
                                  setRefBySlot((m) => {
                                    const n = { ...m };
                                    delete n[slotId];
                                    return n;
                                  });
                                }}
                              >
                                <span className="ui-en">Remove</span>
                                <span className="ui-ko">삭제</span>
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn btn--ghost material-register-form__add-row-btn"
                          onClick={() => setRefSlots((s) => [...s, newFileSlotId()])}
                        >
                          <span className="ui-en">+ Add file field</span>
                          <span className="ui-ko">+ 파일 입력 추가</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {uploadPct !== null && saving ? (
                    <div
                      className="material-register__upload-progress"
                      role="progressbar"
                      aria-valuenow={uploadPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="material-register__upload-progress-bar" style={{ width: `${uploadPct}%` }} />
                      <span className="material-register__upload-progress-label">파일 업로드 {uploadPct}%</span>
                    </div>
                  ) : null}
                </form>

                <div className="material-register__footer-links">
                  <p className="reg-form__label-line" style={{ marginBottom: "0.5rem" }}>
                    <span className="reg-form__label-en" style={{ fontSize: "0.8rem" }}>
                      Quick links
                    </span>
                    <span className="reg-form__label-ko" style={{ fontSize: "0.78rem" }}>
                      바로가기 (선택)
                    </span>
                  </p>
                  <div className="material-register__footer-links-row">
                    {canManageMaterials && (
                      <Link to="/teacher/homework/new" className="material-register__text-link">
                        과제 즉시 출제 (교육자)
                      </Link>
                    )}
                    {isSuperAdmin && (
                      <Link to="/admin/contents/new" className="material-register__text-link">
                        관리자 직접 등록
                      </Link>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <MaterialRegisterPreviewModal
              open={previewOpen}
              onOpenChange={setPreviewOpen}
              title={title}
              subject={subject}
              audienceGrade={audienceGrade}
              materialType={materialType}
              themes={themes}
              desiredPrice={materialType === "paid" ? desiredPrice.trim() || null : null}
              thumbnailUrl={thumbObjectUrl}
              descriptionHtml={description}
              descImageSrcs={descImageSrcs}
              homeworkInstruction={materialType === "homework" ? homeworkInstruction : null}
              previewSampleName={previewSampleFile?.name ?? null}
              learningFiles={learningFileRows}
              referenceFiles={referenceFileRows}
            />

            <div className="material-register__sticky-bar" role="toolbar" aria-label="자료 등록 작업">
              <div className="material-register__sticky-inner">
                <button
                  type="button"
                  className="btn btn--ghost material-register__sticky-preview"
                  onClick={() => setPreviewOpen(true)}
                >
                  미리보기
                </button>
                <button
                  type="submit"
                  form="material-register-form"
                  className="btn btn--primary material-register__sticky-submit"
                  disabled={saving}
                >
                  <span className="ui-en">{saving ? "Submitting…" : "Submit request"}</span>
                  <span className="ui-ko">{saving ? "제출 중…" : "신청 제출"}</span>
                </button>
              </div>
            </div>
          </>
        )}

        {!canSubmit && firebaseUser && profile && profile.role !== "pending_teacher" && (
          <p className="auth-error">이 페이지는 학생 또는 승인된 교육자·관리자 계정에서 이용할 수 있습니다.</p>
        )}

        <p style={{ marginTop: "1.5rem" }}>
          <Link to="/dashboard" className="btn btn--ghost btn--stack">
            ← 대시보드
          </Link>
        </p>
      </main>
    </DashboardShell>
  );
}
