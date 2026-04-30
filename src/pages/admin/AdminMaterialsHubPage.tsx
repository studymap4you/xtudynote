import { Link } from "react-router-dom";
import { AdminTopNav } from "@/components/AdminTopNav";
import "@/pages/pages.css";

const MATERIAL_LINKS = [
  {
    to: "/admin/pending-materials",
    titleKo: "자료 검수 대기",
    titleEn: "Pending reviews",
    desc: "신규 교육자·자료 등록 검수",
  },
  {
    to: "/admin/contents",
    titleKo: "콘텐츠 DB 관리",
    titleEn: "Content database",
    desc: "승인된 라이브러리 항목",
  },
  {
    to: "/admin/landing-hero",
    titleKo: "홈 배경",
    titleEn: "Home background",
    desc: "랜딩 히어로·배경",
  },
  {
    to: "/admin/knowledge-curation",
    titleKo: "지식 큐레이션",
    titleEn: "Knowledge curation",
    desc: "검색·저장·학습자료",
  },
] as const;

export function AdminMaterialsHubPage() {
  return (
    <div className="app-shell app-shell--admin app-shell--light">
      <AdminTopNav />
      <main className="admin-layout admin-layout--light admin-materials-hub">
        <header className="admin-materials-hub__hero">
          <h1 className="admin-materials-hub__h1">전체 자료관리</h1>
          <p className="admin-materials-hub__lede ui-ko">
            자료 검수·콘텐츠 DB·홈 배경·지식 큐레이션으로 이동합니다. 상단「대시보드」에서도 같은 링크를 쓸 수
            있습니다.
          </p>
        </header>
        <ul className="admin-materials-hub__grid">
          {MATERIAL_LINKS.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className="admin-materials-hub__card">
                <span className="admin-materials-hub__card-en ui-en">{item.titleEn}</span>
                <span className="admin-materials-hub__card-ko">{item.titleKo}</span>
                <span className="admin-materials-hub__card-desc">{item.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
