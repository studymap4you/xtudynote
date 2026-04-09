import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { FirebaseError } from "firebase/app";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

function GoogleMark() {
  return (
    <svg
      className="auth-google-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width="18"
      height="18"
      aria-hidden
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.178-5.238C29.211 35.091 26.715 36 24 36c-5.223 0-9.673-3.346-11.267-8H6.326v-.007C9.656 39.663 16.318 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.001-.001 6.179 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

function formatAuthError(err: unknown): string {
  if (err instanceof FirebaseError) {
    return `${err.message} [${err.code}]`;
  }
  return err instanceof Error ? err.message : "Sign-in failed. 로그인에 실패했습니다.";
}

export function LoginPage() {
  const { signIn, signInWithGoogle, firebaseUser, profile, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname;

  const authBusy = busy || googleBusy;

  if (!loading && firebaseUser && profile?.accountStatus === "active") {
    return <Navigate to={from && from !== "/login" ? from : "/dashboard"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogleSignIn() {
    setError(null);
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setGoogleBusy(false);
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
            <span className="ui-en ui-en--lg">Log in</span>
            <span className="ui-ko">로그인</span>
          </h1>
          <p className="auth-card__hint">
            <span className="ui-en" style={{ fontSize: "0.95rem", color: "var(--text-muted)" }}>
              Sign in with Google, or use your registered email and password.
            </span>
            <span className="ui-ko">
              구글로 로그인하거나, 등록한 이메일과 비밀번호로 로그인하세요.
            </span>
          </p>
          {error && <p className="auth-error">{error}</p>}
          <form onSubmit={onSubmit}>
            <div className="auth-field">
              <label htmlFor="email">
                <span className="ui-en">Email</span>
                <span className="ui-ko">이메일</span>
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={authBusy}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="password">
                <span className="ui-en">Password</span>
                <span className="ui-ko">비밀번호</span>
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={authBusy}
              />
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--stack auth-card__submit"
              disabled={authBusy}
            >
              {busy ? (
                <>
                  <span className="ui-en">Signing in…</span>
                  <span className="ui-ko">처리 중…</span>
                </>
              ) : (
                <>
                  <span className="ui-en">Log in</span>
                  <span className="ui-ko">로그인</span>
                </>
              )}
            </button>
          </form>
          <div className="auth-divider" role="separator" aria-label="Or">
            <span>Or</span>
          </div>
          <button
            type="button"
            className="btn btn--google"
            onClick={onGoogleSignIn}
            disabled={authBusy}
            aria-busy={googleBusy}
          >
            <GoogleMark />
            {googleBusy ? (
              <span className="btn--google__stack">
                <span className="ui-en">Signing in with Google…</span>
                <span className="ui-ko">구글 로그인 처리 중…</span>
              </span>
            ) : (
              <span className="btn--google__stack">
                <span className="ui-en">Sign in with Google</span>
                <span className="ui-ko">구글로 로그인</span>
              </span>
            )}
          </button>
          <p className="auth-card__link">
            <Link to="/">
              <span className="ui-en">Back to home</span>
              <span className="ui-ko">처음 화면으로</span>
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
