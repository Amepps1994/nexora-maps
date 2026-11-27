# SEC-ADMIN / ACC-10 validation, 27 November 2026

Scope: adversarial tests for anonymous admin denial, cross-account leakage and session-token handling on the current development API, plus the server fixes those tests exposed. This is not a security audit, penetration test or deployment check.

## How it was run

- `npx vitest run` and `npx vitest run tests/security-admin-account.test.ts --reporter=verbose` (vitest 2.1.9, Node 22, Linux build container). Output: [security-test-output-2026-11-27.txt](security-test-output-2026-11-27.txt).
- The tests start the real Express app from `server/_core/app.ts` on a random port and call it over HTTP. tRPC procedures are also called through `appRouter.createCaller`.
- MySQL is replaced by an in-memory `users` table (`vi.mock("../server/db")`). The Manus OAuth server is not reachable and is mocked to fail. No real database, OAuth provider, storage backend or deployed host was used.
- Dependencies were installed with npm at the lockfile versions for the server/test subset only. Re-run `pnpm test` on the Windows working copy to confirm.

## Results

252 passed, 1 skipped (pre-existing `auth.logout` skip), 1 todo. The new file has 71 passing tests and 1 todo. Strict typecheck of `server/**`, `shared/**`, `drizzle/schema.ts` and the new test exits 0.

Run against the server code before the fixes, the same file had 9 failures (listed at the end of the output file).

| Area | What is tested | Result |
|---|---|---|
| Admin HTTP path | GET/POST/PUT/PATCH/DELETE on `/api/nexora/admin`, sub-paths, upper case and an encoded `..` path, anonymous and with an admin-role session | All 403 after fix. Bare `/api/nexora/admin` returned 404 before |
| tRPC admin | `system.notifyOwner` anonymous, non-admin, over HTTP, and with a `role: "admin"` claim smuggled into a validly signed token | All FORBIDDEN / 403. Role comes only from the database |
| Deny-by-default inventory | Every tRPC procedure outside `system.health`, `auth.me`, `auth.logout` must reject anonymous calls; the procedure list is pinned so a new one fails the test until classified | Pass |
| Cross-account identity | Alice's token resolves to Alice, Bob's to Bob; payload openId swapped without re-signing; Bearer plus another account's cookie; bad Bearer does not fall back to a valid cookie; unknown account not auto-created when OAuth is down; `cron_` openId cannot impersonate a task | Pass |
| Token forgery | Wrong secret, expired, `alg: none`, HS512 with the right secret, missing claims, junk values, token for another app id | Pass. Other-app token was accepted before fix |
| Weak secret | Empty `JWT_SECRET` (already refused by jose) and a short one | Fail closed after fix. A 5-byte secret minted and accepted sessions before |
| Cookies | Logout over HTTPS clears an HttpOnly, Secure, host-only `__Host-` cookie; `/api/auth/session` sets a cookie only after verifying the Bearer | Pass |
| Logs | Valid, forged and unknown-account tokens never appear in console output | Pass |
| Storage proxy | Anonymous and forged-token requests to `/manus-storage/*` | 401 with no backend call after fix. Before, an anonymous caller made the server request a presigned URL for any key |
| Export/delete/report | 11 plausible export, delete, report, user, saved, history and share paths, anonymous and as another account | No 2xx, no other account's id or email in any body. These endpoints do not exist on the server |
| Public endpoints | `/api/health`, `/api/nexora/capabilities` | No account data |

## Server fixes

1. `server/nexora/routes.ts`: the admin denial now covers the bare `/api/nexora/admin` path as well as sub-paths.
2. `server/_core/sdk.ts`: session signing and verification fail closed when `JWT_SECRET` is missing or shorter than 32 bytes. Tokens whose `appId` differs from the configured app id are rejected. **Local impact:** a dev `.env` with a short `JWT_SECRET` will now reject logins until it is at least 32 characters.
3. `server/_core/storageProxy.ts`: the storage proxy requires an authenticated session before contacting the storage backend.
4. `server/_core/app.ts` (new) builds the app without listening; `server/_core/index.ts` now only starts it. No route or middleware order changed.

## Known gaps, not passes

- **Logout does not revoke tokens.** Sessions are stateless one-year JWTs. A copied token stays valid after logout until it expires. Recorded as a `todo` test. Needs a revocation list or short-lived tokens with refresh.
- **Storage keys are not owner-scoped.** Any signed-in user can request any key. Nothing uploads user data today; owner-prefixed keys and an ownership check are needed before anything does.
- **No server account data exists**, so export/delete/report ownership could only be tested as "no such surface". Real ownership tests are blocked until those endpoints, share links and moderation are built.
- Not run: real MySQL, real OAuth, deployed host, secret scanning, dependency scanning, raw-GPS-in-logs checks.
