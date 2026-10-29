# Security Verification & Manual Test Checklist

This checklist defines step-by-step test procedures for manual security testing, quality assurance, and pre-deployment penetration verification of the Appointment Portal.

---

## Quick Reference Summary

| Test ID | Security Control Tested | Primary Mechanism | Expected Result |
| :--- | :--- | :--- | :--- |
| **TC-01** | Idle Timeout & Warning | `SessionManager` + `X-Skip-Session-Touch` | Warning modal at 2:30, auto sign-out at 3:00, draft preserved |
| **TC-02** | Polling Does Not Extend Session | Read-only requests include `X-Skip-Session-Touch: 1` | Session timer expires even if notification/status polling continues |
| **TC-03** | Multi-Tab Sign-Out Synchronization | `BroadcastChannel` (`portal_session_channel`) | Signing out in Tab A immediately revokes session and redirects Tab B |
| **TC-04** | Back Button Cache Exposure | `Cache-Control: private, no-store` | Browser back button after logout displays login form, no cached user data |
| **TC-05** | Credential Brute-Force & Lockout | Progressive delay + 5-attempt limit | Account locked for 15 minutes after 5 failed logins (`423 Locked`) |
| **TC-06** | IDOR Between Requesters | Record-level ownership query scoping | Requesting another user's appointment ID returns generic `404 Not Found` |
| **TC-07** | Privilege Escalation / Approval Route | Central RBAC permission middleware | Requester calling `/appointments/:id/approve` receives `403 Forbidden` |
| **TC-08** | ID Tampering in Requests | Schema validation + server-side ID check | Modified URL or payload IDs are rejected (`400 Bad Request` or `404`) |
| **TC-09** | Disguised Executable Upload | Magic byte inspection + extension check | `malware.exe` renamed to `.pdf` is rejected immediately (`400 Bad Request`) |
| **TC-10** | Expired Session During Form Submit | Client offline draft caching + 401 trap | Form submit yields `401`, preserves draft in localStorage, reloads on login |
| **TC-11** | Cross-Site Request Forgery (CSRF) | CORS allowlist + Origin/Referer check | Request from unauthorized origin returns `403 Forbidden` (`csrf_failed`) |
| **TC-12** | Public Tracking Enumeration | 2FA Identifier check + Rate limiting | Missing/invalid identifier returns `404`; >20 requests returns `429` |
| **TC-13** | Production Demo Account Isolation | `NODE_ENV=production` fail-fast validation | Demo role switcher hidden, default test credentials disabled |

---

## Detailed Manual Verification Procedures

### TC-01: Idle Timeout & Warning Dialog
- **Objective**: Ensure inactive sessions prompt the user before expiring and safely terminate upon reaching the idle threshold without losing work.
- **Preconditions**: User is logged in as `rohan.mehta@university.edu` (`requester`). Navigate to **Book Appointment** and enter form text without submitting.
- **Steps**:
  1. Leave the browser tab open without moving the mouse, pressing keys, or scrolling.
  2. Observe the screen at **2 minutes and 30 seconds** (150s).
  3. Allow an additional 30 seconds of inactivity to pass (reaching **3 minutes / 180s**).
- **Expected Results**:
  - At 2:30, a modal dialog appears: *"Session Expiring Soon: You have been inactive. You will be logged out in 30 seconds."*
  - The dialog provides a countdown timer and a *"Stay Logged In"* button.
  - If no interaction occurs, at 3:00 the user is automatically logged out and redirected to `/login?reason=idle_timeout`.
  - The in-progress draft is saved to localStorage (`appointment_draft_backup`).
  - Upon logging back in, the user receives a notification: *"Draft restored"* and their previously entered form content is restored.

---

### TC-02: Polling Requests Do Not Extend Inactive Session
- **Objective**: Verify background polling (e.g., checking for notification badges or queue updates) does not artificially keep an abandoned session alive.
- **Preconditions**: User is logged in. Developer Tools (F12) Network tab open, filtered to `Fetch/XHR`.
- **Steps**:
  1. Keep the browser open on the Dashboard for 3 minutes without touching mouse/keyboard.
  2. Inspect periodic background network requests to `/appointments` or `/notifications`.
  3. Verify each polling request contains the HTTP request header: `X-Skip-Session-Touch: 1`.
  4. Wait until the 3-minute idle duration elapses.
- **Expected Results**:
  - The background requests do not refresh the server-side session timestamp (`lastActivityAt`).
  - The idle warning fires at 2:30 and session logout triggers at 3:00 despite successful polling responses.

---

