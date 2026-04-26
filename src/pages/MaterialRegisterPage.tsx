import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { ImageOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { ImageSlider } from "@/components/ImageSlider";
import { db, storage } from "@/firebase/config";
import { LearningThemeChecklist } from "@/components/LearningThemeChecklist";
import { RichTextEditor } from "@/components/RichTextEditor";
import { extractImageSrcsFromHtml, isEmptyRichText } from "@/lib/richTextUtils";
import type { ContentType } from "@/types/content";
import type { LearningThemeId } from "@/types/learningTheme";
import type { UserProfile } from "@/types/user";
import type { MaterialRequestDocument } from "@/types/materialRequest";
import { getClassroomIfTeacher } from "@/lib/classroom";
import "@/pages/pages.css";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-가-힣]+/g, "_").slice(0, 180) || "file";
}

function newFileSlotId(): string {
  return crypto.randomUUID();
}

async function uploadPendingFiles(
  files: File[],
  uploaderId: string,
  requestId: string,
  kindPrefix: "lm" | "ref",
  uploadStarted: number
): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = `pending_materials/${uploaderId}/${requestId}/${kindPrefix}_${Math.floor(uploadStarted)}_${i}_${safeFileName(file.name)}`;
    const sref = ref(storage, path);
    await uploadBytes(sref, file);
    paths.push(sref.fullPath);
  }
  return paths;
}

