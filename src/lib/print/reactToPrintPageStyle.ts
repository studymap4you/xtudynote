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
  html,
  body {
    background: #f8fafc !important;
    color: #0f172a !important;
    box-sizing: border-box !important;
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
      background: #f8fafc !important;
      color: #0f172a !important;
      box-sizing: border-box !important;
      color-adjust: exact !important;
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
    }
    body {
      padding: 22mm 24mm !important;
      font-family: "Pretendard Variable", Pretendard, system-ui, sans-serif;
    }
    .newsletter-print-root {
      background: transparent !important;
      color: #0f172a !important;
    }
    .newsletter-print-root section {
      break-inside: avoid;
    }
    .newsletter-print-root h2 {
      break-after: avoid;
    }
    .newsletter-print-root img {
      max-width: 100% !important;
      page-break-inside: avoid;
    }
  }
`;
