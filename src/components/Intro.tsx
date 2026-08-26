import { BookOpenCheck, School } from "lucide-react";
import { Link } from "react-router-dom";
import { BrandLockup } from "@/components/BrandLockup";
import { useAuth } from "@/contexts/AuthContext";
import {
  BRAND_HERO_SUBLINE_1,
  BRAND_HERO_SUBLINE_2,
  BRAND_HERO_DESCRIPTION_EN,
  BRAND_HERO_TITLE,
} from "@/lib/brand";

export function Intro() {
  const { firebaseUser } = useAuth();
  const classroomTarget = firebaseUser ? "/classroom" : "/login";
  const textbookTarget = firebaseUser ? "/tools/textbook-auto" : "/login";

  return (
    <section className="intro-hero intro-hero--simple" aria-labelledby="intro-slogan">
      <div className="intro-hero__grid intro-hero__grid--simple">
        <div className="intro-hero__copy intro-hero__copy--fade">
          <div className="intro-hero__main-card intro-hero__main-card--simple">
            <div className="intro-hero__main-card-cap">
              <p className="intro-hero__brand">
                <BrandLockup />
              </p>
              <h1 id="intro-slogan" className="intro-hero__slogan intro-hero__slogan--universe">
                <span className="intro-hero__slogan-line intro-hero__slogan-line--final">
                  {BRAND_HERO_TITLE}
                </span>
              </h1>
            </div>

            <div className="intro-hero__main-card-body intro-hero__main-card-body--simple">
              <div className="intro-hero__subdeck">
                <p className="intro-hero__lede intro-hero__lede--universe">{BRAND_HERO_SUBLINE_1}</p>
                <p className="intro-hero__lede intro-hero__lede--universe intro-hero__lede--second">
                  {BRAND_HERO_SUBLINE_2}
                </p>
                <p className="intro-hero__lede intro-hero__lede--english" lang="en">
                  {BRAND_HERO_DESCRIPTION_EN}
                </p>
              </div>

              <nav className="intro-hero__action-stack intro-hero__action-stack--simple" aria-label="시작 메뉴">
                <div className="intro-hero__action-grid intro-hero__action-grid--landing intro-hero__action-grid--simple">
                  <Link
                    to={classroomTarget}
                    state={!firebaseUser ? { from: { pathname: "/classroom" } } : undefined}
                    className="intro-landing-tile intro-landing-tile--classroom-enter intro-landing-tile--primary-simple"
                  >
                    <span className="intro-landing-tile__inner">
                      <span className="intro-landing-tile__badge" aria-hidden="true">
                        <School size={25} />
                      </span>
                      <h2 className="intro-landing-tile__title">내 강의실</h2>
                      <span className="intro-landing-tile__subtitle">강의와 모든 학습 도구</span>
                    </span>
                  </Link>

                  <Link
                    to={textbookTarget}
                    state={!firebaseUser ? { from: { pathname: "/tools/textbook-auto" } } : undefined}
                    className="intro-landing-tile intro-landing-tile--textbook intro-landing-tile--primary-simple"
                  >
                    <span className="intro-landing-tile__inner">
                      <span className="intro-landing-tile__badge" aria-hidden="true">
                        <BookOpenCheck size={25} />
                      </span>
                      <h2 className="intro-landing-tile__title">교재 자동제작</h2>
                      <span className="intro-landing-tile__subtitle">AI로 완성하는 수업 교재</span>
                    </span>
                  </Link>
                </div>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
