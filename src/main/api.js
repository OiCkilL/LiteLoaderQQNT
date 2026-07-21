const path = require("path");
const { pathToFileURL, fileURLToPath } = require("url");
const electron = require("electron");
const store = require("./store.js");
const { resolvePaths } = require("./path.js");

const paths = resolvePaths();

const LiteLoader = Object.create(null);

LiteLoader.plugins = Object.create(null);

// Public path API — keep original field names for plugin compatibility
LiteLoader.path = Object.create(null);
LiteLoader.path.root = paths.root;
LiteLoader.path.profile = paths.profile;
LiteLoader.path.data = paths.data;
LiteLoader.path.plugins = paths.plugins;
// Additive (non-breaking) fields for installers / diagnostics
LiteLoader.path.qq_app = paths.qq_app;
LiteLoader.path.entry = paths.entry;
LiteLoader.path.entry_main = paths.entry_main;

LiteLoader.package = Object.create(null);
LiteLoader.package.liteloader = require(path.join(LiteLoader.path.root, "package.json"));
LiteLoader.package.qqnt = require(path.join(paths.qq_app, "package.json"));

LiteLoader.versions = Object.create(null);
LiteLoader.versions.liteloader = LiteLoader.package.liteloader.version;
LiteLoader.versions.qqnt = LiteLoader.package.qqnt.version;
LiteLoader.versions.electron = process.versions.electron;
LiteLoader.versions.node = process.versions.node;
LiteLoader.versions.chrome = process.versions.chrome;

LiteLoader.os = Object.create(null);
LiteLoader.os.platform = process.platform;

LiteLoader.api = Object.create(null);

// --- shell hardening (Windows Store / app-files false opens) ---
// new URL("C:\\Users\\...") → protocol "c:"; openExternal then confuses ShellExecute.
const fs = require("fs");
const { execFile } = require("child_process");

function shellLog(kind, value) {
    const line = `[LL shell] ${new Date().toISOString()} ${kind} ${JSON.stringify(String(value ?? ""))}\n`;
    for (const dir of [process.env.TEMP, process.env.TMP, LiteLoader.path?.profile, paths.root, "."]) {
        if (!dir) continue;
        try {
            fs.appendFileSync(path.join(dir, "ll_shell.log"), line);
            return;
        } catch { /* try next */ }
    }
}

