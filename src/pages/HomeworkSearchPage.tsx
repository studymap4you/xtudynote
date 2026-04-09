import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { normalizeHomeworkCode } from "@/lib/homeworkCode";
import "@/pages/pages.css";

export function HomeworkSearchPage() {
  const nav = useNavigate();
  const [code, setCode] = useState("");

  function go(e: React.FormEvent) {
    e.preventDefault();
    const n = normalizeHomeworkCode(code);
    if (!n) return;
    nav(`/homework/${encodeURIComponent(n)}`);
  }

  return (
    <PublicShell>
      <main className="admin-layout homework-search">
        <div className="admin-layout__title-row">
          <h1>Homework by code</h1>
          <span className="ui-ko">과제 번호로만 조회됩니다 · 일반 라이브러리 목록에는 표시되지 않습니다</span>
        </div>
        <form onSubmit={go} className="homework-search__form">
          <label className="auth-field">
            과제 번호 (예: HW-AB12CD34)
            <input
              className="add-passage__control"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              placeholder="HW-..."
            />
          </label>
          <button type="submit" className="btn btn--primary btn--stack">
            <span className="ui-en">Open</span>
            <span className="ui-ko">열기</span>
          </button>
        </form>
      </main>
    </PublicShell>
  );
}