function resolveSubmitterRole(profile: UserProfile): MaterialRequestDocument["submitterRole"] {
  if (profile.role === "super_admin") return "super_admin";
  if (profile.role === "teacher") return "teacher";
  return "student";
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
  const [done, setDone] = useState(false);

  const descImageSrcs = useMemo(() => extractImageSrcsFromHtml(description), [description]);

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
    try {
      const reqRef = doc(collection(db, "material_requests"));
      const requestId = reqRef.id;
      const t0 = performance.now();
      const learningFiles = lmSlots.flatMap((id) => lmBySlot[id] ?? []);
      const referenceFiles = refSlots.flatMap((id) => refBySlot[id] ?? []);
      const learningMaterialFilePaths = await uploadPendingFiles(
        learningFiles,
        firebaseUser.uid,
        requestId,
        "lm",
        t0
      );
      const referenceMaterialFilePaths = await uploadPendingFiles(
        referenceFiles,
        firebaseUser.uid,
        requestId,
        "ref",
        t0 + 1
      );

      let thumbnailPendingPath: string | null = null;
      if (materialType === "paid" && thumbnailFile) {
        const path = `pending_materials/${firebaseUser.uid}/${requestId}/thumb_${Math.floor(t0)}_${safeFileName(thumbnailFile.name)}`;
        const sref = ref(storage, path);
        await uploadBytes(sref, thumbnailFile);
        thumbnailPendingPath = sref.fullPath;
      }

      let previewPendingPath: string | null = null;
      let previewUrl: string | null = null;
      if (previewSampleFile) {
        const path = `pending_materials/${firebaseUser.uid}/${requestId}/preview_${Math.floor(t0)}_${safeFileName(previewSampleFile.name)}`;
        const pref = ref(storage, path);
        await uploadBytes(pref, previewSampleFile);
        previewPendingPath = pref.fullPath;
        previewUrl = await getDownloadURL(pref);
      }

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
      setMaterialType("share");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "제출에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell light>
      <main className="admin-layout material-register admin-layout--light material-register--unified">
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
          <section className="panel panel--light material-register-form material-register-form--student material-register-form--full material-register-form--polish">
            {done && (
              <p className="material-register__success" style={{ marginBottom: "1rem" }}>
                접수되었습니다. 감사합니다.
              </p>
            )}
            <form onSubmit={(e) => void handleSubmit(e)} className="material-register-form__grid">
              <label className="reg-form__field">
                <span className="reg-form__label-line">
                  <span className="reg-form__label-en">Title</span>
                  <span className="reg-form__label-ko">제목</span>
                </span>
                <input
                  className="add-passage__control material-register-form__input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>

              <label className="reg-form__field">
                <span className="reg-form__label-line">
                  <span className="reg-form__label-en">Subject</span>
                  <span className="reg-form__label-ko">과목</span>
                </span>
                <input
                  className="add-passage__control material-register-form__input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>

              <label className="reg-form__field">
                <span className="reg-form__label-line">
                  <span className="reg-form__label-en">Grade / level</span>
                  <span className="reg-form__label-ko">학년·수준</span>
                </span>
                <input
                  className="add-passage__control material-register-form__input"
                  value={audienceGrade}
                  onChange={(e) => setAudienceGrade(e.target.value)}
                  required
                  autoComplete="off"
                  placeholder="예: 고2, 대학 1학년"
                />
              </label>

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

              {showPrice && (
                <>
                  <label className="reg-form__field">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Desired price (KRW)</span>
                      <span className="reg-form__label-ko">희망 판매 가격 (원)</span>
                    </span>
                    <input
                      className="add-passage__control material-register-form__input"
                      type="text"
                      inputMode="decimal"
                      value={desiredPrice}
                      onChange={(e) => setDesiredPrice(e.target.value)}
                      placeholder="예: 15000"
                      required
                    />
                  </label>
                  <div className="reg-form__field material-register__thumb-block">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Thumbnail image</span>
                      <span className="reg-form__label-ko">썸네일 이미지 (필수)</span>
                    </span>
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
                </>
              )}

              {showHomeworkNotes && (
                <label className="reg-form__field">
                  <span className="reg-form__label-line">
                    <span className="reg-form__label-en">Homework guidelines &amp; cautions</span>
                    <span className="reg-form__label-ko">과제 주의사항·안내</span>
                  </span>
                  <textarea
                    className="add-passage__control add-passage__intro material-register-form__textarea"
                    rows={6}
                    value={homeworkInstruction}
                    onChange={(e) => setHomeworkInstruction(e.target.value)}
                    required={showHomeworkNotes}
                    spellCheck
                    placeholder="제출 형식, 마감, 금지 사항 등"
                  />
                </label>
              )}

              <label className="reg-form__field material-register-form__field-rich">
                <span className="reg-form__label-line">
                  <span className="reg-form__label-en">Detailed description</span>
                  <span className="reg-form__label-ko">자료 상세 설명</span>
                </span>
                <p className="material-register-form__rich-hint">
                  서식·링크·이미지 삽입 가능 (이미지는 로그인 계정으로 스토리지에 저장됩니다).
                </p>
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  userId={firebaseUser?.uid}
                  placeholder="자료 구성, 활용 방법, 목차 등을 작성해 주세요."
                />
                {descImageSrcs.length > 0 ? (
                  <div className="material-register__desc-images">
                    <p className="material-register-form__rich-hint">
                      상세 설명에 삽입한 이미지입니다. 슬라이드 또는 액자 그리드로 확인할 수 있습니다.
                    </p>
                    <ImageSlider urls={descImageSrcs} />
                  </div>
                ) : (
                  <p className="material-register-form__rich-hint material-register__desc-images-empty">
                    본문에 이미지를 넣으면 이곳에서 미리보기·슬라이드로 확인할 수 있습니다.
                  </p>
                )}
              </label>

              <div className="reg-form__field material-register__optional-preview">
                <span className="reg-form__label-line">
                  <span className="reg-form__label-en">Sample preview file</span>
                  <span className="reg-form__label-ko">미리보기 파일</span>
                  <span className="material-register__optional-badge" title="필수 아님">
                    Optional
                  </span>
                </span>
                <p className="material-register-form__rich-hint">
                  샘플 PDF 등을 올리면 Firestore에 <code>previewUrl</code>이 저장되어, 승인 후 학습자 화면의「샘플 보기」등에
                  바로 연결하기 쉽습니다. 없어도 신청은 가능합니다.
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
                    <button type="button" className="btn btn--ghost material-register__thumb-clear" onClick={() => setPreviewSampleFile(null)}>
                      파일 제거
                    </button>
                  </div>
                ) : null}
              </div>

              <fieldset className="material-register-form__fieldset">
                <legend className="material-register-form__legend">
                  <span className="reg-form__label-en">File uploads</span>
                  <span className="reg-form__label-ko"> 파일 업로드</span>
                </legend>
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
                <div className="reg-form__field">
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
              </fieldset>

              <button type="submit" className="btn btn--primary btn--stack" disabled={saving}>
                <span className="ui-en">{saving ? "Submitting…" : "Submit request"}</span>
                <span className="ui-ko">{saving ? "제출 중…" : "신청 제출"}</span>
              </button>
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
