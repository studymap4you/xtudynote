import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const DEFAULT_SITE_URL = "https://xtudynote.vercel.app";
export const SITE_URL = (import.meta.env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/u, "");

type RouteSeo = {
  title: string;
  description: string;
  canonicalPath: string;
  indexable: boolean;
};

const DEFAULT_DESCRIPTION =
  "Xtudy Universe는 AI 교재 자동제작, 영어 변형문제 생성, 수능형 영어 문제 제작 및 교육 콘텐츠 생성을 지원하는 AI Education Platform입니다.";

const PUBLIC_ROUTE_SEO: Record<string, Omit<RouteSeo, "canonicalPath" | "indexable">> = {
  "/": {
    title: "Xtudy Universe | AI 교재 자동제작 · 수능형 영어 문제 생성",
    description: DEFAULT_DESCRIPTION,
  },
  "/library": {
    title: "영어 교육 자료 라이브러리 | Xtudy Universe",
    description: "영어 문제은행, 수능 기출, 원문 소스와 교재 제작 자료를 확인하는 Xtudy Universe 교육 라이브러리입니다.",
  },
  "/high-school-exams": {
    title: "고등 영어 내신 자료 | Xtudy Universe",
    description: "고1·고2·고3 영어 모의고사, 수능특강, 수능완성 및 내신 부교재 자료를 확인할 수 있습니다.",
  },
  "/high-school-exams/grade1_mock": {
    title: "고1 영어 모의고사·변형문제 | Xtudy Universe",
    description: "고1 영어 모의고사와 문제은행 기반 영어 변형문제 교재를 확인할 수 있습니다.",
  },
  "/high-school-exams/grade2_mock": {
    title: "고2 영어 모의고사·변형문제 | Xtudy Universe",
    description: "고2 영어 모의고사와 문제은행 기반 영어 변형문제 교재를 확인할 수 있습니다.",
  },
  "/high-school-exams/grade3_mock": {
    title: "고3 영어 모의고사·변형문제 | Xtudy Universe",
    description: "고3 영어 모의고사와 수능 대비 영어 변형문제 교재를 확인할 수 있습니다.",
  },
  "/high-school-exams/high_school_csat": {
    title: "수능 영어 자료 | Xtudy Universe",
    description: "수능 영어 기출과 문제은행 자료를 확인하고 수능형 영어 문제 제작에 활용할 수 있습니다.",
  },
  "/high-school-exams/ebs_special_lecture": {
    title: "수능특강 영어 자료 | Xtudy Universe",
    description: "EBS 수능특강 영어 학습과 변형문제 제작에 활용할 수 있는 교육 자료를 확인합니다.",
  },
  "/high-school-exams/ebs_complete": {
    title: "수능완성 영어 자료 | Xtudy Universe",
    description: "EBS 수능완성 영어 학습과 수능 대비 교재 제작에 활용할 수 있는 자료를 확인합니다.",
  },
  "/high-school-exams/olympos": {
    title: "올림포스 영어 자료 | Xtudy Universe",
    description: "EBS 올림포스 영어 내신 학습과 변형문제 제작에 활용할 수 있는 자료를 확인합니다.",
  },
  "/high-school-exams/supplementary_archive": {
    title: "영어 내신 부교재 자료 | Xtudy Universe",
    description: "고등학교 영어 내신과 학원 수업에 활용할 수 있는 부교재 자료를 확인합니다.",
  },
  "/csat": {
    title: "수능 영어 기출·교재 자료 | Xtudy Universe",
    description: "수능 영어 기출문제와 연도별 자료를 확인하고 수능형 영어 문제 제작에 활용할 수 있습니다.",
  },
  "/csat/csat_2026": { title: "2026학년도 수능 영어 | Xtudy Universe", description: "2026학년도 수능 영어 문제와 정답 자료를 확인합니다." },
  "/csat/csat_2025": { title: "2025학년도 수능 영어 | Xtudy Universe", description: "2025학년도 수능 영어 문제와 정답 자료를 확인합니다." },
  "/csat/csat_2024": { title: "2024학년도 수능 영어 | Xtudy Universe", description: "2024학년도 수능 영어 문제와 정답 자료를 확인합니다." },
  "/csat/csat_2023": { title: "2023학년도 수능 영어 | Xtudy Universe", description: "2023학년도 수능 영어 문제와 정답 자료를 확인합니다." },
  "/csat/csat_2022": { title: "2022학년도 수능 영어 | Xtudy Universe", description: "2022학년도 수능 영어 문제와 정답 자료를 확인합니다." },
  "/csat/csat_archive": { title: "수능 영어 자료 모음 | Xtudy Universe", description: "연도별 수능 영어 문제와 학습 자료를 확인합니다." },
  "/classrooms": {
    title: "온라인 영어 강의실 | Xtudy Universe",
    description: "교사와 학생을 위한 온라인 강의실과 AI 기반 영어 학습 도구를 확인합니다.",
  },
  "/logic-dashboard": {
    title: "AI 영어 지문 분석 | Xtudy Universe",
    description: "영어 지문의 논리 구조를 분석하고 수능 독해 학습 자료로 구성하는 AI 영어 분석 도구입니다.",
  },
  "/videos": {
    title: "영어 교육 동영상 | Xtudy Universe",
    description: "영어 수업과 학습에 활용할 수 있는 교육 동영상을 확인합니다.",
  },
  "/digital-market": {
    title: "디지털 교육 자료 | Xtudy Universe",
    description: "수업과 학습에 활용할 수 있는 디지털 교육 자료를 확인합니다.",
  },
  "/xtudy-market": {
    title: "Xtudy 교육 마켓 | Xtudy Universe",
    description: "교사와 학습자를 위한 영어 교육 콘텐츠와 학습 자료를 확인합니다.",
  },
};

