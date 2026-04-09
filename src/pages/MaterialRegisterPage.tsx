import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { db, storage } from "@/firebase/config";
import type { ContentType } from "@/types/content";
import "@/pages/pages.css";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-가-힣]+/g, "_").slice(0, 180) || "file";
}

async function uploadPendingFiles(
  files: File[],
  studentId: string,
  requestId: string,
  kindPrefix: "lm" | "ref",
  uploadStarted: number
): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = `pending_materials/${studentId}/${requestId}/${kindPrefix}_${Math.floor(uploadStarted)}_${i}_${safeFileName(file.name)}`;
    const sref = ref(storage, path);
    await uploadBytes(sref, file);
    paths.push(sref.fullPath);
  }
  return paths;
}

export function MaterialRegisterPage() {
  const { firebaseUser, profile, canManageMaterials, isStudent, isSuperAdmin } = useAuth();
  const [materialType, setMaterialType] = useState<ContentType>("share");
  const [subject, setSubject] = useState("");
  const [audienceGrade, setAudienceGrade] = useState("");
  const [section, setSection] = useState("");
  const [description, setDescription] = useState("");
  const [desiredPrice, setDesiredPrice] = useState("");
  const [learningFiles, setLearningFiles] = useState<File[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const showPrice = materialType === "paid";

  const priceNum = useMemo(() => {
    const t = desiredPrice.trim();
    if (!t) return null;
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }, [desiredPrice]);

  async function submitStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;
    if (!subject.trim() || !audienceGrade.trim() || !section.trim() || !description.trim()) {
      window.alert("표준 분류와 자료 상세 설명을 모두 입력해 주세요.");
      return;
    }
    if (materialType === "paid" && (priceNum == null || priceNum < 0)) {
      window.alert("유료 자료는 희망 판매 가격(원)을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const reqRef = doc(collection(db, "material_requests"));
      const requestId = reqRef.id;
      const t0 = performance.now();
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

      await setDoc(reqRef, {
        studentId: firebaseUser.uid,
        materialType,
        subject: subject.trim(),
        audienceGrade: audienceGrade.trim(),
        section: section.trim(),
        description: description.trim(),
        desiredPrice: materialType === "paid" ? priceNum : null,
        learningMaterialFilePaths,
        referenceMaterialFilePaths,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      window.alert("신청이 접수되었습니다. 마스터의 검수 후 2~3일 내에 등록됩니다.");
      setDone(true);
      setSubject("");
      setAudienceGrade("");
      setSection("");
      setDescription("");
      setDesiredPrice("");
      setLearningFiles([]);
      setReferenceFiles([]);
      setMaterialType("share");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "제출에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell light>
      <main className="admin-layout material-register admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>자료 등록</h1>
          <span className="ui-ko">스터디맵 검수 후 라이브러리에 반영됩니다</span>
        </div>
        <p className="material-register__notice">
          마스터의 검수 후 <strong>2~3일 내에</strong> 등록됩니다.
        </p>

        {canManageMaterials && (
          <section className="panel panel--light material-register-form">
            <h2 className="panel__title">교육자 · 콘텐츠 담당</h2>
            <p style={{ color: "#4b5563" }}>
              과제 출제 또는 관리자 등록 절차로 이어집니다.
            </p>
            <div className="badge-row" style={{ flexWrap: "wrap", marginTop: "1rem" }}>
              <Link to="/teacher/homework/new" className="btn btn--primary btn--stack">
                <span className="ui-en">Homework</span>
                <span className="ui-ko">과제 출제</span>
              </Link>
              {isSuperAdmin && (
                <Link to="/admin/contents/new" className="btn btn--ghost btn--stack">
                  <span className="ui-en">Admin register</span>
                  <span className="ui-ko">관리자 등록</span>
                </Link>
              )}
            </div>
          </section>
        )}

        {isStudent && (
          <section className="panel panel--light material-register-form material-register-form--student">
            <div className="material-register-form__head">
              <h2 className="panel__title">자료 등록 신청</h2>
              <p className="material-register-form__sub">
                <span className="reg-form__label-en" style={{ display: "block", fontWeight: 700 }}>
                  Material registration request
                </span>
                <span className="reg-form__label-ko" style={{ display: "block", marginTop: "0.25rem" }}>
                  검수 후 공개·판매 연동
                </span>
              </p>
            </div>
            {done && (
              <p style={{ color: "#047857", marginBottom: "1rem" }}>접수되었습니다. 감사합니다.</p>
            )}
            <form onSubmit={(e) => void submitStudent(e)} className="material-register-form__grid">
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

              <fieldset className="material-register-form__fieldset">
                <legend className="material-register-form__legend">
                  <span className="reg-form__label-en">Standard classification</span>
                  <span className="reg-form__label-ko"> 표준 분류</span>
                </legend>
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
                    <span className="reg-form__label-en">Target grade / audience</span>
                    <span className="reg-form__label-ko">대상 학년·독자</span>
                  </span>
                  <input
                    className="add-passage__control material-register-form__input"
                    value={audienceGrade}
                    onChange={(e) => setAudienceGrade(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </label>
                <label className="reg-form__field">
                  <span className="reg-form__label-line">
                    <span className="reg-form__label-en">Unit / section</span>
                    <span className="reg-form__label-ko">단원·섹션</span>
                  </span>
                  <input
                    className="add-passage__control material-register-form__input"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </label>
              </fieldset>

              {showPrice && (
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
                    required={showPrice}
                  />
                </label>
              )}

              <label className="reg-form__field">
                <span className="reg-form__label-line">
                  <span className="reg-form__label-en">Detailed description</span>
                  <span className="reg-form__label-ko">자료 상세 설명</span>
                </span>
                <textarea
                  className="add-passage__control add-passage__intro material-register-form__textarea"
                  rows={10}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  spellCheck
                />
              </label>

              <fieldset className="material-register-form__fieldset">
                <legend className="material-register-form__legend">
                  <span className="reg-form__label-en">File uploads</span>
                  <span className="reg-form__label-ko"> 파일 업로드</span>
                </legend>
                <label className="reg-form__field">
                  <span className="reg-form__label-line">
                    <span className="reg-form__label-en">Primary learning files</span>
                    <span className="reg-form__label-ko">학습용 주 자료</span>
                  </span>
                  <input
                    type="file"
                    multiple
                    className="add-passage__control add-passage__control--file"
                    onChange={(ev) => {
                      const list = ev.target.files;
                      setLearningFiles(list ? Array.from(list) : []);
                    }}
                  />
                </label>
                <label className="reg-form__field">
                  <span className="reg-form__label-line">
                    <span className="reg-form__label-en">Answer key / reference</span>
                    <span className="reg-form__label-ko">해설·참고 자료</span>
                  </span>
                  <input
                    type="file"
                    multiple
                    className="add-passage__control add-passage__control--file"
                    onChange={(ev) => {
                      const list = ev.target.files;
                      setReferenceFiles(list ? Array.from(list) : []);
                    }}
                  />
                </label>
              </fieldset>

              <button type="submit" className="btn btn--primary btn--stack" disabled={saving}>
                <span className="ui-en">{saving ? "Submitting…" : "Submit request"}</span>
                <span className="ui-ko">{saving ? "제출 중…" : "신청 제출"}</span>
              </button>
            </form>
          </section>
        )}

        {!canManageMaterials && !isStudent && profile && (
          <p className="auth-error">이 페이지는 학생 또는 교육자 계정에서 이용할 수 있습니다.</p>
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
