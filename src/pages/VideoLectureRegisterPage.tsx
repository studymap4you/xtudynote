import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { LearningThemeChecklist } from "@/components/LearningThemeChecklist";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { db, storage } from "@/firebase/config";
import type { ContentType } from "@/types/content";
import type { LearningThemeId } from "@/types/learningTheme";
import type { UserProfile } from "@/types/user";
import type { VideoMaterialRequestDocument } from "@/types/videoMaterialRequest";
import { getClassroomIfTeacher } from "@/lib/classroom";
import "@/pages/pages.css";

function resolveSubmitterRole(profile: UserProfile): VideoMaterialRequestDocument["submitterRole"] {
  if (profile.role === "super_admin") return "super_admin";
  if (profile.role === "teacher") return "teacher";
  return "student";
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function newUrlRow(): { id: string; value: string } {
  return { id: crypto.randomUUID(), value: "" };
}

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-가-힣]+/g, "_").slice(0, 180) || "file";
}

export function VideoLectureRegisterPage() {
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
  const [desiredPrice, setDesiredPrice] = useState("");
  const [homeworkInstruction, setHomeworkInstruction] = useState("");
  const [videoUrlRows, setVideoUrlRows] = useState(() => [newUrlRow()]);
  const [description, setDescription] = useState("");
  const [themes, setThemes] = useState<LearningThemeId[]>([]);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

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

    const urls = videoUrlRows.map((r) => r.value.trim()).filter(Boolean);
    if (!title.trim() || !subject.trim() || !audienceGrade.trim() || !description.trim()) {
      window.alert("제목·과목·학년·설명은 필수입니다.");
      return;
    }
    if (themes.length === 0) {
      window.alert("테마를 하나 이상 선택해 주세요.");
      return;
    }
    if (urls.length === 0) {
      window.alert("동영상 링크를 하나 이상 입력해 주세요.");
      return;
    }
    for (const u of urls) {
      if (!isHttpUrl(u)) {
        window.alert("동영상 링크는 http(s)로 시작하는 전체 URL을 입력해 주세요.");
        return;
      }
    }
    if (materialType === "paid" && (priceNum == null || priceNum < 0)) {
      window.alert("유료 강의는 희망 판매 가격(원)을 입력해 주세요.");
      return;
    }
    if (materialType === "paid" && !thumbnailFile) {
      window.alert("유료 강의는 썸네일 이미지를 업로드해 주세요.");
      return;
    }
    if (materialType === "homework" && !homeworkInstruction.trim()) {
      window.alert("과제 유형은 과제 주의사항·안내를 입력해 주세요.");
      return;
    }

    let classroomId: string | null = searchParams.get("classroomId")?.trim() || null;
    if (classroomId) {
      const ok = await getClassroomIfTeacher(classroomId, firebaseUser.uid);
      if (!ok) {
        window.alert("강의실을 찾을 수 없거나 이 강의실에 동영상을 연결할 권한이 없습니다.");
        return;
      }
    }

    setSaving(true);
    try {
      const reqRef = doc(collection(db, "video_material_requests"));
      const requestId = reqRef.id;
      const t0 = performance.now();
      const role = resolveSubmitterRole(profile);

      let thumbnailPendingPath: string | null = null;
      if (materialType === "paid" && thumbnailFile) {
        const path = `pending_materials/${firebaseUser.uid}/${requestId}/thumb_${Math.floor(t0)}_${safeFileName(thumbnailFile.name)}`;
        const sref = ref(storage, path);
        await uploadBytes(sref, thumbnailFile);
        thumbnailPendingPath = sref.fullPath;
      }

      await setDoc(reqRef, {
        submitterId: firebaseUser.uid,
        submitterRole: role,
        title: title.trim(),
        subject: subject.trim(),
        audienceGrade: audienceGrade.trim(),
        materialType,
        videoUrl: urls[0],
        videoUrls: urls,
        description: description.trim(),
        desiredPrice: materialType === "paid" ? priceNum : null,
        homeworkInstruction: materialType === "homework" ? homeworkInstruction.trim() : null,
        themes,
        ...(thumbnailPendingPath ? { thumbnailPendingPath } : {}),
        status: "pending",
        ...(classroomId ? { classroomId } : {}),
        createdAt: serverTimestamp(),
      });

      window.alert("동영상 학습자료 등록 신청이 접수되었습니다. 검수 후 안내드립니다.");
      setDone(true);
      setTitle("");
      setSubject("");
      setAudienceGrade("");
      setMaterialType("share");
      setDesiredPrice("");
      setHomeworkInstruction("");
      setVideoUrlRows([newUrlRow()]);
      setDescription("");
      setThemes([]);
      setThumbnailFile(null);
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
          <h1>동영상 강의 등록</h1>
          <span className="ui-ko material-register__subtitle-bi">
            <span className="reg-form__label-en" style={{ display: "block", fontWeight: 700 }}>
              Video lecture (link)
            </span>
            <span className="reg-form__label-ko" style={{ display: "block", marginTop: "0.25rem" }}>
              공개 재생 가능한 동영상 URL로 학습자료를 등록합니다
            </span>
          </span>
        </div>
        <p className="material-register__notice">
          <strong>YouTube·Vimeo 등</strong> 링크를 제출하면 검수 후 라이브러리에 반영됩니다.
        </p>

        {!firebaseUser && <p className="auth-error">로그인이 필요합니다.</p>}

        {profile?.role === "pending_teacher" && (
          <p className="auth-error">교육자 승인 완료 후 이용할 수 있습니다.</p>
        )}

        {canSubmit && (
          <section className="panel panel--light material-register-form material-register-form--student material-register-form--full">
            {done && (
              <p className="material-register__success" style={{ marginBottom: "1rem" }}>
                접수되었습니다. 감사합니다.
              </p>
            )}
            <form onSubmit={(e) => void handleSubmit(e)} className="material-register-form__grid">
              <label className="reg-form__field">
                <span className="reg-form__label-line">
                  <span className="reg-form__label-en">Title</span>
                  <span className="reg-form__label-ko">강의 제목</span>
                </span>
                <input
                  className="add-passage__control material-register-form__input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoComplete="off"
                  placeholder="예: 수능 미적분 핵심 정리"
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
                  placeholder="예: 고2, 성인"
                />
              </label>

              <fieldset className="material-register-form__fieldset">
                <legend className="material-register-form__legend">
                  <span className="reg-form__label-en">Lecture type</span>
                  <span className="reg-form__label-ko"> 강의 유형</span>
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
                        name="videoMaterialType"
                        value={v}
                        checked={materialType === v}
                        onChange={() => setMaterialType(v)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <LearningThemeChecklist value={themes} onChange={setThemes} disabled={saving} idPrefix="vid" />

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
                  <label className="reg-form__field">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Thumbnail image</span>
                      <span className="reg-form__label-ko">썸네일 이미지 (필수)</span>
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="add-passage__control add-passage__control--file"
                      onChange={(e) => setThumbnailFile(e.target.files?.[0] ?? null)}
                      required
                    />
                  </label>
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

              <div className="reg-form__field">
                <span className="reg-form__label-line">
                  <span className="reg-form__label-en">Video URL(s)</span>
                  <span className="reg-form__label-ko">동영상 링크 (필수, 복수 가능)</span>
                </span>
                <div className="material-register-form__multi-rows">
                  {videoUrlRows.map((row) => (
                    <div key={row.id} className="material-register-form__multi-row">
                      <input
                        className="add-passage__control material-register-form__input"
                        type="url"
                        inputMode="url"
                        value={row.value}
                        onChange={(e) => {
                          const v = e.target.value;
                          setVideoUrlRows((rows) =>
                            rows.map((r) => (r.id === row.id ? { ...r, value: v } : r))
                          );
                        }}
                        autoComplete="off"
                        placeholder="https://www.youtube.com/watch?v=… 또는 https://vimeo.com/…"
                      />
                      {videoUrlRows.length > 1 && (
                        <button
                          type="button"
                          className="btn btn--ghost material-register-form__row-btn"
                          onClick={() => setVideoUrlRows((rows) => rows.filter((r) => r.id !== row.id))}
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
                    onClick={() => setVideoUrlRows((rows) => [...rows, newUrlRow()])}
                  >
                    <span className="ui-en">+ Add video link</span>
                    <span className="ui-ko">+ 링크 추가</span>
                  </button>
                </div>
              </div>

              <label className="reg-form__field">
                <span className="reg-form__label-line">
                  <span className="reg-form__label-en">Description</span>
                  <span className="reg-form__label-ko">강의 소개·목차</span>
                </span>
                <textarea
                  className="add-passage__control add-passage__intro material-register-form__textarea"
                  rows={8}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  spellCheck
                  placeholder="학습자에게 보여질 요약, 단원 구성, 주의사항 등"
                />
              </label>

              <button type="submit" className="btn btn--primary btn--stack" disabled={saving}>
                <span className="ui-en">{saving ? "Submitting…" : "Submit"}</span>
                <span className="ui-ko">{saving ? "제출 중…" : "등록 신청"}</span>
              </button>
            </form>

            <p style={{ marginTop: "1.25rem" }}>
              <Link to="/material/register" className="material-register__text-link">
                일반 자료·파일 등록은 여기
              </Link>
            </p>
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
