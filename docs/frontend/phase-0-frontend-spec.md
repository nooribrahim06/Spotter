# Spotter — Phase 0 Frontend Foundation Specification

**Status:** Approved for Phase 0 engineering  
**Version:** 1.0  
**Last updated:** 2026-08-25  
**Owners:** Product, frontend, and backend  
**Backend source of truth:** The current Spotter backend implementation

---

## 1. Purpose

This document is the source of truth for Spotter's Phase 0 frontend foundation.
It defines the implementation scope, frontend architecture, backend contract,
authentication lifecycle, raw brand assets, quality requirements, and completion
criteria.

It does **not** define Spotter's final visual style. The visual style will be
described by the product owner during the frontend build task and recorded here
after it is confirmed.

The palette mockup is a **color source only**. Its layout, navigation, cards,
typography, spacing, component styling, and page composition are not approved
design references and must not be copied.

---

## 2. Phase 0 Scope

### Included

1. React/Vite frontend foundation.
2. Global reset, raw palette tokens, and semantic-token structure.
3. Reusable accessible UI primitives.
4. Public, authentication, and authenticated layout foundations.
5. Responsive desktop and mobile layout behavior.
6. Public landing page.
7. Login page.
8. Signup page.
9. Verification-email-sent page.
10. Email-verification handler page.
11. Resend-verification flow.
12. Authenticated home page at `/app/home`.
13. Authentication initialization, guards, refresh, and logout.
14. Global loading, error, toast, and 404 behavior.
15. Automated frontend tests for the critical user journeys.

### Excluded

- Body-profile management.
- Fitness-goal management.
- Meal tracking.
- Workout tracking.
- Progress check-ins.
- AI Coach functionality.
- Dark mode.
- Notifications and search.
- Final production analytics and monitoring.
- Full cross-tab authentication coordination beyond the Phase 0 race recovery.

Excluded features must not appear as working navigation destinations. Future
navigation concepts may be documented separately but must not ship as dead or
disabled primary actions.

---

## 3. Product Identity

### 3.1 Spotter mascot

The muscle character in `spotter_muscle_lets_go_sizes_v2.zip` is the official
Spotter mascot and a core part of the product identity, not a temporary stock
illustration.

The pack contains PNG and lossless WebP variants from 256px through 4096px.
When frontend implementation begins:

- Copy only the required production sizes into the frontend asset directory.
- Prefer WebP for browser delivery.
- Keep a suitable PNG master as the source asset.
- Preserve aspect ratio and transparency.
- Do not crop, recolor, distort, animate, or assign page placement until the
  product owner provides the visual-style brief.
- Use meaningful alternative text when the mascot communicates content; use
  `alt=""` when it is purely decorative.

### 3.2 Approved raw palette

The following colors are approved from `spotter_palette_mockup.html`:

```css
:root {
  --palette-navy:  #2F4156;
  --palette-teal:  #567C8D;
  --palette-sky:   #C8D9E6;
  --palette-beige: #F5EFEB;
  --palette-white: #FFFFFF;
  --palette-ink:   #18232D;
  --palette-coral: #FF7A6B;
}
```

These are raw palette tokens, not final semantic assignments. Decisions such as
which color is primary, which actions use coral, and how backgrounds are layered
belong to the later style brief.

No additional brand color may be introduced merely to imitate the palette
mockup. Accessibility-specific derived colors may be added only when required
for contrast, focus, disabled, hover, error, success, or warning states, and must
be documented.

### 3.3 Visual style status

**Pending product-owner brief.**

The frontend implementer must not infer the final style from:

- The palette mockup's layout.
- Generic fitness applications.
- Component-library defaults.
- The mascot's rendering style alone.

The later brief will decide typography, density, shape language, illustration
placement, motion, page composition, and the emotional tone of the interface.

---

## 4. Technology Stack

