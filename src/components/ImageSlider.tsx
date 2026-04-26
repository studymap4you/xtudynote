import { useState } from "react";
import { A11y, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "./image-slider.css";

export type ImageSliderLayout = "carousel" | "grid";

type Props = {
  urls: string[];
  defaultLayout?: ImageSliderLayout;
  className?: string;
};

/**
 * 상세 HTML 등에서 추출한 이미지 URL 목록을 슬라이드 또는 액자 그리드로 표시합니다.
 */
export function ImageSlider({ urls, defaultLayout = "carousel", className = "" }: Props) {
  const [layout, setLayout] = useState<ImageSliderLayout>(defaultLayout);

  if (!urls.length) return null;

  const wrapClass = ["image-slider-wrap", className].filter(Boolean).join(" ");

  return (
    <div className={wrapClass}>
      <div className="image-slider__toolbar" role="group" aria-label="이미지 보기 방식">
        <span className="image-slider__toolbar-label">이미지 보기</span>
        <button
          type="button"
          className={`image-slider__mode-btn ${layout === "carousel" ? "is-active" : ""}`}
          onClick={() => setLayout("carousel")}
        >
          슬라이드
        </button>
        <button
          type="button"
          className={`image-slider__mode-btn ${layout === "grid" ? "is-active" : ""}`}
          onClick={() => setLayout("grid")}
        >
          액자 그리드
        </button>
      </div>

      {layout === "grid" ? (
        <div className="image-slider image-slider--grid">
          {urls.map((src, i) => (
            <figure key={`${src}-${i}`} className="image-slider__frame">
              <img src={src} alt="" loading="lazy" decoding="async" />
            </figure>
          ))}
        </div>
      ) : (
        <div className="image-slider image-slider--carousel">
          <Swiper
            modules={[Navigation, Pagination, A11y]}
            navigation
            pagination={{ clickable: true }}
            spaceBetween={12}
            slidesPerView={1}
            speed={420}
            a11y={{ enabled: true }}
          >
            {urls.map((src, i) => (
              <SwiperSlide key={`${src}-${i}`}>
                <div className="image-slider__slide-inner">
                  <img src={src} alt="" loading="lazy" decoding="async" />
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      )}
    </div>
  );
}
