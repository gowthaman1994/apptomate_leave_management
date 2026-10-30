# Feature Specification: User Login & Session Authentication

**Feature Branch**: `001-user-login-auth`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Build a user login module. Login form has email as username and a password field with a Sign In button — no forgot-password flow and no signup access (accounts are provisioned another way). Proper authentication with password hashing in the backend. All API calls from the frontend must be encrypted via a master key, which the backend uses to decrypt the data; the login token generated at sign-in is used as the auth token for all other API calls. The master key is stored in env config as a 32-bit format. Implement session management: a session refresh-token API the frontend calls to refresh the token after 15 minutes of inactivity. Follow the existing database schema structure (public.users, public.profiles, public.user_roles etc.) and ensure proper RLS policy is in place from the start. This is backend/API-level work only (apps/api)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Email/Password Sign-In (Priority: P1)

A person with an existing, provisioned account signs in using their email address and
password to gain access to the system.

**Why this priority**: This is the entire feature — there is no other way in (no sign-up,
no SSO, no password reset), so nothing else in the system is reachable until this works.

**Independent Test**: Can be fully tested by submitting a valid email/password pair for a
provisioned account and confirming the system grants an authenticated session with a token
usable on subsequent requests.

**Acceptance Scenarios**:

1. **Given** a provisioned account with a known email and password, **When** the user
   submits that email and password via the sign-in action, **Then** the system grants an
   authenticated session and returns a token the user can use for subsequent requests.
2. **Given** a provisioned account, **When** the user submits the correct email with an
   incorrect password, **Then** the system rejects the attempt with a generic
   authentication-failed response.
3. **Given** no account exists for a submitted email, **When** the user submits sign-in,
   **Then** the system responds identically to the incorrect-password case (no signal that
   reveals whether the email is registered).

---

### User Story 2 - Session Stays Alive While Active, Expires When Idle (Priority: P2)

A signed-in user who keeps using the system is not interrupted, while a signed-in user who
stops using it for an extended period is automatically signed out and must sign in again.

**Why this priority**: Without this, sessions are either permanently valid (a serious
exposure if a token leaks) or expire too aggressively to be usable. This is what makes the
sign-in from Story 1 safe to rely on continuously rather than a one-time check.

**Independent Test**: Can be fully tested by signing in, then waiting past the inactivity
threshold without making requests and confirming the session token is no longer accepted;
separately, by signing in and making requests inside the threshold and confirming the
session is renewed rather than cut off.

**Acceptance Scenarios**:

1. **Given** an authenticated session, **When** the user makes requests at intervals
   shorter than the inactivity threshold, **Then** the session continues to be honored
   without requiring the user to sign in again.
2. **Given** an authenticated session, **When** more than 15 minutes pass with no requests
   on that session, **Then** the next request using that session's token is rejected and the
   user must sign in again.
3. **Given** an authenticated session that is still within its inactivity window, **When**
   the frontend requests a renewal, **Then** the user receives a renewed session without
   re-entering their email and password.

---

### User Story 3 - Every Protected Action Requires the Same Valid Session (Priority: P3)

Once signed in, the single session proof issued at sign-in is what every other protected
action in the system checks, rather than each feature implementing its own login step.

**Why this priority**: This is what makes Story 1 useful beyond the sign-in screen itself —
it is the connective layer between login and everything else, but it has no independent
value until at least one protected action exists for it to guard.

**Independent Test**: Can be fully tested by calling a protected action with a valid session
token (succeeds), the same action with no token (rejected), and the same action with an
expired or invalid token (rejected).

**Acceptance Scenarios**:

1. **Given** a valid, current session token, **When** the user performs a protected action,
   **Then** the action proceeds as that authenticated user.
2. **Given** no session token, or an invalid or expired one, **When** a protected action is
   attempted, **Then** the system rejects the request and does not perform the action.

---

### Edge Cases

- What happens when a user's account becomes inactive or is soft-deleted while they still
  hold a valid, unexpired session token? → The next request made with that token MUST be
  rejected even though the token itself has not expired.
- What happens when someone submits repeated sign-in attempts with the wrong password for
  the same account? → The system MUST slow down or temporarily block further attempts
  against that account to resist password-guessing (see FR-013).
- What happens when a renewal is requested for a session that is already past its
  inactivity threshold? → The renewal MUST be rejected; the user must sign in again with
  their credentials.
- What happens when a request's payload fails the encryption/decryption check? → The
  request MUST be rejected with a generic error that does not reveal why validation failed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a user to sign in using exactly two credentials — email
  address and password — and no other identifier (no username, phone, SSO).
- **FR-002**: System MUST verify a submitted password against a securely hashed version of
  that account's password, and MUST NOT store or compare passwords in plain text at any
  point.