### TC-03: Multi-Tab Sign-Out Synchronization
- **Objective**: Ensure that terminating a session in one browser tab revokes access across all open tabs simultaneously.
- **Preconditions**: User logged into the portal in **Tab 1** and **Tab 2** of the same browser window.
- **Steps**:
  1. In **Tab 1**, navigate to **My Appointments**.
  2. In **Tab 2**, navigate to **Profile / Settings**.
  3. In **Tab 1**, click the user avatar in the navigation bar and select **Sign Out**.
  4. Immediately switch to **Tab 2** without clicking anything.
- **Expected Results**:
  - In Tab 1, the user is redirected to `/login`.
  - Tab 2 receives the `BroadcastChannel` message (`portal_session_channel`) or 401 response and immediately transitions to `/login` with the notification *"Signed out in another tab"*.
  - Any subsequent API requests in Tab 2 fail with `401 Unauthorized`.

---

### TC-04: Browser Back Button Cache Exposure After Logout
- **Objective**: Verify that sensitive appointment records and personal information cannot be viewed via the browser's Back button after logging out.
- **Preconditions**: User logged in, navigates to `/appointments/APT-2026-1082`, viewing personal details and remarks.
- **Steps**:
  1. Click **Sign Out**.
  2. Confirm the browser redirects to `/login`.
  3. Click the browser's **Back** button (`Alt + Left Arrow`).
- **Expected Results**:
  - The browser does not show the previously viewed appointment data.
  - The server responses have headers:
    - `Cache-Control: private, no-store, no-cache, must-revalidate`
    - `Pragma: no-cache`
  - The frontend client router detects unauthenticated state and redirects immediately back to `/login`.

---

### TC-05: Credential Brute-Force & Account Lockout
- **Objective**: Verify account lockout and progressive throttling against brute-force password guessing.
- **Preconditions**: Portal login screen at `/login`.
- **Steps**:
  1. Attempt to log in with email `rohan.mehta@university.edu` and an incorrect password (e.g. `WrongPass!123`).
  2. Repeat the incorrect attempt 5 consecutive times.
  3. On the 6th attempt, enter the *correct* password (`Portal@2026`).
- **Expected Results**:
  - Attempts 1–4 return `401 Unauthorized` with a generic message: *"Invalid email or password."* (Does not disclose whether the email exists).
  - Attempt 5 triggers account lockout.
  - The 6th attempt (even with the correct password) returns `423 Locked`: *"Account temporarily locked due to too many failed attempts. Please try again in 15 minutes."*
  - The backend logs a security warning event: `event: 'account_locked'` with client IP and request ID.

---

### TC-06: Two Users Reading Each Other's Appointments (IDOR Defense)
- **Objective**: Ensure that an authenticated requester cannot access, enumerate, or confirm the existence of another requester's appointments.
- **Preconditions**:
  - Requester A (`rohan.mehta@university.edu`, user ID `u-req`) owns appointment `APT-2026-1082`.
  - Requester B (`ananya.sharma@university.edu`, user ID `u-req2`) owns appointment `APT-2026-2001`.
