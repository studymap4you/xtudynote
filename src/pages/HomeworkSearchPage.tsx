import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { parseHomeworkRouteParam } from "@/lib/homeworkCode";
import "@/pages/pages.css";

export function HomeworkSearchPage() {
  const nav = useNavigate();
  const [code, setCode] = useState("");

  function go(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseHomeworkRouteParam(code);
    if (!parsed) return;
    const segment = parsed.kind === "pin" ? parsed.pin : parsed.code;
    nav(`/homework/${encodeURIComponent(segment)}`);
  }

  return (
    <PublicShell>
      <main className="admin-layout homework-search admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>Homework by code</h1>
          <span className="ui-ko">
            4자리 숫자 또는 전체 코드(HW-…)로 열기 · 신규 등록 과제는 4자리만 안내해도 됩니다
          </span>
        </div>
        <form onSubmit={go} className="homework-search__form">
          <label className="auth-field">
            과제 번호 (4자리 숫자 또는 HW-… 전체)
            <input
              className="add-passage__control"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              placeholder="예: 4821 또는 HW-…"
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
