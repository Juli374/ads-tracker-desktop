# scraper-sidecar (populated in CI)

This directory is shipped into the packaged app via Forge `extraResource`
(`forge.config.ts`). At runtime `src/main/scraper/scraperSidecar.ts` resolves
the PyInstaller binary at `<resources>/scraper-sidecar/<os>/<exe>`:

```
scraper-sidecar/
├── darwin/amazon-scraper-sidecar       # macOS build (from a macOS runner)
└── win32/amazon-scraper-sidecar.exe    # Windows build (from a Windows runner)
```

The binary is **built in CI** (`.github/workflows/release.yml`) from the private
repo `Juli374/amazon-scrapers` — it is **not** committed here, and not built by a
local `npm run package`. The per-OS subfolder is dropped in by the matrix runner
before `electron-forge package/make`.

This `README.md` exists only so the directory is tracked by git: Forge's
`extraResource` copy (`fs-extra.copy`) errors with `ENOENT` if the path is
missing, so the directory must exist even when no binary has been built yet (a
local build, or a CI run without the `SCRAPER_REPO_TOKEN` secret). When the
sidecar is absent the app still runs — the scheduler logs "binary not found" and
re-arms on the next cycle.

To build + place the binary manually for local testing, see
`amazon-scrapers/integration/packaging/README.md`, or set the
`SCRAPER_SIDECAR_PATH` env var to an absolute path to a built binary.
