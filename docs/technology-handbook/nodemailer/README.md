# Nodemailer

## What it is

Nodemailer is a Node.js email-sending library. It composes messages and sends them through a configured transport, commonly SMTP. A transporter represents the delivery configuration; `sendMail()` submits an individual message.

Nodemailer is not an email-hosting service. Spotter currently uses Gmail as the SMTP provider through Nodemailer's well-known service preset.

## How Spotter uses it

[`src/modules/auth/auth.service.js`](../../../backend/src/modules/auth/auth.service.js) creates one transporter when the module loads:

```js
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});
```

After the database successfully creates the user, the service sends a verification message:

```js
const info = await transporter.sendMail({
  from: `"Spotter" <${process.env.EMAIL_USER}>`,
  to: normalizedEmail,
  subject: "Verify your email for Spotter",
  text: `Click the link to verify your email: http://localhost:5173/verify-email?token=${rawToken}`,
  html: `<p>Welcome to Spotter!</p><p>Click <a href="http://localhost:5173/verify-email?token=${rawToken}">here</a> to verify your email.</p>`,
});
```

Both text and HTML bodies are provided so clients that cannot or should not render HTML still receive the link.

Email delivery is wrapped in `try/catch`. A send failure is logged but does not roll back the new database user; the controller still receives the normal success message.

## API currently used

| API or option | Purpose |
| --- | --- |
| `createTransport(options)` | Create reusable delivery configuration. |
| `service: "gmail"` | Resolve Gmail's SMTP host, port, and security preset. |
| `auth.user` / `auth.pass` | Authenticate with the configured Gmail account and app password. |
| `sendMail(message)` | Compose and submit the verification email. |
| `from`, `to`, `subject` | Standard message addressing and subject fields. |
| `text`, `html` | Alternative plain-text and HTML bodies. |
| `info.messageId` | Provider/message identifier logged after submission. |

## What it can do next

- Call `transporter.verify()` during a readiness check to validate transport configuration without sending a message.
- Use OAuth 2.0 instead of a long-lived app password.
- Send password-reset, email-change, welcome, alert, and coach-invitation emails.
- Add attachments, inline images, calendar events, reply-to addresses, and custom headers.
- Use pooled SMTP connections for higher throughput.
- Render versioned templates with escaped user content and localization.
- Move delivery to a durable background queue with retry and dead-letter handling.
- Replace Gmail with a transactional provider while retaining most message code.

## Security and operational notes

- Do not commit SMTP credentials. Load them from secret configuration.
- A successful `sendMail()` usually means the SMTP server accepted the message, not that it reached the inbox.
- The current hard-coded `http://localhost:5173` URL must become environment-specific before deployment.
- Because a failed email still creates an unverified user, Spotter needs a resend-verification endpoint and token-rotation policy.
- Log identifiers and error categories, but never log raw verification tokens or credentials.
- Escape dynamic values inserted into HTML templates.
- Gmail is convenient for development and low-volume use; transactional email providers usually offer better delivery events, bounce handling, and production controls.

## Official references

- [Nodemailer usage](https://nodemailer.com/usage)
- [Message configuration](https://nodemailer.com/message)
- [Well-known SMTP services](https://nodemailer.com/smtp/well-known-services)
- [Using Gmail](https://nodemailer.com/guides/using-gmail)
- [OAuth 2.0 authentication](https://nodemailer.com/smtp/oauth2)
- [Attachments](https://nodemailer.com/message/attachments)