```text
Framework:          React 18
Build tool:         Vite
Language:           JavaScript (ES2022+)
Router:             react-router-dom v7
HTTP client:        Axios
Forms:              React Hook Form
Validation:         Zod
Styling:            CSS Modules + CSS custom properties
Server state:       TanStack Query v5
Global client state: Zustand, auth only
Toast notifications: react-hot-toast
Component visuals:  Custom Spotter primitives
```

Exact package versions are pinned in the frontend lockfile when the frontend is
scaffolded. Packages may not be added without a written reason.

Using Zod on both sides does not automatically keep schemas synchronized. The
backend remains authoritative. A backend validation change requires an API
contract review and a corresponding frontend-schema update.

---

## 5. Route Architecture

```text
/                         Public landing page
/login                    Guest-only login
/signup                   Guest-only signup
/verify-email-sent        Guest-only confirmation and resend flow
/verify-email             Public verification-token handler
/app                      Protected; redirects to /app/home
/app/home                 Authenticated home page
/app/*                    Protected in-app 404
*                         Public standalone 404
```

Routes are declared centrally with `createBrowserRouter` in
`src/routes/index.jsx`. Page data is loaded through TanStack Query, not React
Router loaders, during Phase 0.

### Guards

- While auth status is `initializing`, render only the Spotter startup state.
- An unauthenticated visit to `/app/*` redirects to `/login` and stores the
  intended internal route.
- After login, return only to a validated path beginning with `/app/`.
- Authenticated visits to `/login`, `/signup`, and `/verify-email-sent` redirect
  to `/app/home`.
- Public email verification remains accessible regardless of auth state.

---

## 6. Layout Foundations

Phase 0 creates three layout containers:

```text
PublicLayout   Public landing and standalone 404
AuthLayout     Login, signup, verification, and resend states
AppLayout      Protected application shell and /app/* 404
```

The precise visual arrangement is pending the style brief. The implementation
must support:

- Mobile-first CSS.
- Content at 320px without horizontal scrolling.
- Layout transitions at 768px, 1024px, and 1280px.
- Safe-area padding for fixed mobile navigation if the final design uses it.
- A single `<main>` landmark per rendered page.
- Skip navigation for keyboard users.

Use literal values in media queries:

```css
@media (min-width: 768px) { /* tablet */ }
@media (min-width: 1024px) { /* desktop */ }
@media (min-width: 1280px) { /* large desktop */ }
```

CSS custom properties cannot be used directly as media-query conditions.

---

## 7. State Ownership

### Zustand auth store

```js
{
  authStatus: "initializing" | "authenticated" | "unauthenticated",
  user: null | { id, email, username },
  accessToken: null | string,

  setAuth: ({ user, accessToken }) => void,
  setAccessToken: (accessToken) => void,
  setAuthStatus: (authStatus) => void,
  clearAuth: () => void,
}
```

### Ownership rules

| State | Owner |
|---|---|
| Access token, user, auth status | Zustand auth store |
| Server resources | TanStack Query |
| Form fields and form errors | React Hook Form |
| Component-only UI state | Local React state |
| Shareable filters/search | URL search parameters |
| User preferences | Local storage only when explicitly approved |

The access token is memory-only. It must never be written to local storage,
session storage, IndexedDB, logs, analytics, or rendered markup. The refresh
token is an HTTP-only cookie and is never accessible to frontend JavaScript.

---

## 8. Backend Environment Contract

```env
VITE_API_URL=http://localhost:3000
```

The Axios clients use:

```js
{
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
}
```

The backend now has credentialed CORS configured for its validated
`FRONTEND_URL`. The refresh cookie is HTTP-only, secure in production,
`SameSite=Lax`, and host-only because no cookie domain is configured.

The frontend never manually reads or writes the refresh cookie.

---

## 9. Authentication API Contract

### 9.1 Signup

```http
POST /api/auth/signup
```

```json
{
  "email": "user@example.com",
  "username": "john_doe",
  "password": "securepassword123"
}
```

Success: `201`

