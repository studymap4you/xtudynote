import { Link } from "react-router-dom";
import "@/pages/pages.css";

export function SuperAdminDashboard() {
  return (
    <main className="dashboard">
      <div className="dashboard__title-wrap">
        <h1 className="dashboard__title">Super Admin</h1>
        <span className="ui-ko">슈퍼 관리자</span>
      </div>
      <p className="dashboard__subtitle">
        <span className="ui-en">
          Manage every account, review pending educators, and keep the learning ecosystem trusted.
        </span>
        <span className="ui-ko">
          학습 자료는 콘텐츠 DB 관리, 계정·승인은 회원 관리에서 다룹니다.
        </span>
      </p>
      <div className="dashboard-grid dashboard-grid--student">
        <section className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Operations console</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                운영 콘솔
              </span>
            </div>
            <span className="panel__badge panel__badge--ok">Super Admin</span>
          </div>
          <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
            <span className="ui-en">
              User directory, document review, approve or suspend — all in one view.
            </span>
            <span className="ui-ko" style={{ display: "block", marginTop: "0.4rem" }}>
              유저 목록·서류 검토·승인·추방을 한 화면에서 처리합니다.
            </span>
          </p>
          <Link to="/admin/pending-materials" className="btn btn--primary btn--stack">
            <span className="ui-en">Review pending registrations</span>
            <span className="ui-ko">자료 등록 검수 대기 열기</span>
          </Link>
          <Link
            to="/admin/contents"
            className="btn btn--ghost btn--stack"
            style={{ marginTop: "0.65rem" }}
          >
            <span className="ui-en">Content database (approved items)</span>
            <span className="ui-ko">콘텐츠 DB 관리</span>
          </Link>
          <Link
            to="/admin/knowledge-curation"
            className="btn btn--ghost btn--stack"
            style={{ marginTop: "0.65rem" }}
          >
            <span className="ui-en">Knowledge curation</span>
            <span className="ui-ko">지식 큐레이션 · 검색·저장·학습자료</span>
          </Link>
        </section>
        <section className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Security note</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                보안 참고
              </span>
            </div>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: 0 }}>
            <span className="ui-en">
              Firestore and Storage rules enforce roles and file access on the server. Deploy them
              with the Firebase CLI.
            </span>
            <span className="ui-ko" style={{ display: "block", marginTop: "0.4rem" }}>
              Firestore·Storage 규칙으로 역할·서류 접근이 서버에서 제한됩니다. Firebase CLI로 배포하세요.
            </span>
          </p>
        </section>
      </div>
    </main>
  );
}
