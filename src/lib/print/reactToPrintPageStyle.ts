/**
 * react-to-print `pageStyle` — 인쇄 iframe에 주입되어 A4·여백·색 재현을 맞춥니다.
 * Chromium 등에서 인쇄 대화상자 여백을「없음」으로 두면 @page margin 이 무시되는 경우가 많아,
 * body 패딩으로 상·하 30mm, 좌·우 25mm 이상의 안전 영역을 확보합니다.
 * @see https://github.com/MatthewHerbst/react-to-print
 */
export const REACT_TO_PRINT_A4_PAGE_STYLE = `
  @page {
    size: A4 portrait;
    margin: 0;
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
      margin: 0 !important;
      box-sizing: border-box !important;
      color-adjust: exact !important;
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
    }
    body {
      padding: 30mm 25mm 32mm !important;
    }
    .passage-deep-print p,
    .passage-deep-print li {
      orphans: 2;
      widows: 2;
    }
  }
`;