```json
{
  "message": "User created successfully. Check your email to verify your account."
}
```

Rules:

- Email must be valid.
- Username is trimmed and 3–30 characters.
- Password is 8–72 characters.
- Signup does not log the user in.
- Successful signup navigates to `/verify-email-sent`.
- Preserve the submitted email only in in-memory navigation/form state to make
  resend convenient. Do not put it in the URL.

Relevant errors: `INVALID_SCHEMA`, `USER_ALREADY_EXISTS`, `EMAIL_SEND_FAILED`,
and `TOO_MANY_REQUESTS`.

If email delivery fails, the account may already exist. Present a recovery path
to resend verification instead of telling the user to repeat signup indefinitely.

### 9.2 Resend verification

```http
POST /api/auth/resend-verification
```

```json
{
  "email": "user@example.com"
}
```

Success: `200`

```json
{
  "message": "If the account exists and is not verified, a verification email has been sent."
}
```

The response is intentionally identical for missing, verified, and eligible
accounts. The frontend must not claim that a particular account exists.

### 9.3 Verify email

```http
POST /api/auth/verify-email
```

```json
{
  "token": "64-character hexadecimal token"
}
```

Success: `200`

```json
{
  "message": "Email verified successfully."
}
```

`/verify-email?token=...` reads the token and submits it once. The page supports
missing-token, loading, success, invalid/expired token, rate-limit, and network
states. Success does not automatically log the user in.

### 9.4 Login

```http
POST /api/auth/login
```

```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

Success: `200`

```json
{
  "status": "success",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "john_doe"
  },
  "accessToken": "jwt"
}
```

Wrong email, wrong password, and unverified email all use
`INVALID_CREDENTIALS`. The frontend always presents one generic credential
message and must not branch on the backend message text.

### 9.5 Refresh

```http
POST /api/auth/refresh
```

No body is required. The browser sends the refresh cookie automatically.

Success: `200`

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "john_doe"
  },
  "accessToken": "new-jwt"
}
```

The backend rotates the refresh cookie. The frontend stores the returned user
and access token in memory. JWT decoding is not part of the startup strategy.

Errors:

- `INVALID_CREDENTIALS`: session is unavailable; clear auth.
- `REFRESH_TOKEN_THEFT_DETECTED`: clear auth immediately.
- `REFRESH_TOKEN_ALREADY_ROTATED`: wait briefly and retry refresh once; do not
  clear auth before that recovery attempt completes.

### 9.6 Logout

```http
POST /api/auth/logout
```

Logout is best-effort on the network and absolute locally. In a `finally` path:

1. Clear the Zustand auth store.
2. Clear the TanStack Query cache.
3. Navigate to `/login`.
4. Do not preserve protected return state.

---

## 10. Error Contract

Standard backend error:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

Validation error:

```json
{
  "error": "Validation failed.",
  "code": "INVALID_SCHEMA",
  "details": [
    {
      "field": "email",
      "message": "Invalid email address"
    }
  ]
}
```

The `details` array contains only public field paths and validation messages. It
does not contain submitted values, passwords, schema objects, database data, or
stack traces.

### Frontend rules

- Branch on `error.code`, never message text.
- Use status only as a fallback when code is unavailable.
- Map `INVALID_SCHEMA` details into React Hook Form with `setError`.
- Display unknown validation paths as a root form error.
- Normalize network failures to `NETWORK_ERROR`.
- Normalize timeouts to `TIMEOUT`.
- Never display raw unexpected server messages in production.

---

## 11. API Client and Refresh Architecture

Use two Axios instances:

```text
apiClient       Access-token request interceptor + response interceptor
refreshClient   Cookie-based refresh only; no auth response interceptor
```

This prevents the circular dependency:

```text
apiClient → authApi → apiClient
```

Components call feature API functions, never raw Axios methods.

### Request interception

- Read the access token with `useAuthStore.getState()`.
- Attach `Authorization: Bearer <token>` only when a token exists.
- Never log the token.