function openWithExplorer(target) {
    let p = String(target || "").trim();
    if (!p) return Promise.resolve("empty path");
    if (/^file:/i.test(p)) {
        try { p = fileURLToPath(p); } catch { /* keep */ }
    }
    // Normalize forward slashes on Windows
    if (process.platform === "win32") {
        p = p.replace(/\//g, "\\");
        // explorer.exe is reliable; shell.openPath has been reported to hit Store on some builds
        shellLog("explorer", p);
        return new Promise((resolve) => {
            execFile("explorer.exe", [p], (err) => {
                if (err) shellLog("explorer.err", err.message || err);
                resolve(err ? String(err.message || err) : "");
            });
        });
    }
    shellLog("openPath.fallback", p);
    return electron.shell.openPath(p);
}

// Monkey-patch electron.shell so *any* caller (not only LiteLoader.api) is gated
const _shellOpenExternal = electron.shell.openExternal.bind(electron.shell);
const _shellOpenPath = electron.shell.openPath.bind(electron.shell);
electron.shell.openExternal = (url, options) => {
    const s = String(url ?? "").trim();
    shellLog("RAW.openExternal", s);
    if (/^https?:\/\//i.test(s) || /^(tg|mailto):/i.test(s)) {
        return _shellOpenExternal(s, options);
    }
    shellLog("RAW.openExternal.BLOCKED->explorer", s);
    return openWithExplorer(s);
};
electron.shell.openPath = (p) => {
    shellLog("RAW.openPath", p);
    return openWithExplorer(p);
};

LiteLoader.api.openExternal = (url) => {
    if (url == null || url === "") return false;
    const s = String(url).trim();
    shellLog("api.openExternal", s);
    if (/^https?:\/\//i.test(s) || /^(tg|mailto):/i.test(s)) {
        _shellOpenExternal(s);
        return true;
    }
    openWithExplorer(s);
    return true;
};
LiteLoader.api.openPath = (p) => {
    shellLog("api.openPath", p);
    openWithExplorer(p);
    return true;
};

// Block unexpected in-page navigations / window.open to non-http targets
try {
    electron.app.on("web-contents-created", (_e, wc) => {
        try {
            wc.setWindowOpenHandler(({ url }) => {
                shellLog("windowOpen", url);
                if (/^https?:\/\//i.test(url) || /^(tg|mailto):/i.test(url)) {
                    _shellOpenExternal(url);
                } else if (url && url !== "about:blank") {
                    openWithExplorer(url);
                }
                return { action: "deny" };
            });
            wc.on("will-navigate", (event, url) => {
                // Allow app:// and local:// and devtools; block weird external navigations
                if (/^(https?:|app:|local:|devtools:|chrome-extension:)/i.test(url)) return;
                shellLog("will-navigate.block", url);
                event.preventDefault();
                if (url) openWithExplorer(url);
            });
        } catch (err) {
            shellLog("wc.shellGuard.err", err.message || err);
        }
    });
} catch (err) {
    shellLog("app.shellGuard.err", err.message || err);
}

shellLog("shell.guard.ready", "ok");

LiteLoader.api.config = Object.create(null);
LiteLoader.api.config.set = store.setPluginConfig;
LiteLoader.api.config.get = store.getPluginConfig;

LiteLoader.api.plugin = Object.create(null);
LiteLoader.api.plugin.install = store.installPlugin;
LiteLoader.api.plugin.delete = store.deletePlugin;
LiteLoader.api.plugin.disable = store.disablePlugin;

Object.defineProperty(globalThis, "LiteLoader", {
    get() {
        const stack = new Error().stack.split("\n")[2];
        const allowed = [LiteLoader.path.root, LiteLoader.path.profile];
        return allowed.some((item) => stack.includes(item)) ? LiteLoader : null;
    }
});

/** Serializable snapshot for renderer/preload (no functions, no cycles). */
function snapshotLiteLoader() {
    try {
        const plugins = LiteLoader.plugins || {};
        const slugs = Object.keys(plugins);
        try {
            const fs = require("fs");
            const p = require("path");
            fs.appendFileSync(
                p.join(process.env.TEMP || ".", "ll_main.log"),
                `[LL api] snapshot plugins=${slugs.length} [${slugs.join(", ")}]\n`
            );
        } catch { /* ignore */ }
        return JSON.parse(JSON.stringify({
            path: LiteLoader.path,
            versions: LiteLoader.versions,
            os: LiteLoader.os,
            package: LiteLoader.package,
            plugins
        }));
    } catch (e) {
        try {
            const fs = require("fs");
            const p = require("path");
            fs.appendFileSync(
                p.join(process.env.TEMP || ".", "ll_main.log"),
                `[LL api] snapshot fail: ${e && e.message ? e.message : e}\n`
            );
        } catch { /* ignore */ }
        return {
            path: {
                root: LiteLoader.path?.root,
                profile: LiteLoader.path?.profile,
                data: LiteLoader.path?.data,
                plugins: LiteLoader.path?.plugins
            },
            versions: LiteLoader.versions || {},
            os: LiteLoader.os || {},
            package: {},
            plugins: {}
        };
    }
}

electron.ipcMain.on("LiteLoader.LiteLoader.LiteLoader", (event, method, args) => {
    try {
        if (!method || !method.length) {
            event.returnValue = snapshotLiteLoader();
            return;
        }
        // Walk property path; call only if final value is a function
        let obj = LiteLoader;
        for (const key of method) {
            obj = obj?.[key];
        }
        if (typeof obj === "function") {
            event.returnValue = obj(...(args || []));
        } else if (obj === undefined) {
            event.returnValue = null;
        } else {
            // Plain data (e.g. ["plugins"]) — structured-clone via JSON
            event.returnValue = JSON.parse(JSON.stringify(obj));
        }
    } catch (e) {
        event.returnValue = null;
        try {
            const fs = require("fs");
            const p = require("path");
            fs.appendFileSync(
                p.join(process.env.TEMP || ".", "ll_main.log"),
                `[LL api] ipc ${JSON.stringify(method)}: ${e && e.message ? e.message : e}\n`
            );
        } catch { /* ignore */ }
    }
});

// standard+secure helps ES module import() of local:// in modern Electron/QQ
try {
    electron.protocol.registerSchemesAsPrivileged([
        {
            scheme: "local",
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                corsEnabled: true,
                stream: true,
                bypassCSP: true,
                allowServiceWorkers: true
            }
        }
    ]);
} catch (e) {
    // Already registered or app too late — keep process alive
    try {
        const fs = require("fs");
        const p = require("path");
        fs.appendFileSync(
            p.join(process.env.TEMP || ".", "ll_main.log"),
            `[LL api] registerSchemesAsPrivileged: ${e.message || e}\n`
        );
    } catch { /* ignore */ }
}

electron.app.on("ready", () => {
    const schemes = ["local"];
    const old_schemes = electron.app.commandLine.getSwitchValue("fetch-schemes");
    const new_schemes = [old_schemes, ...schemes].join(",");
    electron.app.commandLine.appendSwitch("fetch-schemes", new_schemes);
});

