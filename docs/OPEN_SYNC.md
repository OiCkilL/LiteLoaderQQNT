# Open body vs private lab — sync discipline

This private repo develops **everything** on `main`.  
**Open LiteLoader body** is the subset safe to publish to:

- public mirror `OiCkilL/LiteLoaderQQNT`, and/or  
- upstream `LiteLoaderQQNT/LiteLoaderQQNT` PRs  

**Private** Windows inject / packaging stays here only.

---

## Matrix

| Area | Visibility | Notes |
|------|------------|--------|
| `src/**` | **Open** | Loader body. Prefer upstream-compatible defaults; product overrides via **env**. |
| `scripts/install-macos.sh`, `ml_install.template.js` | **Open** | mac install |
| `package.json`, `manifest.schema.json`, `LICENSE*` | **Open** | |
| `docs/OPEN_SYNC.md`, `scripts/open-*.txt`, `export-open-src.ps1` | **Open meta** | How to export |
| `runtime/**` | **Private** | LLLauncher / LLRuntime / Mode B native |
| `release/**` | **Private** | Staged Win installers & binaries |
| `reference/**` | **Local only** | Large / closed samples (gitignored) |
| `AGENTS.md` | **Private lab notes** | Do not paste wholesale into upstream README |

---

## Env knobs (open body reads these; private packaging sets them)

| Variable | Open default | Private Mode B package |
|----------|--------------|-------------------------|
| `LITELOADERQQNT_AUMID` | `LiteLoaderQQNT` (win32 only) | `OiCkilL.LiteLoaderQQNT` (launcher sets) |
| `LITELOADERQQNT_COMBINED_PRELOAD` | `1` on win32, else off | `1` (launcher sets) |
| `LITELOADERQQNT_MODE` | unset | `B` (launcher) |
| `LITELOADERQQNT_ROOT` / `PROFILE` | standard path.js | path file / Documents |
| `LITELOADERQQNT_ATTACH_ONLY` | unset | optional attach-only |

Open code must **not** hard-code `OiCkilL.*` product IDs.

---

## What is “open improvement” vs “private Mode B”

### Open (OK for upstream PR / public mirror)

- Path resolution (`path.js`), mac container profile probe  
- `local://` protocol via `fs` + MIME; shell open hardening  
- Plugin settings list: live snapshot / `api.plugin.list`, safer rows, default expanded sections  
- Renderer Runtime / settings shell singletons (double-import safe)  
- Combined preload **when** multi-preload is broken (default win32; opt-in elsewhere)  
- `sandbox_preload.js` (single-file, electron-only require)  
- Neutral diagnostics channel `LiteLoader.Log`  
- `platform_win.js` AUMID via env  

### Private (never upstream as product default)

- `LLLauncher_*` / `LLRuntime_*` inject, package.json shadow, CREATE_SUSPENDED  
- `release/windows-arm64/**` setup, closed binary layout  
- Fork-specific AUMID / shortcut branding (set only via env + private tools)  
- Integrity / sideload / dbghelp experiments under `runtime/mode_b`, `reference/`  

---

## Export open tree (for PR or public mirror)

From repo root (PowerShell):

```powershell
.\scripts\export-open-src.ps1
# → dist/open-liteloader/   (clean tree)

.\scripts\export-open-src.ps1 -OutDir D:\pr-liteloader
```

Then either:

1. Copy into a checkout of upstream and open a PR, or  
2. Push `dist/open-liteloader` contents to public remote `public`  

**Do not** `git subtree push` the whole private monorepo.

### After export checklist

- [ ] No `OiCkilL` product AUMID in `src/` (only comments in platform_win / OPEN_SYNC)  
- [ ] No `runtime/` or `release/` in the export  
- [ ] Smoke on mac (or CI): load LL, open settings, plugin list non-empty  
- [ ] Win classic (non-inject) still works if you support it; combined preload is win32 default  

---

## Suggested upstream PR split (if contributing)

| PR | Content |
|----|---------|
| A | `path.js` / mac profile + entry resolution |
| B | `local://` + shell guards |
| C | Settings plugin list + IPC snapshot |
| D | Combined / sandbox preload (Windows QQ sandbox note) |
| E | Renderer singletons + settings DOM resilience |

Keep inject launcher **out** of upstream PRs.

---

## Private product still works how?

1. Open `src/` is what lives under `Documents\LiteLoaderQQNT`.  
2. `LLLauncher` injects runtime and sets `LITELOADERQQNT_AUMID` / `COMBINED_PRELOAD` / `MODE`.  
3. `setup.bat` installs private binaries next to `QQ.exe` and copies **open** body to Documents.  
4. Before `setup` / `package.ps1`, open `src/` must be current so release package is not stale.

```text
repo src/  --package.ps1-->  release/.../LiteLoaderQQNT/
         --setup--------->  Documents/LiteLoaderQQNT/
         --export-open--->  dist/open-liteloader/  --> upstream PR
runtime/  --build-------->  release/.../bin/       (private only)
```

---

## Anti-patterns

- Editing only Documents without updating `repo/src` then packaging  
- Cherry-picking `hook.js` combined path into upstream **without** documenting win32 sandbox  
- Shipping `OiCkilL.LiteLoaderQQNT` as default AUMID in open tree  
- Pushing `release/*.dll` or inject PoCs to public/upstream  