### Response interception

Attempt refresh only when:

```js
error.response?.data?.code === "INVALID_ACCESS_TOKEN"
```

Every original request may be retried at most once. Login, signup, verification,
resend, refresh, and logout errors never trigger recursive refresh.

### Single-flight refresh

One module-level `refreshPromise` owns all refresh attempts, including startup
and interceptor recovery. All callers await the same promise. The promise is
cleared in `finally`.

This requirement applies even in React development Strict Mode.

### Race recovery

If refresh returns `REFRESH_TOKEN_ALREADY_ROTATED`:

1. Wait approximately 250ms.
2. Attempt refresh once more through the same refresh coordinator.
3. If the recovery succeeds, continue normally.
4. If it fails with a terminal session error, clear auth.

Full cross-tab leadership or token broadcasting is deferred until before the
authentication system is declared production-ready.

---

## 12. Application Startup

```text
App mounts
  → authStatus = initializing
  → call the shared refresh coordinator
    → success: store user + access token; authenticated
    → 401 terminal session error: clear auth; unauthenticated
    → refresh-race response: perform the one recovery attempt
    → network/5xx: show initialization error with Retry
```

A network outage must not be presented as “wrong credentials” or silently
treated as a confirmed logout. No protected or guest-only route renders until
initialization reaches a resolved state.

---

## 13. Forms

Use React Hook Form with Zod:

```js
{
  mode: "onSubmit",
  reValidateMode: "onChange"
}
```

Rules:

- Validate on first submit, then revalidate edited fields on change.
- Disable the submit button while its mutation is pending.
- Keep entered values visible after server errors.
- Do not automatically retry auth mutations.
- Use visible labels; placeholders never replace labels.
- Connect errors with `aria-describedby`.
- Move focus to the first invalid field or root error summary after failure.

Frontend validation improves user experience. Backend validation remains the
authority.

---

## 14. TanStack Query Defaults

Queries may retry transient failures. They do not retry `401`, `403`, or `404`.
Mutations do not retry automatically.

```js
new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        failureCount < 3 &&
        ![401, 403, 404].includes(error.status),
    },
    mutations: {
      retry: false,
    },
  },
});
```

Server data must not be copied into Zustand.

---

## 15. UI Primitives

Phase 0 provides reusable behavior and accessibility for:

```text
Button
Input
PasswordInput
FormField
Card
Spinner
Skeleton
Toast
InlineError
PageError
EmptyState
VisuallyHidden
```

Their final visual treatment is pending the style brief. Behavior, semantics,
keyboard support, disabled/loading behavior, and error wiring are not deferred.

Use native HTML behavior wherever practical. If a future modal is required,
prefer a native `<dialog>` wrapper or a justified accessible headless primitive
instead of hand-writing an incomplete focus trap.

---

## 16. Accessibility Requirements

1. Use semantic landmarks and heading order.
2. Buttons are `<button>`; navigation is `<a>`/router links.
3. Every input has a visible associated label.
4. Keyboard focus is always visible.
5. Forms work with keyboard alone.
6. Interactive icons have accessible names.
7. Decorative imagery uses empty alt text.
8. Validation errors are programmatically associated with fields.
9. Color is never the only state indicator.
10. Normal text meets 4.5:1 contrast; large text and UI boundaries meet their
    applicable WCAG contrast requirements.
11. Interactive targets are at least 44×44px where practical.
12. Respect `prefers-reduced-motion`.
13. Route changes update the document title.
14. Route changes and form results manage focus intentionally.
15. The mascot never replaces essential text instructions.

---

## 17. Proposed Source Structure