const PRIVATE_TITLES: Array<[prefix: string, title: string]> = [
  ["/tools/textbook-auto", "AI 교재 자동제작 | Xtudy Universe"],
  ["/login", "로그인 | Xtudy Universe"],
  ["/register", "회원가입 | Xtudy Universe"],
  ["/admin", "관리자 | Xtudy Universe"],
  ["/dashboard", "대시보드 | Xtudy Universe"],
  ["/billing", "구독 관리 | Xtudy Universe"],
];

function normalizedPath(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/u, "");
}

function seoForPath(pathname: string): RouteSeo {
  const path = normalizedPath(pathname);
  const publicSeo = PUBLIC_ROUTE_SEO[path];
  if (publicSeo) return { ...publicSeo, canonicalPath: path, indexable: true };
  const privateTitle = PRIVATE_TITLES.find(([prefix]) => path.startsWith(prefix))?.[1];
  return {
    title: privateTitle || "Xtudy Universe",
    description: DEFAULT_DESCRIPTION,
    canonicalPath: path,
    indexable: false,
  };
}

function setMeta(selector: string, attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

export function SeoController() {
  const { pathname } = useLocation();

  useEffect(() => {
    const seo = seoForPath(pathname);
    const canonical = new URL(seo.canonicalPath || "/", `${SITE_URL}/`).toString();
    const robots = seo.indexable
      ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
      : "noindex, nofollow";

    document.title = seo.title;
    document.documentElement.lang = "ko";
    setMeta('meta[name="description"]', "name", "description", seo.description);
    setMeta('meta[name="robots"]', "name", "robots", robots);
    setMeta('meta[property="og:site_name"]', "property", "og:site_name", "Xtudy Universe");
    setMeta('meta[property="og:title"]', "property", "og:title", seo.title);
    setMeta('meta[property="og:description"]', "property", "og:description", seo.description);
    setMeta('meta[property="og:url"]', "property", "og:url", canonical);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", seo.title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", seo.description);

    let canonicalLink = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.rel = "canonical";
      document.head.append(canonicalLink);
    }
    canonicalLink.href = canonical;
  }, [pathname]);

  return null;
}
