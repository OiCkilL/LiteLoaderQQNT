# Handoff for Mac main agent — open body vs private Mode B

**Read this file first** when continuing LiteLoader work on the Mac host.  
Canonical detail also lives in `docs/OPEN_SYNC.md` and lab notes in `AGENTS.md` (private; do not paste wholesale into upstream README).

---

## Repo and roles

| Item | Value |
|------|--------|
| Daily remote (`origin`) | `OiCkilL/LiteLoaderQQNT-private` |
| Open loader body | Primarily `src/**` — eligible for upstream / public mirror |
| Private Windows product | `runtime/**` (LLLauncher, LLRuntime, inject), `release/windows-arm64/**` |
| Export tooling | `scripts/export-open-src.ps1`, `scripts/open-allowlist.txt`, `scripts/open-denylist.txt` |

---

## What you (Mac agent) should do

1. **Open features** → change only open-eligible paths (`src/`, mac install scripts under `scripts/install-macos.sh`, `ml_install.template.js`, package metadata).  
   Do **not** fold inject/launcher into patches meant for upstream.

2. **Before upstream or public sync**, export a clean tree — do **not** subtree-push the whole private monorepo:

```powershell
# From private repo root (Windows or PowerShell on Mac if available)
.\scripts\export-open-src.ps1
# → dist/open-liteloader/
```

Copy `dist/open-liteloader/*` into an **upstream** clone and open a PR, or push to the public mirror.

3. **Must not ship as upstream defaults**
   - Hard-coded product AppUserModelID (fork brand)
   - `runtime/`, `release/`, inject PoCs, large `reference/` binaries
   - Dumping full `AGENTS.md` into upstream docs

4. **Open code uses env vars**; private packaging sets them (no brand hardcode in open `src/`):

| Variable | Open default | Private Mode B launcher sets |
|----------|--------------|------------------------------|
| `LITELOADERQQNT_AUMID` | `LiteLoaderQQNT` (win32 only) | Product id matching pinned shortcuts |
| `LITELOADERQQNT_COMBINED_PRELOAD` | on for win32, else off | `1` |
| `LITELOADERQQNT_MODE` | unset | `B` |
| `LITELOADERQQNT_ROOT` / `PROFILE` | `path.js` rules | path file / Documents |

Related open pieces: `src/main/platform_win.js`, combined-preload policy in `src/main/hook.js`, diagnostic channel **`LiteLoader.Log`** (not a ModeB-specific channel name).

---

## Open improvements (OK to upstream / public)

- Settings plugin list: live snapshot / `api.plugin.list`, safer rows, sections expanded by default  
- `local://` via `fs` + MIME; icon fetch must not inject protocol error text into the UI  
- Renderer `Runtime` + settings shell **globalThis singletons** (safe under double `import`)  
- Central path resolution + mac container profile probe  
- Combined / sandbox preload for Windows QQ multi-preload sandbox issues (document as win32 strategy)

Suggested upstream PR split (see also `OPEN_SYNC.md`): path → local:// → settings list → combined preload (win) → renderer singletons.

---

## Private only (never as upstream product default)

- Mode B: `LLLauncher_*` / `LLRuntime_*`, package.json shadow, CREATE_SUSPENDED inject  
- `release/windows-arm64` installers and arm64 binaries  
- Lab probes, `runtime/mode_b`, closed dbghelp / integrity experiments under `reference/`

Private product wiring:

```text
open src/     → Documents\LiteLoaderQQNT (+ release packaged copy)
runtime/      → LLLauncher sets env + injects LLRuntime (not for upstream)
```

---

## Pitfalls (so Mac sessions do not re-debug Win-only mess)

1. **Live Windows install root** is `%USERPROFILE%\Documents\LiteLoaderQQNT`.  
   `setup.bat` can **overwrite** it from `release/.../LiteLoaderQQNT`.  
   After editing `src/`: refresh package (`package.ps1`) or robocopy `src` → Documents, **delete** `data/_ll_runtime/combined_preload.js`, fully quit QQ, start via **QQ Launcher**.

2. **“Plugins load but LL settings list is empty”** was stale body + combined-preload cache after setup, not a mac-only missing feature. Main log can show `plugins=3` while the renderer still had an old snapshot/UI.

3. **list-viewer install TLS** (`Client network socket disconnected before secure TLS connection was established`) is the **plugin main-process HTTPS** path (mirrors like ghproxy, timeouts, GFW).  
   **Do not patch third-party plugin code** for this. User-side: turn off `useMirror`, raise timeout, use a working proxy. Unrelated to Mode B inject.

---

## Lab split (unchanged)

| Work | Where |
|------|--------|
| IDA / static PE | **Mac host only** |
| Build ARM64, Procmon, install QQ, run Launcher | **Windows ARM VM** |
| Do not fix IDA activation inside the VM | — |

Pull private `origin` first; prefer this file + `OPEN_SYNC.md` over re-deriving from chat history.

---

## One-line alignment

> Open changes only in `src` (+ open scripts) and `export-open-src.ps1`; private only in `runtime`/`release`; upstream via export; branding via env.

---

## Quick commands

```text
# Mac / any: pull private lab
git pull origin main
# read docs/HANDOFF_MAC.md  (this file)
# read docs/OPEN_SYNC.md

# Export open body for upstream PR
pwsh ./scripts/export-open-src.ps1   # or Windows PowerShell
```
