import { FormEvent, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

type RoleParam = "teacher" | "student";

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get("role") as RoleParam | null;
  const { signUp, firebaseUser, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choice = useMemo(() => {
    if (roleParam === "teacher" || roleParam === "student") return roleParam;
    return null;
  }, [roleParam]);

  if (!choice) {
    return <Navigate to="/" replace />;
  }

  if (!loading && firebaseUser && profile) {
    return <Navigate to="/dashboard" replace />;
  }

  const hint =
    choice === "teacher" ? (
      <>
        <span className="ui-en" style={{ fontSize: "0.95rem", color: "var(--text-muted)" }}>
          Join as an educator. Content tools stay locked until your credentials are verified.
        </span>
        <span className="ui-ko">
          교육자(Teacher)로 가입합니다. 신원 검증 전까지 학습 자료 등록 기능은 제한됩니다.
        </span>
      </>
    ) : (
      <>
        <span className="ui-en" style={{ fontSize: "0.95rem", color: "var(--text-muted)" }}>
          Join as a learner — access feedback, logs, and shared materials.
        </span>
        <span className="ui-ko">
          학습자(Student)로 가입합니다. 피드백·로그·자료 중심의 학습 홈이 열립니다.
        </span>
      </>
    );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signUp(email, password, choice as RoleParam);
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Registration failed. 가입에 실패했습니다.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="top-nav">
        <Link to="/" className="top-nav__brand">
          XtudyNote
        </Link>
      </header>
      <main className="auth-page">
        <div className="auth-card">
          <h1>
            <span className="ui-en ui-en--lg">Create account</span>
            <span className="ui-ko">회원가입</span>
          </h1>
          <p className="auth-card__hint">{hint}</p>
          {error && <p className="auth-error">{error}</p>}
          <form onSubmit={onSubmit}>
            <div className="auth-field">
              <label htmlFor="reg-email">
                <span className="ui-en">Email</span>
                <span className="ui-ko">이메일</span>
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="reg-password">
                <span className="ui-en">Password (min. 6 characters)</span>
                <span className="ui-ko">비밀번호 (6자 이상)</span>
              </label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--stack auth-card__submit"
              disabled={busy}
            >
              {busy ? (
                <>
                  <span className="ui-en">Creating account…</span>
                  <span className="ui-ko">처리 중…</span>
                </>
              ) : (
                <>
                  <span className="ui-en">Sign up</span>
                  <span className="ui-ko">가입하기</span>
                </>
              )}
            </button>
          </form>
          <div className="auth-card__links">
            <Link to="/">
              <span className="ui-en">Choose role again</span>
              <span className="ui-ko">역할 다시 선택</span>
            </Link>
            <Link to="/login">
              <span className="ui-en">Log in</span>
              <span className="ui-ko">로그인</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
