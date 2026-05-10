# Release runbook

> **Audience:** the human who cuts releases (Juli374). Operate this
> document like a flight checklist — read top to bottom, tick each box,
> never skip steps "because last time it worked."
>
> **Scope:** Phase I onward — once Lane C (`I.3`, auto-update) and Lane F
> (`I.6`, this) are merged. Before that, releases are unsigned and meant
> for the founder's own laptop only.

Companion docs:
- `release-env.md` — every secret used below, where to get it, how to rotate.
- `electron-knowledge-base/atlas/core/05-packaging-and-signing.md` — the why.
- `electron-knowledge-base/atlas/core/07-auto-update.md` — channels & rollouts.
- `.github/workflows/release.yml` — the actual pipeline.

---

## Pre-flight (once per release cycle)

- [ ] All Phase I lanes merged into `main`. `parity-plan.md` and the
      `master-plan-2026-05-10.md` Phase I section show every checkbox
      ticked.
- [ ] `npm test` is green locally. Same Node version as CI (Node 20 LTS).
- [ ] `npm run lint` and `npx tsc --noEmit` clean.
- [ ] No uncommitted changes (`git status --short` empty).
- [ ] All required secrets exist at
      [Settings → Secrets → Actions](https://github.com/Juli374/ads-tracker-desktop/settings/secrets/actions).
      See `release-env.md`. Skipped Apple/Windows secrets are OK if you
      explicitly want an unsigned smoke build.
- [ ] Apple Developer cert not expiring within 60 days
      (`security find-identity -v -p codesigning` on a Mac with the cert
      installed).
- [ ] Windows cert not expiring within 60 days (check the .pfx
      `notAfter` field, or your CA dashboard).
- [ ] `GH_TOKEN` PAT not expiring within 14 days (GitHub UI shows
      remaining days).
- [ ] CHANGELOG entry drafted for the new version. Convention: keep the
      top "Unreleased" section, copy entries into a new dated heading
      when tagging.

---

## Cutting the release

### 1. Bump version

```bash
# Working tree clean, on main, up to date with origin.
npm version patch  # or `minor` / `major` / `prerelease --preid=rc`
# This updates package.json, package-lock.json, creates a commit
# "v0.0.2" and a matching annotated tag v0.0.2.
```

`npm version` will block if the tree is dirty. If it complains:
```bash
git stash --include-untracked   # don't lose work
npm version patch
git stash pop
```

### 2. Push the tag

```bash
git push origin main
git push origin v0.0.2   # or whatever tag npm created
```

The tag push is what triggers `release.yml`. Pushing the tag without
the matching commit will work (CI checks out by tag), but you want
both in `origin` so the draft Release on GitHub points at a real
commit on `main`.

### 3. Watch the workflow

```bash
gh run watch --exit-status -R Juli374/ads-tracker-desktop
```

Or open
[Actions → Release](https://github.com/Juli374/ads-tracker-desktop/actions/workflows/release.yml).

Total time: 25-40 minutes for a clean run (Mac notarization is the
slow leg — Apple's notary service can take 3-15 min depending on
queue depth).

If a job fails, check it in this order:
1. **Lint / Test** failure → fix on `main`, delete the tag, restart.
   ```bash
   git tag -d v0.0.2
   git push origin :refs/tags/v0.0.2
   # fix, commit, then re-`npm version`
   ```
2. **macOS signing** failure → check `release-env.md` § macOS. Often
   the `.p12` re-encode after a rotation forgot the `-w0` flag.
3. **macOS notarization** failure → check the Apple notary log:
   ```bash
   xcrun notarytool log <submission-id> \
     --apple-id "$APPLE_ID" \
     --password "$APPLE_APP_SPECIFIC_PASSWORD" \
     --team-id "$APPLE_TEAM_ID"
   ```
   The submission ID is in the workflow log.
4. **Windows signing** failure → usually `WIN_CSC_KEY_PASSWORD`
   mismatch, or a renewed cert with a different password not yet
   rotated in Secrets.
5. **Publish** failure → 99% of the time it's an expired `GH_TOKEN`.

### 4. Verify the draft Release

Once `release.yml` finishes, open
[Releases → Drafts](https://github.com/Juli374/ads-tracker-desktop/releases).
There should be a new draft tagged `v0.0.2`.

Check that all expected artefacts are present:
- [ ] `Ads-Tracker-0.0.2-arm64.dmg` (Apple Silicon)
- [ ] `Ads-Tracker-0.0.2.dmg` (Intel — or universal if Forge configured for it)
- [ ] `Ads-Tracker-0.0.2-mac.zip` (used by Squirrel.Mac for auto-update)
- [ ] `Ads.Tracker.Setup.0.0.2.exe` (Windows Squirrel installer)
- [ ] `Ads.Tracker-0.0.2-full.nupkg` (used by Squirrel.Windows for auto-update)
- [ ] `Ads-Tracker_0.0.2_amd64.deb` (Debian/Ubuntu)
- [ ] `Ads-Tracker-0.0.2.x86_64.rpm` (Fedora/RHEL)
- [ ] `latest-mac.yml` (auto-update manifest)
- [ ] `latest.yml` (auto-update manifest, Windows)
- [ ] `latest-linux.yml` (auto-update manifest, Linux)

If anything's missing, the corresponding maker probably fell back
to a no-op. Don't publish until you understand why.

### 5. Smoke-test on a real machine

> **Critical.** Auto-update CDN propagation can take ~5 min after
> publish, but installer correctness must be tested **before** publish.
> Otherwise existing users auto-update to a broken build.

For each platform you have access to (at minimum: macOS, since that's
the founder's daily driver):

- [ ] Download the appropriate installer from the **draft** Release page.
- [ ] On a fresh user account (or after rm-ing `~/Library/Application Support/Ads Tracker`):
      install + launch.
- [ ] Verify Gatekeeper / SmartScreen does **not** complain. If it does:
      signature is broken — **stop**, don't publish. Investigate the
      signing leg of the workflow.
- [ ] Login screen appears, paste a known-good token, list of campaigns
      loads.
- [ ] Open Settings → Application → About. Version reads `0.0.2` and
      the commit SHA matches the tag (Lane G adds this).
- [ ] Open / close a few main pages (Dashboard, Books, Campaigns) — no
      console errors in DevTools.
- [ ] Install the **previous** version (download from a previous
      Release), launch, wait 30s, watch UpdateChecker. It should detect
      the new draft is **not** picked up (drafts are private to repo
      collaborators) — that's fine, this is the dry run.

### 6. Publish

When smoke-tests pass:

1. On the draft Release page, click **Edit**.
2. Paste the CHANGELOG entry into the body.
3. Toggle **Set as latest release**.
4. Untoggle **Save as draft**.
5. Click **Publish release**.

Auto-update activates immediately for clients running ≥ N-1 versions
(electron-updater polls `latest.yml` every hour by default).

### 7. Post-publish verification

- [ ] Wait ~10 min, then on a machine running the previous version:
      open the app, check UpdateChecker. It should show
      "Update available" and offer to download. Accept, restart, verify
      the new version launches.
- [ ] Tag the merge in the team Slack / journal / wherever.
- [ ] Bump `Unreleased` section at top of CHANGELOG.

---

## Rollback

A fully reproducible rollback requires only that the **previous Release**
still has its artefacts attached. GitHub Releases retain artefacts even
after deletion of the parent Release (technically on the underlying tag),
so the priority is to flip the **latest** flag without nuking the bad
release.

### Option A — soft rollback (preferred)

Use when: the new version is broken but auto-update has not yet
distributed it widely (within ~1h of publish, weekday business hours).

1. On the bad Release page, click **Edit**.
2. Untoggle **Set as latest release**. (This stops new clients from
   discovering it via `latest.yml`.)
3. Toggle **Save as draft** so it disappears from the public list.
4. Open the previous (good) Release. **Edit** → toggle **Set as latest
   release** again.
5. Wait ~30 min for CDN cache to flush.
6. Communicate to anyone already on the broken version: "we pulled
   v0.0.2; please reinstall v0.0.1 from
   https://github.com/Juli374/ads-tracker-desktop/releases/tag/v0.0.1
   and we'll ship a fix shortly."

### Option B — patch forward (preferred when Option A is too late)

Use when: the bad version has been auto-updated to >50% of users.
Rolling back means downgrade-by-design, which Squirrel doesn't support
cleanly (it can't auto-downgrade — clients are stuck on the bad version
until a higher tag arrives).

1. Identify the regression. Reproduce locally.
2. Fix on `main`. Commit, run tests.
3. `npm version patch` → bump to `v0.0.3`.
4. Push tag, run `release.yml`, smoke-test, publish.
5. Auto-update lifts users off `v0.0.2` within 1-24h.

### Option C — hard delete (avoid)

Use only if the broken release leaks secrets, ships malware, or violates
licensing. Last resort.

1. Delete the GitHub Release **and** the underlying git tag.
2. Force-push `main` to remove the version commit (only if you must —
   force-pushing `main` is a Git Safety Protocol violation; ask before
   doing this).
3. Notify any user who downloaded the artefact during the live window.
4. After cleanup: re-tag with the next patch version and ship the fix.

---

## Beta channel (future)

Not yet wired. When introduced (likely Phase L or later):

- Tag pattern: `v0.0.3-beta.1` → published with `prerelease: true` in
  `forge.config.ts`. electron-updater respects channels via the `channel`
  field in `latest.yml`.
- Beta users opt in via Settings → Application → "Receive beta
  updates" toggle (writes to `app.config.json`, read at startup,
  passes `channel: 'beta'` to electron-updater).
- Beta releases use the same workflow and signing infra; only the
  prerelease flag differs. Update this doc when implemented.

---

## When something goes wrong mid-release

| Symptom | Likely cause | Action |
|---|---|---|
| Workflow stuck on "Make installers" >30min | Notary queue depth | Wait, or cancel + restart |
| Notary returns "Invalid" | Cert not trusted by Apple chain | Renew cert, see release-env.md |
| `latest.yml` references missing artefact | Maker silently failed | Re-run `make` locally with `DEBUG=electron-forge:*`; fix; force re-run workflow |
| SmartScreen warns despite signature | New cert without reputation | Wait 1-3 months, or upgrade to EV/Azure Trusted Signing |
| Auto-update prompt not appearing on previous version | electron-updater not initialised in `app.isPackaged` path | Check `src/index.ts` calls `initAutoUpdater(mainWindow)` (Lane C / I.3) |
| Mac users see "App is damaged" | App was modified after signing (Forge bug, asar mutation, manual tampering) | Re-sign + notarize; never patch the bundle post-build |

---

## Cadence

- **Personal-use phase:** ad-hoc, whenever a meaningful chunk lands.
  No SLA.
- **Public release:** plan **weekly** patch releases (Tuesday is a
  good day — gives 4 weekdays for issues to surface), **monthly**
  minor releases. **Pause releases** if a Phase N or later observability
  signal is red (Sentry crash rate >1%, etc.).