/**
 * local:// protocol — host semantics unchanged for plugin compatibility:
 *   local://root/...     → LiteLoader.path.root
 *   local://profile/...  → LiteLoader.path.profile
 *   local://<host>/...   → absolute path (host + pathname)
 *
 * Read via fs (not net.fetch(file://)): QQ/Electron often returns FILE_NOT_FOUND
 * for net.fetch on absolute paths under user profile, which then polluted the
 * settings sidebar when appropriateIcon() injected the error body as SVG.
 */
function mimeForExt(ext) {
    switch (String(ext || "").toLowerCase()) {
        case ".js":
        case ".mjs":
        case ".cjs":
            return "text/javascript; charset=utf-8";
        case ".css":
            return "text/css; charset=utf-8";
        case ".html":
        case ".htm":
            return "text/html; charset=utf-8";
        case ".svg":
            return "image/svg+xml";
        case ".json":
            return "application/json; charset=utf-8";
        case ".png":
            return "image/png";
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".gif":
            return "image/gif";
        case ".webp":
            return "image/webp";
        case ".woff":
            return "font/woff";
        case ".woff2":
            return "font/woff2";
        case ".ttf":
            return "font/ttf";
        case ".map":
            return "application/json; charset=utf-8";
        default:
            return "application/octet-stream";
    }
}

function resolveLocalUrl(reqUrl) {
    // Prefer raw URL; decodeURI can break already-decoded Windows paths
    let raw = String(reqUrl || "");
    try { raw = decodeURI(raw); } catch { /* keep raw */ }
    const u = new URL(raw);
    const host = (u.hostname || u.host || "").toString();
    // pathname: strip leading slashes; drop query (cache-bust) already excluded by URL API
    let filepath = decodeURIComponent(u.pathname || "").replace(/^\/+/, "");
    // list-viewer style: C://Users/... → C:/Users/...
    filepath = filepath.replace(/^([a-zA-Z]):\/\//, "$1:/");
    filepath = path.normalize(filepath);

    let absolute;
    switch (host) {
        case "root":
            absolute = path.join(LiteLoader.path.root, filepath);
            break;
        case "profile":
            absolute = path.join(LiteLoader.path.profile, filepath);
            break;
        default:
            // Absolute Windows path: local:///C:/Users/... (host empty)
            // or local://C/Users/... (host = drive letter)
            if (!host && /^[a-zA-Z]:[\\/]/.test(filepath)) {
                absolute = path.normalize(filepath);
            } else if (/^[a-zA-Z]$/.test(host)) {
                // host "C", pathname "/Users/..." or "Users/..."
                const rest = filepath.replace(/^[\\/]+/, "");
                absolute = path.normalize(`${host}:\\${rest}`);
            } else if (!host && filepath) {
                absolute = path.normalize(filepath);
            } else {
                absolute = path.normalize(path.join(host, filepath));
            }
            break;
    }
    return absolute;
}

function localProtocolLog(msg) {
    try {
        fs.appendFileSync(
            path.join(process.env.TEMP || ".", "ll_local_protocol.log"),
            `[LL local] ${new Date().toISOString()} ${msg}\n`
        );
    } catch { /* ignore */ }
}

exports.protocolRegister = (protocol) => {
    if (!protocol.isProtocolRegistered("local")) {
        protocol.handle("local", async (req) => {
            let absolute = "";
            try {
                absolute = resolveLocalUrl(req.url);
                // Security: only serve files that exist as regular files
                let st;
                try {
                    st = fs.statSync(absolute);
                } catch {
                    localProtocolLog(`MISS ${req.url} -> ${absolute}`);
                    return new Response("", {
                        status: 404,
                        headers: { "Content-Type": "text/plain; charset=utf-8" }
                    });
                }
                if (!st.isFile()) {
                    localProtocolLog(`NOT_FILE ${req.url} -> ${absolute}`);
                    return new Response("", { status: 404 });
                }
                const buf = fs.readFileSync(absolute);
                const mime = mimeForExt(path.extname(absolute));
                return new Response(buf, {
                    status: 200,
                    headers: {
                        "Content-Type": mime,
                        "Access-Control-Allow-Origin": "*",
                        "Cache-Control": "no-cache"
                    }
                });
            } catch (e) {
                localProtocolLog(`ERR ${req.url} abs=${absolute} ${e && e.message ? e.message : e}`);
                // Empty body — never put error text into SVG icon slots
                return new Response("", {
                    status: 404,
                    headers: { "Content-Type": "text/plain; charset=utf-8" }
                });
            }
        });
    }
};

// Export resolved paths for main bootstrap (not part of public LiteLoader surface)
exports.paths = paths;