- **FR-003**: System MUST respond identically (same status, same generic message) whether a
  submitted email does not exist or the password for it is wrong, so that no response
  reveals which case occurred.
- **FR-004**: System MUST NOT expose any account-creation (sign-up) or password-reset
  (forgot-password) capability as part of this feature; accounts are provisioned through a
  separate mechanism outside this feature's scope.
- **FR-005**: Upon successful sign-in, System MUST issue the user a session token that
  proves their identity for subsequent requests, so they are not required to resubmit email
  and password on every request.
- **FR-006**: System MUST require a valid, unexpired session token on every protected
  action; requests with no token, or an invalid or expired one, MUST be rejected before any
  protected action is performed.
- **FR-007**: System MUST treat a session as expired once more than 15 minutes pass with no
  requests made on it ("inactivity"); after that point its token MUST no longer be accepted
  for protected actions.
- **FR-008**: System MUST provide a way to renew an active user's session before it expires
  from inactivity, without the user re-entering email and password, as long as the renewal
  happens within the inactivity window.
- **FR-009**: System MUST reject a renewal attempt made after the inactivity window has
  already elapsed; the user must sign in again with their credentials in that case.
- **FR-010**: System MUST apply an additional application-layer encryption step to
  frontend→API request payloads for this feature, on top of standard transport security,
  using a shared key that both the frontend and backend hold; the frontend obtains this key
  through its own build-time configuration rather than a runtime secret store. This step is
  understood to provide payload obfuscation beyond HTTPS alone, not independent secrecy,
  since a key shipped in a frontend build is recoverable by anyone who inspects that build.
- **FR-011**: System MUST reject any request whose payload fails this encryption scheme's
  validation, without revealing the specific reason validation failed.
- **FR-012**: System MUST continue to enforce the project's existing per-user, row-level
  data access rules on every request made using a session token, so that having a valid
  session does not by itself grant access beyond what that user's role and ownership permit.
- **FR-013**: System MUST slow down or temporarily block further sign-in attempts against an
  account after repeated consecutive failures, to resist password-guessing.

### Key Entities *(include if feature involves data)*

- **User Account**: The email-and-hashed-password pair a sign-in attempt is checked
  against; exactly one per person who may sign in.
- **Session**: The proof of a successful sign-in; carries an active/expired state driven by
  elapsed time since its last use, and is what every protected action checks before
  proceeding.
- **Profile**: The person-facing record (name, role, status) tied to a User Account, used to
  decide whether an otherwise-valid session should still be honored (e.g., an inactive or
  deleted profile invalidates an otherwise-unexpired session).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with a valid account can sign in and reach a protected action in under
  5 seconds end-to-end on a typical connection.
- **SC-002**: 100% of sign-in attempts with either an incorrect password or a non-existent
  email receive the same generic rejection, with no observable difference between the two
  cases.
- **SC-003**: A user who stays active never experiences an unexpected forced sign-out; a
  user idle for more than 15 minutes is always required to sign in again before performing
  another protected action — verified across repeated trials with no exceptions.
- **SC-004**: Zero plaintext passwords are ever observable in storage, logs, or error
  messages, verified by review.
- **SC-005**: No sign-up or password-reset entry point is reachable anywhere in the surface
  covered by this feature.
- **SC-006**: 100% of requests whose payload is missing the required encryption step, or
  carries a tampered/invalid one, are rejected rather than processed.

## Assumptions

- Accounts are provisioned by a separate, not-yet-built administrative process; this
  feature assumes at least one account already exists with a hashed password before
  sign-in can be exercised. Building that provisioning process is out of scope here.
- "After 15 minutes of inactivity" is interpreted as a sliding idle timeout: a session
  stays valid as long as requests keep arriving within each rolling 15-minute window, and is
  treated as expired the moment that window elapses with no request.
- Sign-in is open to any provisioned account regardless of role (ADMIN/MANAGER/EMPLOYEE);
  role- and ownership-based access to specific data continues to be enforced separately by
  the project's existing row-level access rules, not by this login feature itself.
- This feature covers only the API/backend side of login and session handling, per explicit
  instruction. The sign-in form's two fields (email, password) and single action (sign in)
  are documented here only because they define the shape of the sign-in request this API
  must accept — building the actual form UI is out of scope for this spec.
- Basic protection against repeated failed sign-in attempts (a temporary slowdown or lockout
  after many consecutive failures on one account) is included as an industry-standard
  safeguard even though it was not explicitly requested.
- The frontend↔API payload-encryption key (FR-010) is a build-time, shared value — distinct
  in trust level from true backend-only secrets such as database credentials, which this
  project's constitution already requires stay server-side only. This key's value must
  still be sourced from environment configuration at build time rather than written into
  source directly, consistent with that same no-hardcoding principle, even though the built
  artifact itself will contain it.
