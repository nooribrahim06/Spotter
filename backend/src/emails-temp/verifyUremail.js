import { env } from "../config/env.js";

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) => HTML_ESCAPES[character]
  );
}

export function createVerifyEmail(username, verifyToken) {
    const safeUsername = escapeHtml(username);
    const verificationUrl = `${env.FRONTEND_URL.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(verifyToken)}`;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Verify your Spotter email</title>
</head>
<body style="margin:0;padding:0;background:#F7F6F2;font-family:Arial,Helvetica,sans-serif;color:#172526;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Verify your email and start your Spotter journey.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F7F6F2;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
               style="max-width:600px;background:#FFFFFF;border-radius:24px;overflow:hidden;border:1px solid #E6ECE9;">

          <!-- Brand -->
          <tr>
            <td align="center" style="padding:30px 32px 12px;">
              <div style="font-size:26px;line-height:1;font-weight:800;letter-spacing:-0.8px;color:#193B3D;">
                SPOTTER
              </div>
              <div style="width:36px;height:4px;background:#F0785E;border-radius:99px;margin:10px auto 0;"></div>
            </td>
          </tr>

          <!-- Mascot -->
          <tr>
            <td align="center" style="padding:4px 28px 0;">
              <img
                src="cid:spotter-verification-mascot"
                width="280"
                alt="Spotter mascot cheering you on"
                style="display:block;width:280px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;"
              >
            </td>
          </tr>

          <!-- Main copy -->
          <tr>
            <td align="center" style="padding:4px 42px 0;">
              <div style="display:inline-block;padding:7px 12px;background:#E6F0F3;border-radius:999px;color:#4F8485;
                          font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;">
                One quick step
              </div>

              <h1 style="margin:18px 0 12px;font-size:34px;line-height:40px;letter-spacing:-1.1px;color:#193B3D;">
                Verify your email
              </h1>

              <p style="margin:0 auto;max-width:470px;font-size:16px;line-height:25px;color:#667575;">
                Hey ${safeUsername}, you’re almost in. Confirm this email address so we can finish setting up your Spotter account.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:28px 32px 12px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" bgcolor="#F0785E" style="border-radius:999px;">
                    <a href="${verificationUrl}"
                       style="display:inline-block;padding:15px 28px;color:#FFFFFF;text-decoration:none;
                              font-size:16px;line-height:20px;font-weight:700;border-radius:999px;">
                      Verify my email →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Expiry/security note -->
          <tr>
            <td align="center" style="padding:4px 42px 28px;">
              <p style="margin:0;font-size:13px;line-height:20px;color:#7A8887;">
                This verification link expires in <strong style="color:#193B3D;">24 hours</strong>.
                If you didn’t create a Spotter account, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Fallback URL -->
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="background:#F7F6F2;border-radius:16px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-size:12px;line-height:17px;font-weight:700;color:#193B3D;margin-bottom:6px;">
                      Button not working?
                    </div>
                    <div style="font-size:12px;line-height:18px;color:#667575;word-break:break-all;">
                      Copy and paste this link into your browser:<br>
                      <a href="${verificationUrl}" style="color:#4F8485;text-decoration:underline;">${verificationUrl}</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background:#193B3D;padding:22px 28px;">
              <div style="font-size:13px;line-height:19px;color:#DCE7E4;">
                Move better. Feel stronger. Keep spotting.
              </div>
              <div style="margin-top:5px;font-size:11px;line-height:17px;color:#9EB4B2;">
                © 2026 Spotter
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
