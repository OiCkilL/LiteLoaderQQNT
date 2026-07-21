const fs = require("fs");
const path = require("path");

const PACKAGE_NAME = "liteloader-qqnt";
const STOCK_MAIN_FALLBACK = "./application.asar/app_launcher/index.js";

/**
 * Walk upward from startDir to find LiteLoader package root.
 * Compatible with any install depth under src/main.
 */
function findRoot(startDir) {
    let dir = path.resolve(startDir);
    for (let i = 0; i < 8; i++) {
        const pkgPath = path.join(dir, "package.json");
        try {
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
                if (pkg.name === PACKAGE_NAME) return dir;
            }
        } catch { /* ignore unreadable package.json */ }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    // Legacy: src/main -> repo root
    return path.dirname(path.dirname(startDir));
}

function ensureDir(dir) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    return dir;
}

/**
 * Profile resolution — preserves original LiteLoader semantics:
 *   LITELOADERQQNT_PROFILE > qwqnt.framework.paths.data/LiteLoader > root
 * Optional macOS legacy probe only when env is unset and root has no data yet.
 */
function resolveProfile(root) {
    if (process.env.LITELOADERQQNT_PROFILE) {
        return path.resolve(process.env.LITELOADERQQNT_PROFILE);
    }
    if (globalThis.qwqnt?.framework?.paths?.data) {
        return path.join(globalThis.qwqnt.framework.paths.data, "LiteLoader");
    }

    // macOS: prefer existing Container Documents install if root is code-only
    // and that legacy profile already has plugins/data (non-destructive migration probe).
    if (process.platform === "darwin") {
        const legacy = path.join(
            process.env.HOME || "",
            "Library/Containers/com.tencent.qq/Data/Documents/LiteLoaderQQNT"
        );
        const rootHasData = fs.existsSync(path.join(root, "plugins")) || fs.existsSync(path.join(root, "data"));
        const legacyHasData = fs.existsSync(path.join(legacy, "plugins")) || fs.existsSync(path.join(legacy, "data"));
        if (!rootHasData && legacyHasData && path.resolve(legacy) !== path.resolve(root)) {
            return legacy;
        }
    }

    // Original default: profile lives with the package
    return root;
}

/**
 * Electron resources root for the *main* QQ.app.
 * Helper apps (QQEXDOC / QQEXGuild / ...) run with resourcesPath under
 *   QQ.app/Contents/MacOS/<Helper>.app/Contents/Resources
 * which has no application.asar — always resolve back to the host QQ.app.
 */
function resolveResourcesPath(resourcesPath = process.resourcesPath) {
    const res = path.resolve(resourcesPath || "");
    const marker = `${path.sep}Contents${path.sep}MacOS${path.sep}`;
    const idx = res.indexOf(marker);
    if (idx !== -1) {
        return path.join(res.slice(0, idx), "Contents", "Resources");
    }
    return res;
}

function isHelperProcess(resourcesPath = process.resourcesPath) {
    return String(resourcesPath || "").includes(`${path.sep}Contents${path.sep}MacOS${path.sep}`);
}

function resolveQqApp() {
    return path.join(resolveResourcesPath(), "app");
}

/**
 * Official QQ entry relative to qq_app (for installPathPkgJson.main).
 * Prefer live package.json main; fall back to known asar path (reference 6.9.96).
 */
function normalizeMainField(main) {
    if (!main) return null;
    const s = String(main);
    // Reject loader / Mode B shims so stock entry never points at ourselves.
    // (Mode B CreateFileW shadow rewrites package.json main in-memory only.)
    if (
        s.includes("ml_install") ||
        s.includes("LiteLoader") ||
        s.includes("ll_mode_b") ||
        s.includes("mode_b_bridge") ||
        s.includes("ll_mode_b_bridge") ||
        s.includes("ll_bootstrap") ||
        s.includes("ll_bootstrap.js")
    ) {
        return null;
    }
    return s.startsWith("./") ? s : `./${s}`;
}

function resolveStockMain(qq_app) {
    // Prefer pre-patch backup written by scripts/install-macos.sh
    for (const name of ["package.json.liteloader-backup", "package.json"]) {
        try {
            const main = normalizeMainField(
                JSON.parse(fs.readFileSync(path.join(qq_app, name), "utf-8")).main
            );
            if (main) return main;
        } catch { /* ignore */ }
    }
    return STOCK_MAIN_FALLBACK;
}

/**
 * Single source of truth for LiteLoader paths.
 * Public surface used by plugins remains: root / profile / data / plugins.
 * Extra fields (qq_app, entry, entry_main, main) are additive and optional for consumers.
 */
function resolvePaths(options = {}) {
    const startDir = options.startDir || __dirname;
    const root = process.env.LITELOADERQQNT_ROOT
        ? path.resolve(process.env.LITELOADERQQNT_ROOT)
        : findRoot(startDir);

    const profile = resolveProfile(root);
    const data = path.join(profile, "data");
    const plugins = path.join(profile, "plugins");
    const qq_app = resolveQqApp();
    const entry_main = resolveStockMain(qq_app);
    const entry = path.join(qq_app, entry_main);

    // Ensure writable profile layout exists (no-op if already present)
    ensureDir(data);
    ensureDir(plugins);

    return {
        root,
        profile,
        data,
        plugins,
        qq_app,
        entry_main,
        entry,
        main: path.join(root, "src", "main.js")
    };
}

exports.PACKAGE_NAME = PACKAGE_NAME;
exports.STOCK_MAIN_FALLBACK = STOCK_MAIN_FALLBACK;
exports.findRoot = findRoot;
exports.resolveProfile = resolveProfile;
exports.resolveResourcesPath = resolveResourcesPath;
exports.isHelperProcess = isHelperProcess;
exports.resolveStockMain = resolveStockMain;
exports.resolveQqApp = resolveQqApp;
exports.resolvePaths = resolvePaths;
