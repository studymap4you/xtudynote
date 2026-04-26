/**
 * react-to-print `pageStyle` — 인쇄 iframe에 주입되어 A4·여백·색 재현을 맞춥니다.
 * 인쇄 대화상자에서 여백「없음」이어도 iframe body 안쪽 패딩으로 상·하 30mm·좌·우 25mm를 확보합니다.
 * @see https://github.com/MatthewHerbst/react-to-print
 */
export const REACT_TO_PRINT_A4_PAGE_STYLE = `
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
    html,
    body {
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      color-adjust: exact !important;
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
    }
    body {
      padding: 30mm 25mm 34mm !important;
    }
    .passage-deep-print p,
    .passage-deep-print li {
      orphans: 2;
      widows: 2;
    }
  }
`;