- **Steps**:
  1. Log in as Requester B.
  2. Using browser address bar or DevTools/curl, navigate directly to:
     `GET /appointments/APT-2026-1082` (Requester A's appointment).
- **Expected Results**:
  - The server responds with `404 Not Found` (NOT `403 Forbidden`).
  - Returning `404` instead of `403` ensures the requester cannot distinguish between a non-existent appointment ID and a valid appointment belonging to someone else.
  - No details (subject, status, department, date) are disclosed in the response body.

---

### TC-07: Requester Calling Approval Endpoints (Privilege Escalation)
- **Objective**: Ensure requesters cannot approve, reject, reassign, or confirm appointments.
- **Preconditions**: Logged in as Requester (`rohan.mehta@university.edu`).
- **Steps**:
  1. Open DevTools Console or terminal with the active session cookie.
  2. Issue a `POST` request to approve an appointment:
     ```bash
     curl -i -X POST http://localhost:4000/appointments/APT-2026-1082/approve \
       -H "Content-Type: application/json" \
       -H "Cookie: sid=<active-requester-cookie>" \
       -d '{"remarks": "Self-approved by attacker"}'
     ```
- **Expected Results**:
  - The server returns `403 Forbidden`.
  - Error body: `{"error":{"code":"permission_denied","message":"You do not have permission to perform this action.","requestId":"..."}}`.
  - The appointment status in the database remains unchanged.
  - A security log entry is generated: `event: 'permission_denied'`, `action: 'appointment.approve'`.

---

### TC-08: Tampering with IDs in Body and Parameters
- **Objective**: Prevent mass assignment and ID tampering where a user attempts to alter `requesterId`, `id`, or `createdAt`.
- **Preconditions**: Logged in as Requester.
- **Steps**:
  1. Initiate booking request. Intercept the payload in proxy/DevTools.
  2. Inject unauthorized fields:
     ```json
     {
       "authorityId": "auth-academic-dean",
       "date": "2026-11-15",
       "timeSlot": "10:00 AM",
       "subject": "Academic inquiry",
       "purpose": "General guidance",
       "requesterId": "u-sup",
       "status": "confirmed",
       "role": "super_admin"
     }
     ```
  3. Send request to `POST /appointments`.
- **Expected Results**:
  - The server rejects the request with `400 Bad Request`.
  - Strict Zod schema rejects unknown keys (`.strict()`), returning error: *"Unrecognized key(s) in object: 'requesterId', 'status', 'role'"*.
  - No appointment is created with tampered ownership.

---

### TC-09: Uploading Disguised Executable as PDF
- **Objective**: Verify the file upload pipeline inspects magic bytes and rejects executables with forged `.pdf` extensions.
- **Preconditions**: Logged in as an authorized user on an appointment detail page with document upload capability.
- **Steps**:
  1. Create a dummy binary file starting with the Windows PE/MZ header `MZ` (hex: `4D 5A`) or a Linux ELF binary (`\x7fELF`).
  2. Name the file `legitimate_document.pdf`.
  3. Upload the file via `POST /appointments/:id/documents` or the UI file picker.
- **Expected Results**:
  - The upload handler inspects the stream's first bytes.
  - The upload is immediately aborted with `400 Bad Request`.
  - Error message: *"File content does not match the declared extension .pdf. Real type is application/x-dosexec."*
  - The file is not saved to disk and no document record is created in the database.

---

### TC-10: Expired Session During Form Submission
- **Objective**: Verify that if a user's session expires while they are filling out a long form, submitting does not lose their typed data.
- **Preconditions**: User is on Step 4 of the appointment booking form.
- **Steps**:
  1. Fill in all form fields (subject, purpose, contact details).
  2. In DevTools Application tab, delete the `sid` cookie to simulate server-side expiration.
  3. Click **Submit Appointment**.
- **Expected Results**:
  - The API call returns `401 Unauthorized`.
  - The frontend catches the 401 error, automatically writes the current form state to `appointment_draft_backup` in `localStorage`, and displays: *"Your session expired. Your draft has been saved. Please sign in to finish submitting."*
  - The user is redirected to `/login`.
  - After logging in, the portal navigates back to the booking wizard with all fields intact.

---

### TC-11: Cross-Site Request Forgery (CSRF) from Another Origin
- **Objective**: Ensure cross-origin requests cannot forge authenticated actions.
- **Preconditions**: User has an active authenticated session cookie.
- **Steps**:
  1. Use curl or a local test HTML file hosted on `http://evil-attacker.com:8080`.
  2. Send a state-changing POST request to `http://localhost:4000/appointments` with:
     - Header `Origin: http://evil-attacker.com:8080`
     - Header `Cookie: sid=<active-user-cookie>`
- **Expected Results**:
  - CORS and CSRF middleware intercepts the request.
  - The server returns `403 Forbidden` with `{ "error": { "code": "csrf_failed", "message": "Cross-origin request blocked." } }`.
  - The backend logs a security warning: `event: 'csrf_failed'`.

---

### TC-12: Public Tracking Enumeration Attempt
- **Objective**: Verify that public tracking (`/track`) prevents appointment enumeration and fishing attacks.
- **Preconditions**: Appointment `APT-2026-1082` exists and was requested by `rohan.mehta@university.edu` with phone `+91 98765 43210`.
- **Steps**:
  1. Issue request: `GET /track/APT-2026-1082` (without second factor).
  2. Issue request: `GET /track/APT-2026-1082?identifier=wrong.email@university.edu`.
  3. Issue 25 rapid requests with sequential IDs (`APT-2026-1083`, `1084`...).
- **Expected Results**:
  - Step 1 returns `400 Bad Request`: *"Email or phone number required to track appointment."*
  - Step 2 returns generic `404 Not Found` (does not disclose whether `APT-2026-1082` exists).
  - Step 3: Once the rate limit threshold (20 requests per 15 minutes) is exceeded, the server returns `429 Too Many Requests` with `Retry-After: 900`.

---

### TC-13: Production Demo Account Isolation
- **Objective**: Verify that in production mode, demo role switcher and hardcoded test logins are completely disabled.
- **Preconditions**: Start server with `NODE_ENV=production`.
- **Steps**:
  1. Verify the frontend UI in the browser.
  2. Attempt to invoke demo switch routes or pass demo credentials.
- **Expected Results**:
  - The role switcher dropdown is not rendered in the navbar.
  - Any demo bypass endpoints return `404 Not Found`.
  - If `DEMO_ROLE_SWITCHER=true` is set in `production`, the server fails fast on startup and halts execution.
