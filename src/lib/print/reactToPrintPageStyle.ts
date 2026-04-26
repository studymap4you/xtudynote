/**
 * react-to-print `pageStyle` — 인쇄 iframe에 주입되어 A4·여백·색 재현을 맞춥니다.
 * @see https://github.com/MatthewHerbst/react-to-print
 */
export const REACT_TO_PRINT_A4_PAGE_STYLE = `
  @page {
    size: A4 portrait;
    /* 상단은 페이지 넘김 시 본문이 천장에 붙는 느낌을 줄이기 위해 22mm 이상 */
    margin: 22mm 18mm 20mm 18mm;
    /* Firefox 등: @bottom-center가 지원되면 브랜드·페이지 번호가 여기 표시됩니다. Chromium은 대개 무시합니다. */
    @bottom-center {
      font-family: "Pretendard Variable", Pretendard, system-ui, sans-serif;
      font-size: 8.5pt;
      color: #64748b;
      content: "[XtudyNote - 지식 큐레이터 엑스플로어] | " counter(page);
    }
  }
  @media print {
    html,
    body {
      height: auto !important;
      color-adjust: exact !important;
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
    }
    .passage-deep-print p,
    .passage-deep-print li {
      orphans: 2;
      widows: 2;
    }
  }
`;
