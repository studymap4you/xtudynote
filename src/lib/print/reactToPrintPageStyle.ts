/**
 * react-to-print `pageStyle` — 인쇄 iframe에 주입되어 A4·여백·색 재현을 맞춥니다.
 * 인쇄 대화상자 **여백은 「없음」**을 권장합니다. 그러면 @page margin: 0과 함께 iframe
 * `body`의 패딩 **25mm(상·하·좌·우 동일)** 만 콘텐츠 여백으로 들어갑니다.
 * 「기본」 여백을 쓰면 브라우저가 추가 여백을 넣어 이중으로 보일 수 있습니다.
 *
 * 대시보드 등 다크 `body` 배경이 스타일 복사로 iframe에 들어오면 미리보기가 남색으로만
 * 채워질 수 있어, html/body 배경을 흰색으로 명시합니다.
 * @see https://github.com/MatthewHerbst/react-to-print
 */
export const REACT_TO_PRINT_A4_PAGE_STYLE = `
  html,
  body {
    background: #ffffff !important;
    color: #0f172a !important;
    box-sizing: border-box !important;
  }
  @page {
    size: A4 portrait;
    margin: 0;
    @bottom-center {
      font-family: "Pretendard Variable", Pretendard, system-ui, sans-serif;
      font-size: 8.5pt;
      color: #64748b;
      content: "[Xtudy-Universe · 지식 큐레이터] | " counter(page);
    }
  }
  @media print {
    html {
      color-scheme: light !important;
    }
    html,
    body {
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      background: #ffffff !important;
      color: #0f172a !important;
      color-adjust: exact !important;
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
    }
    body {
      padding: 25mm !important;
    }
    .passage-deep-print p,
    .passage-deep-print li {
      orphans: 2;
      widows: 2;
    }
  }
`;

/**
 * 뉴스레터 빌더 — 서버 PDF 대신 브라우저 인쇄(PDF 저장)용
 * 부모 앱 `body`의 다크 배경(var(--bg-deep))이 스타일시트 복사로 iframe에 그대로 들어오므로
 * html/body를 밝게 강제하지 않으면 인쇄 미리보기가 남색으로만 채워질 수 있음.
 */
export const NEWSLETTER_PRINT_PAGE_STYLE = `
  * { box-sizing: border-box; }
  html,
  body {
    margin: 0;
    background: #ffffff !important;
    color: #0f172a !important;
    font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
  }
  .newsletter-print-root {
    max-width: 100%;
    font-size: 11pt;
    line-height: 1.55;
    color: #0c1222 !important;
    background: #ffffff !important;
    padding: 2mm 0 0;
  }
  .newsletter-print-root > header {
    background: linear-gradient(180deg, #ffffff 0%, #f0f7ff 100%);
    border: 1px solid #cbd5e1;
    padding: 0.65rem 0.85rem;
    margin: 0 0 1rem;
    border-radius: 10px;
  }
  .newsletter-print-root > header p {
    margin: 0;
    font-size: 8.5pt;
    color: #64748b !important;
  }
  .newsletter-print-root .brand {
    margin: 0 0 0.25rem;
    font-size: 8pt;
    color: #64748b !important;
  }
  .newsletter-print-root h1 {
    margin: 0 0 0.65rem;
    font-size: 16pt;
    font-weight: 800;
    line-height: 1.25;
    color: #0c1222 !important;
  }
  .newsletter-print-root .rule {
    height: 2px;
    background: #e2e8f0;
    margin: 0 0 1rem;
    border-radius: 1px;
  }
  .newsletter-print-root section {
    margin-bottom: 1rem;
    padding: 0.55rem 0.6rem 0.75rem;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
  }
  .newsletter-print-root h2 {
    margin: 0 0 0.45rem;
    font-size: 11.5pt;
    font-weight: 700;
    color: #1e40af !important;
    letter-spacing: -0.02em;
  }
  .newsletter-print-root .newsletter-print-imgwrap {
    margin: 0 0 0.55rem;
    max-width: 100%;
  }
  .newsletter-print-root img {
    display: block;
    max-width: 100% !important;
    height: auto !important;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }
  .newsletter-print-root .newsletter-print-flex-row {
    display: flex !important;
    flex-direction: row;
    align-items: flex-start;
    gap: 0.55rem;
    margin: 0 0 0.35rem;
  }
  .newsletter-print-root .newsletter-print-flex-row--rev {
    flex-direction: row-reverse;
  }
  .newsletter-print-root .newsletter-print-flex-row figure {
    flex-shrink: 0;
    margin: 0;
    min-width: 0;
  }
  .newsletter-print-body {
    margin: 0 !important;
    white-space: pre-wrap !important;
    color: #1e293b !important;
    font-size: 10pt !important;
    line-height: 1.65 !important;
  }
  .newsletter-print-root .printFoot {
    margin: 1.25rem 0 0;
    padding-top: 0.65rem;
    border-top: 1px solid #e2e8f0;
    font-size: 8pt;
    color: #94a3b8 !important;
    text-align: center;
  }
  @page {
    size: A4 portrait;
    margin: 0;
  }
  @media print {
    html,
    body {
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #0f172a !important;
      color-adjust: exact !important;
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
    }
    body {
      padding: 20mm 22mm !important;
    }
    .newsletter-print-root section {
      break-inside: avoid;
    }
    .newsletter-print-root h2 {
      break-after: avoid;
    }
    .newsletter-print-root img {
      page-break-inside: avoid;
    }
    /*
     * Chrome/Edge 인쇄·PDF 저장 시 flex row가 세로 스택으로 바뀌는 경우가 많아,
     * 미리보기(화면 flex)와 맞추려면 print에서는 float 기반 흐름이 안정적입니다.
     */
    .newsletter-print-root .newsletter-print-flex-row {
      display: block !important;
      width: 100% !important;
      overflow: visible !important;
    }
    .newsletter-print-root .newsletter-print-flex-row figure {
      float: left !important;
      max-width: 52% !important;
      margin: 0 10pt 8pt 0 !important;
      box-sizing: border-box !important;
    }
    .newsletter-print-root .newsletter-print-flex-row--rev figure {
      float: right !important;
      margin: 0 0 8pt 10pt !important;
    }
    .newsletter-print-root .newsletter-print-flex-row .newsletter-print-body {
      display: block !important;
      overflow: visible !important;
    }
    .newsletter-print-root .newsletter-print-flex-row::after {
      content: "" !important;
      display: table !important;
      clear: both !important;
    }
  }
`;
