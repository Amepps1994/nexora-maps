# NEXORA Maps — release and rollback

How to ship the backend and the Android APK, and how to undo either. Nothing here publishes to an app store.

## 1. Before any release

1. The change is merged to `main` through a pull request whose **CI / verify** check is green
   (`.github/workflows/ci.yml`: install from the lockfile, typecheck, lint, tests, server build).
2. Render has finished deploying that commit and is healthy:
   - `https://nexora-api-cfoh.onrender.com/api/nexora/capabilities` returns HTTP 200
     (the first call after 15 idle minutes can take up to a minute while the free instance wakes up);
   - the response still lists search as configured.

One-time owner settings (GitHub and Render dashboards, not code):
- GitHub, Settings > Branches: protect `main` and make the `verify` check required.
- Render, nexora-api > Settings > Build & Deploy: set Auto-Deploy to "After CI checks pass" if the plan offers it.
  Otherwise Render deploys on every push to `main`, so only merge green PRs.

## 2. Backend (Render)

Merging to `main` deploys automatically from `render.yaml`. To check a deploy, open the nexora-api service's
**Events** tab in Render and match the commit SHA.

**Roll back the backend** with either:
- Render > nexora-api > Events > pick the previous good deploy > **Rollback**. This is fastest, but the next push to
  `main` deploys again, so follow up with a revert.
- `git revert <bad-sha>` on a branch, open a PR, merge it once CI is green. Render then deploys the revert.

## 3. Android APK (EAS)

Profiles in `eas.json` (both build an internal-distribution APK on Node 22 and set
`EXPO_PUBLIC_API_BASE_URL=https://nexora-api-cfoh.onrender.com` explicitly):

| Profile | Use |
|---|---|
| `preview` | A test APK from a branch, before merging |
| `production-apk` | The build Andrew installs; the Android version code auto-increments on every build |

**Bump the app version before every release build.** Raise `version` in `app.config.ts` (for example
`1.1.0` to `1.2.0`) in the release PR. The live-start acknowledgement is keyed to that value (UX-003), so testers
are asked to acknowledge again on the first live start of a new release. The Android version code still
auto-increments by itself.

Builds use the owner's EAS quota, so **each build needs Andrew's typed approval** in the project thread.

Cut a build from the working copy on Andrew's PC, in PowerShell (`npx.ps1` is blocked, so use `npx.cmd`):

```powershell
cd C:\Users\andre\Documents\NEXORA-Maps
git status            # commit or stash local edits first
git switch main
git pull
$env:EAS_NO_VCS='1'; npx.cmd eas-cli build -p android --profile production-apk --non-interactive --no-wait
```

Use `--profile preview` for a branch test build.

After the build finishes, record it in [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md) next to the test results:
- EAS build id and profile,
- git commit SHA it was built from (`git rev-parse HEAD`),
- version code shown in the EAS build page,
- date, and the emulator or phone it was installed on.

**Roll back the APK** by reinstalling the previous build: open the earlier build id on expo.dev
(account `epps1994`, project `nexora`), download its APK and `adb install -r -d <file>.apk` (`-d` allows the lower
version code). If the problem is in the backend, roll back Render instead; the APK does not need to change.

## 4. After a release

- Run the device checks for the build in [DEVICE_TEST_PLAN.md](DEVICE_TEST_PLAN.md) and record the outcomes.
- Live guidance stays "unverified for road use" until LG-1 to LG-10 pass on a physical phone.
