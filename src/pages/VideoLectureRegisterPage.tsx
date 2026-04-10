import { useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { db } from "@/firebase/config";
import type { UserProfile } from "@/types/user";
import type { VideoMaterialRequestDocument } from "@/types/videoMaterialRequest";
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

export function VideoLectureRegisterPage() {
  const { firebaseUser, profile, canManageMaterials, isStudent, isSuperAdmin } = useAuth();

  const canSubmit =
    !!profile &&
    (isStudent || canManageMaterials || isSuperAdmin) &&
    profile.role !== "pending_teacher";

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [audienceGrade, setAudienceGrade] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !profile || !canSubmit) return;

    const urlTrim = videoUrl.trim();
    if (!title.trim() || !subject.trim() || !audienceGrade.trim() || !description.trim()) {
      window.alert("제목·과목·학년·설명은 필수입니다.");
      return;
    }
    if (!isHttpUrl(urlTrim)) {
      window.alert("동영상 링크는 http(s)로 시작하는 전체 URL을 입력해 주세요.");
      return;
    }

    setSaving(true);
    try {
      const reqRef = doc(collection(db, "video_material_requests"));
      const role = resolveSubmitterRole(profile);

      await setDoc(reqRef, {
        submitterId: firebaseUser.uid,
        submitterRole: role,
        title: title.trim(),
        subject: subject.trim(),
        audienceGrade: audienceGrade.trim(),
        videoUrl: urlTrim,
        description: description.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });

      window.alert("동영상 학습자료 등록 신청이 접수되었습니다. 검수 후 안내드립니다.");
      setDone(true);
      setTitle("");
      setSubject("");
      setAudienceGrade("");
      setVideoUrl("");
      setDescription("");
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

              <label className="reg-form__field">
                <span className="reg-form__label-line">
                  <span className="reg-form__label-en">Video URL</span>
                  <span className="reg-form__label-ko">동영상 링크 (필수)</span>
                </span>
                <input
                  className="add-passage__control material-register-form__input"
                  type="url"
                  inputMode="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  required
                  autoComplete="off"
                  placeholder="https://www.youtube.com/watch?v=… 또는 https://vimeo.com/…"
                />
              </label>

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
