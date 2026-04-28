import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { LearningThemeChecklist } from "@/components/LearningThemeChecklist";
import { RichTextEditor } from "@/components/RichTextEditor";
import { isEmptyRichText } from "@/lib/richTextUtils";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { db, storage } from "@/firebase/config";
import { publishEducationalClassroomVideoMaterial } from "@/lib/adminMaterialRequestPublish";
import type { ContentType } from "@/types/content";
import type { LearningThemeId } from "@/types/learningTheme";
import type { ClassroomDocument } from "@/types/classroom";
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
  const { firebaseUser, profile, canManageMaterials, isStudent, isSuperAdmin, isTeacherApproved } =
    useAuth();
  const [searchParams] = useSearchParams();
  const classroomIdFromQuery = searchParams.get("classroomId")?.trim() ?? "";
  const isClassroomTeacherFlow = isTeacherApproved && !!classroomIdFromQuery;

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
  const [isEducationalInstantPublish, setIsEducationalInstantPublish] = useState(false);

  useEffect(() => {
    if (classroomIdFromQuery) setThemes([]);
  }, [classroomIdFromQuery]);

  useEffect(() => {
    if (isClassroomTeacherFlow && materialType === "paid") {
      setMaterialType("share");
    }
  }, [isClassroomTeacherFlow, materialType]);

  const showPrice = materialType === "paid" && !isClassroomTeacherFlow;
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
    if (!title.trim() || !subject.trim() || !audienceGrade.trim() || isEmptyRichText(description)) {
      window.alert("제목·과목·학년·설명은 필수입니다.");
      return;
    }
    if (!classroomIdFromQuery && themes.length === 0) {
      window.alert("테마를 하나 이상 선택해 주세요. (라이브러리 분류에 사용됩니다.)");
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
    if (!isClassroomTeacherFlow && materialType === "paid" && (priceNum == null || priceNum < 0)) {
      window.alert("유료 강의는 희망 판매 가격(원)을 입력해 주세요.");
      return;
    }
    if (!isClassroomTeacherFlow && materialType === "paid" && !thumbnailFile) {
      window.alert("유료 강의는 썸네일 이미지를 업로드해 주세요.");
      return;
    }
    if (isClassroomTeacherFlow && materialType === "paid") {
      window.alert("강의실 동영상 등록에서는 유료 유형을 사용할 수 없습니다. 공유 또는 과제를 선택해 주세요.");
      return;
    }
    if (materialType === "homework" && !homeworkInstruction.trim()) {
      window.alert("과제 유형은 과제 주의사항·안내를 입력해 주세요.");
      return;
    }

    let classroomId: string | null = searchParams.get("classroomId")?.trim() || null;
    let classroomDoc: ClassroomDocument | null = null;
    if (classroomId) {
      classroomDoc = await getClassroomIfTeacher(classroomId, firebaseUser.uid);
      if (!classroomDoc) {
        window.alert("강의실을 찾을 수 없거나 이 강의실에 동영상을 연결할 권한이 없습니다.");
        return;
      }
    }

    const themesForSubmit = classroomIdFromQuery ? [] : themes;

    setSaving(true);
    try {
      if (
        isEducationalInstantPublish &&
        isClassroomTeacherFlow &&
        classroomId &&
        classroomDoc &&
        (materialType === "share" || materialType === "homework")
      ) {
        await publishEducationalClassroomVideoMaterial(db, {
          authorId: firebaseUser.uid,
          classroomId,
          classroomTitle: (classroomDoc.title ?? "").trim() || null,
          materialType,
          title: title.trim(),
          subject: subject.trim(),
          audienceGrade: audienceGrade.trim(),
          descriptionHtml: description.trim(),
          urls,
          homeworkInstruction: materialType === "homework" ? homeworkInstruction.trim() : null,
          thumbnailPendingPath: null,
        });
        window.alert(
          "교육용 자료로 등록되었습니다. 강의실·라이브러리에서 바로 이용할 수 있습니다. 운영 정책에 맞지 않는 경우 관리자가 삭제할 수 있습니다.",
        );
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
        setIsEducationalInstantPublish(false);
        setSaving(false);
        return;
      }

      const reqRef = doc(collection(db, "video_material_requests"));
      const requestId = reqRef.id;
      const t0 = performance.now();
      const role = resolveSubmitterRole(profile);

      let thumbnailPendingPath: string | null = null;
      if (!isClassroomTeacherFlow && materialType === "paid" && thumbnailFile) {
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
        themes: themesForSubmit,
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
      <main className="admin-layout admin-layout--light material-register classroom-hub classroom-hub--manage video-register-page">
        <div className="classroom-hub__shell">
          <div className="classroom-hub__hero-card">
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
          </div>

          <div className="classroom-hub__callout classroom-hub__callout--info video-register-page__notice">
            <strong>YouTube·Vimeo 등</strong> 링크를 제출하면{" "}
            {classroomIdFromQuery
              ? "강의실에서「교육용 자료」로 체크한 경우 즉시 반영되며, 그렇지 않으면 검수 후 안내드립니다."
              : "검수 후 라이브러리에 반영됩니다."}
          </div>

          {!firebaseUser && <p className="auth-error">로그인이 필요합니다.</p>}

          {profile?.role === "pending_teacher" && (
            <p className="auth-error">교육자 승인 완료 후 이용할 수 있습니다.</p>
          )}

          {canSubmit && (
            <div className="classroom-hub__panel classroom-hub__panel--manage video-register-page__panel">
              {done ? (
                <p className="material-register__success video-register-page__success">접수되었습니다. 감사합니다.</p>
              ) : null}
              <form
                onSubmit={(e) => void handleSubmit(e)}
                className="video-register-page__form material-register-form__grid"
              >
                <div className="classroom-hub__card">
                  <h3 className="classroom-hub__card-title">강의 기본 정보</h3>
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
                </div>

                <div className="classroom-hub__card classroom-hub__card--soft">
                  <h3 className="classroom-hub__card-title">유형 · 분류</h3>
                  <fieldset className="material-register-form__fieldset video-register-page__fieldset">
                    <legend className="material-register-form__legend">
                      <span className="reg-form__label-en">Lecture type</span>
                      <span className="reg-form__label-ko"> 강의 유형</span>
                    </legend>
                    <div className="material-register-form__radio-row">
                      {(isClassroomTeacherFlow
                        ? [
                            ["share", "Share · 공유"],
                            ["homework", "Homework · 과제"],
                          ] as const
                        : (
                            [
                              ["share", "Share · 공유"],
                              ["paid", "Paid · 유료"],
                              ["homework", "Homework · 과제"],
                            ] as const
                          )
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

                  {isClassroomTeacherFlow ? (
                    <div className="material-register__educational-ack video-register-page__educational">
                      <label className="material-register__educational-label">
                        <input
                          type="checkbox"
                          checked={isEducationalInstantPublish}
                          onChange={(e) => setIsEducationalInstantPublish(e.target.checked)}
                        />
                        <span>
                          <strong className="material-register__educational-strong">교육용 자료입니다.</strong>{" "}
                          체크 시 마스터 검수 없이 승인된 콘텐츠로 즉시 공개됩니다. 허위·불법·정책 위반 자료는
                          관리자가 <strong>언제든지 삭제</strong>할 수 있습니다.
                        </span>
                      </label>
                    </div>
                  ) : null}

                  {!classroomIdFromQuery ? (
                    <div className="video-register-page__themes">
                      <LearningThemeChecklist value={themes} onChange={setThemes} disabled={saving} idPrefix="vid" />
                    </div>
                  ) : null}
                </div>

                {showPrice ? (
                  <div className="classroom-hub__card">
                    <h3 className="classroom-hub__card-title">유료 강의 설정</h3>
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
                        className="add-passage__control add-passage__control--file video-register-page__file"
                        onChange={(e) => setThumbnailFile(e.target.files?.[0] ?? null)}
                        required
                      />
                    </label>
                  </div>
                ) : null}

                {showHomeworkNotes ? (
                  <div className="classroom-hub__card">
                    <h3 className="classroom-hub__card-title">과제 안내</h3>
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
                  </div>
                ) : null}

                <div className="classroom-hub__card">
                  <h3 className="classroom-hub__card-title">동영상 링크</h3>
                  <div className="reg-form__field">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Video URL(s)</span>
                      <span className="reg-form__label-ko">동영상 링크 (필수, 복수 가능)</span>
                    </span>
                    <div className="material-register-form__multi-rows">
                      {videoUrlRows.map((row) => (
                        <div key={row.id} className="material-register-form__multi-row video-register-page__url-row">
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
                          {videoUrlRows.length > 1 ? (
                            <button
                              type="button"
                              className="btn btn--ghost material-register-form__row-btn video-register-page__row-btn"
                              onClick={() => setVideoUrlRows((rows) => rows.filter((r) => r.id !== row.id))}
                            >
                              <span className="ui-en">Remove</span>
                              <span className="ui-ko">삭제</span>
                            </button>
                          ) : null}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn btn--ghost material-register-form__add-row-btn video-register-page__add-url"
                        onClick={() => setVideoUrlRows((rows) => [...rows, newUrlRow()])}
                      >
                        <span className="ui-en">+ Add video link</span>
                        <span className="ui-ko">+ 링크 추가</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="classroom-hub__card">
                  <h3 className="classroom-hub__card-title">강의 소개·목차</h3>
                  <div className="reg-form__field material-register-form__field-rich">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Description</span>
                      <span className="reg-form__label-ko">상세 설명</span>
                    </span>
                    <p className="material-register-form__rich-hint">서식·링크·이미지 삽입 가능합니다.</p>
                    <RichTextEditor
                      value={description}
                      onChange={setDescription}
                      userId={firebaseUser?.uid}
                      placeholder="학습자에게 보여질 요약, 단원 구성, 주의사항 등"
                    />
                  </div>
                </div>

                <div className="classroom-hub__card classroom-hub__card--actions">
                  <button type="submit" className="btn btn--primary btn--stack video-register-page__submit" disabled={saving}>
                    <span className="ui-en">{saving ? "Submitting…" : "Submit"}</span>
                    <span className="ui-ko">{saving ? "제출 중…" : "등록 신청"}</span>
                  </button>
                </div>
              </form>

              <div className="video-register-page__footer">
                <Link to="/material/register" className="material-register__text-link">
                  일반 자료·파일 등록은 여기
                </Link>
              </div>
            </div>
          )}

          {!canSubmit && firebaseUser && profile && profile.role !== "pending_teacher" ? (
            <p className="auth-error">이 페이지는 학생 또는 승인된 교육자·관리자 계정에서 이용할 수 있습니다.</p>
          ) : null}

          <div className="video-register-page__back">
            <Link to="/dashboard" className="btn btn--ghost btn--stack">
              ← 대시보드
            </Link>
          </div>
        </div>
      </main>
    </DashboardShell>
  );
}
