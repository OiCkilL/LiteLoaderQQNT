/**
 * macOS QQ entry shim (LiteLoaderQQNT)
 *
 * Install:
 *   1. Copy this file to:
 *      QQ.app/Contents/Resources/app/app_launcher/ml_install.js
 *   2. Change Resources/app/package.json:
 *        "main": "./app_launcher/ml_install.js"
 *
 * Optional env:
 *   LITELOADERQQNT_ROOT     — framework code root
 *   LITELOADERQQNT_PROFILE  — writable data root
 *
 * Important:
 *   QQ spawns helper apps (QQEXDOC / QQEXGuild / ...) that may also execute this
 *   file while process.resourcesPath points at the helper bundle (no asar).
 *   We always resolve the host QQ.app Resources/app for the stock entry, and
 *   only load LiteLoader in the main QQ process.
 */

const fs = require("fs");
const path = require("path");

const STOCK_MAIN_FALLBACK = "./application.asar/app_launcher/index.js";

function isHelperProcess() {
    // Main:   .../QQ.app/Contents/Resources
    // Helper: .../QQ.app/Contents/MacOS/QQEXDOC.app/Contents/Resources
    return String(process.resourcesPath || "").includes(`${path.sep}Contents${path.sep}MacOS${path.sep}`);
}

/** Host QQ.app Contents/Resources/app — never the helper's empty Resources. */
function mainQqApp() {
    let res = path.resolve(process.resourcesPath || "");
    const marker = `${path.sep}Contents${path.sep}MacOS${path.sep}`;
    const idx = res.indexOf(marker);
    if (idx !== -1) {
        res = path.join(res.slice(0, idx), "Contents", "Resources");
    }
    return path.join(res, "app");
}

function stockMainRel(qqApp) {
    try {
        const bak = path.join(qqApp, "package.json.liteloader-backup");
        if (fs.existsSync(bak)) {
            const pkg = JSON.parse(fs.readFileSync(bak, "utf-8"));
            if (pkg.main && !String(pkg.main).includes("ml_install") && !String(pkg.main).includes("LiteLoader")) {
                return pkg.main.startsWith("./") ? pkg.main : `./${pkg.main}`;
            }
        }
    } catch { /* ignore */ }
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(qqApp, "package.json"), "utf-8"));
        if (pkg.main && !String(pkg.main).includes("ml_install") && !String(pkg.main).includes("LiteLoader")) {
            return pkg.main.startsWith("./") ? pkg.main : `./${pkg.main}`;
        }
    } catch { /* ignore */ }
    return STOCK_MAIN_FALLBACK;
}

function requireStock(qqApp) {
    const rel = stockMainRel(qqApp);
    const abs = path.join(qqApp, rel);
    require(abs);
}

function candidates(qqApp) {
    const list = [];
    const push = (p) => { if (p) list.push(path.resolve(p)); };
    push(process.env.LITELOADERQQNT_ROOT);
    const home = process.env.HOME || "";
    push(path.join(home, "Library/Containers/com.tencent.qq/Data/Documents/LiteLoaderQQNT"));
    push(path.join(home, "Library/Containers/com.tencent.qq/Data/Library/Application Support/LiteLoaderQQNT"));
    push(path.join(qqApp, "LiteLoaderQQNT"));
    return [...new Set(list)];
}

function isLiteLoaderRoot(dir) {
    try {
        if (!dir || !fs.existsSync(dir)) return false;
        const pkgPath = path.join(dir, "package.json");
        const mainJs = path.join(dir, "src", "main.js");
        if (!fs.existsSync(pkgPath) || !fs.existsSync(mainJs)) return false;
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        return pkg.name === "liteloader-qqnt";
    } catch {
        return false;
    }
}

const qqApp = mainQqApp();

// Helper / sub-app processes: never inject LiteLoader; only chain host stock entry.
if (isHelperProcess()) {
    try {
        requireStock(qqApp);
    } catch (err) {
        console.error("[LiteLoader] helper stock entry failed:", err);
        // Do not rethrow a missing asar under helper Resources — swallow to avoid dialog spam.
        // If host stock also fails, log only; helper may not need full QQ main.
    }
} else {
    try {
        let root = null;
        for (const c of candidates(qqApp)) {
            if (isLiteLoaderRoot(c)) { root = c; break; }
        }
        if (!root) throw new Error("LiteLoader root not found under sandbox-readable paths");
        process.env.LITELOADERQQNT_ROOT = root;
        require(path.join(root, "src", "main.js"));
    } catch (err) {
        console.error("[LiteLoader] load failed, fail-open to QQ stock entry:", err);
        try {
            requireStock(qqApp);
        } catch (e2) {
            console.error("[LiteLoader] stock entry also failed:", e2);
            // Avoid uncaught exception dialog when entry is genuinely missing
        }
    }
}
