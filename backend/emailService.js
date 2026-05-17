const { Resend } = require('resend');

let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/**
 * @param {Array<{jobTitle: string, company: string, matchScore: number, applyUrl: string}>} applications
 * @returns {{ subject: string, html: string }}
 */
function buildNotificationEmail(applications) {
  const count = applications.length;
  const subject = `TalonMatch — ${count} job${count !== 1 ? 's' : ''} ready to apply`;

  const rows = applications.map(app => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #E8E4D8;">
        <div style="font-family:'Georgia',serif;font-size:15px;font-weight:600;color:#27302A;">
          ${escHtml(app.jobTitle)}
        </div>
        <div style="font-family:'Courier New',monospace;font-size:12px;color:#6E776F;margin-top:2px;">
          ${escHtml(app.company)}
          &nbsp;·&nbsp;
          <span style="color:#5A7A4E;font-weight:700;">${app.matchScore}% match</span>
        </div>
      </td>
      <td style="padding:14px 0 14px 16px;border-bottom:1px solid #E8E4D8;text-align:right;vertical-align:middle;">
        <a href="${escHtml(app.applyUrl)}"
           style="display:inline-block;background:#A85E3E;color:#F7F4EC;font-family:'Courier New',monospace;
                  font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;
                  text-decoration:none;padding:7px 16px;">
          Apply →
        </a>
      </td>
    </tr>`).join('');

  const html = `<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F4EC;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EC;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#F7F4EC;max-width:560px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="border-bottom:2px solid #A85E3E;padding-bottom:16px;margin-bottom:24px;">
            <span style="font-family:'Georgia',serif;font-size:22px;font-weight:700;color:#27302A;">
              Talon<span style="color:#A85E3E;">Match</span>
            </span>
            <span style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:0.3em;
                         color:#6E776F;text-transform:uppercase;display:block;margin-top:4px;">
              Autosend Protocol — Strike Report
            </span>
          </td>
        </tr>
        <!-- Intro -->
        <tr>
          <td style="padding:24px 0 8px;">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:12px;
                      letter-spacing:0.1em;color:#6E776F;text-transform:uppercase;">
              ${count} position${count !== 1 ? 's' : ''} cleared the gate
            </p>
          </td>
        </tr>
        <!-- Jobs table -->
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${rows}
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 0 0;">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:10px;
                      letter-spacing:0.1em;color:#9DA29B;text-transform:uppercase;">
              Sent by TalonMatch Autosend · Resume tailored and ready
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{ to: string, applications: Array<{jobTitle:string,company:string,matchScore:number,applyUrl:string}> }} params
 */
async function sendNotification({ to, applications }) {
  const { subject, html } = buildNotificationEmail(applications);
  await getResend().emails.send({
    from:    'TalonMatch <onboarding@resend.dev>',
    to,
    subject,
    html,
  });
}

module.exports = { buildNotificationEmail, sendNotification };