```text
src/
├── api/
│   ├── apiClient.js
│   ├── auth.api.js
│   └── normalizeApiError.js
├── assets/
│   └── spotter/
├── components/
│   ├── ui/
│   └── guards/
├── features/
│   └── auth/
│       ├── components/
│       ├── hooks/
│       └── schemas/
├── hooks/
│   └── useAuthInit.js
├── layouts/
│   ├── PublicLayout.jsx
│   ├── AuthLayout.jsx
│   └── AppLayout.jsx
├── pages/
│   ├── LandingPage.jsx
│   ├── LoginPage.jsx
│   ├── SignupPage.jsx
│   ├── VerifyEmailSentPage.jsx
│   ├── VerifyEmailPage.jsx
│   ├── NotFoundPage.jsx
│   └── app/
│       └── HomePage.jsx
├── routes/
│   └── index.jsx
├── stores/
│   └── authStore.js
├── styles/
│   ├── reset.css
│   ├── palette.css
│   ├── semantic-tokens.css
│   └── global.css
├── test/
│   └── setup.js
├── queryClient.js
└── main.jsx
```

---

## 18. Testing Requirements

At minimum, automated frontend tests cover:

- Signup validation and success navigation.
- Structured backend validation mapping to fields.
- Resend verification without revealing account existence.
- Verification missing, loading, success, and invalid-token states.
- Generic login error behavior.
- Login return-to-protected-route behavior.
- Startup refresh success and terminal failure.
- Refresh single-flight behavior under concurrent `401` responses.
- `REFRESH_TOKEN_ALREADY_ROTATED` recovery.
- Logout clearing auth and query state even when the request fails.
- Guest and protected route guards.
- Keyboard submission and accessible form errors.

Recommended frontend test tools are Vitest, React Testing Library,
`@testing-library/user-event`, and `@testing-library/jest-dom`; their exact
versions are pinned when scaffolding.

The existing backend contract tests are run from `backend/` with:

```powershell
npm test
```

---

## 19. Definition of Done

Phase 0 is complete when:

- Every included route renders and no excluded feature appears functional.
- Public, guest-only, and protected guards behave correctly.
- Reload restores both the authenticated user and access token through refresh.
- Login, signup, resend, and verification present all required states.
- The interface works at 320px, 768px, 1024px, and 1280px widths.
- Critical journeys work with keyboard alone.
- Palette usage comes only from the approved raw colors or documented
  accessibility-derived values.
- The palette mockup's layout has not been copied.
- Mascot usage follows the approved identity rules and final style brief.
- No authentication token is persisted or logged.
- Refresh is single-flight and retries original requests at most once.
- CORS and cookies work with the configured frontend/backend origins.
- Automated frontend tests pass.
- Existing backend contract tests pass.
- The production frontend build completes without errors.
- No console errors occur during the critical journeys.

---

## 20. Deferred Decisions

The following decisions are intentionally deferred to the frontend build task:

- Final visual style and art direction.
- Semantic role assignment for the approved raw colors.
- Typography and font-loading strategy.
- Exact desktop and mobile navigation presentation.
- Mascot placement, scale, frequency, and motion.
- Page composition, card treatment, radii, shadows, and density.
- Dark mode.
- Full cross-tab authentication coordination before production release.

Deferred means “decide deliberately later,” not “let the implementer guess.”

---

## 21. Implementation Order

1. Scaffold and pin the frontend dependencies.
2. Add reset, raw palette tokens, and empty semantic-token layer.
3. Add test setup and query client.
4. Implement auth store, error normalization, both Axios clients, and shared
   refresh coordinator.
5. Implement routing and guards.
6. Implement accessible behavioral primitives.
7. Receive and record the product owner's visual-style brief.
8. Apply the confirmed style to semantic tokens and primitives.
9. Build public landing, signup, verification, resend, and login.
10. Build the authenticated layout and `/app/home`.
11. Complete accessibility, responsive, and automated-test passes.

---

## 22. Change Control

Architecture, API, security, scope, palette, and identity changes require an
update to this document. Routine implementation details that do not change these
contracts do not require a document revision.

The document is approved for beginning Phase 0 engineering. It is not approval
to invent the final visual style or to release authentication to production
without completing the deferred production requirements.

