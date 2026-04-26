export function buildWorksheetOutreachEmailHtml(opts: {
  assignmentTitle: string;
  teacherDisplayName: string;
  viewUrl: string;
}): string {
  const title = escapeHtml(opts.assignmentTitle);
  const teacher = escapeHtml(opts.teacherDisplayName);
  const url = escapeHtml(opts.viewUrl);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Xtudy-Universe — 과제 안내</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
          <tr>
            <td style="padding:22px 24px 12px;background:linear-gradient(180deg,#eff6ff 0%,#ffffff 100%);border-bottom:1px solid #e2e8f0;">
              <div style="font-size:20px;font-weight:800;letter-spacing:-0.03em;color:#0f172a;">
                <span style="color:#2563eb;">Xtudy</span>-Universe
              </div>
              <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:4px;letter-spacing:0.04em;">엑스터디 유니버스</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 8px;">
              <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#0f172a;">
                선생님이 보내신 <strong style="color:#1d4ed8;">「${title}」</strong> 분석 자료입니다.
              </p>
              <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#475569;">
                담당: <strong>${teacher}</strong><br />
                아래 버튼에서 학습지를 확인하고, 인쇄 또는 PDF로 저장할 수 있습니다. (별도 가입 없이 열람 가능)
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
                <tr>
                  <td style="border-radius:10px;background:linear-gradient(180deg,#3b82f6 0%,#2563eb 100%);">
                    <a href="${url}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                      학습지 열기 · PDF 안내
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;">
                링크는 기한 후 자동으로 만료될 수 있습니다. 문제가 있으면 선생님께 문의해 주세요.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;">
              © Xtudy-Universe · 본 메일은 학습 안내 목적으로 발송되었습니다.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
