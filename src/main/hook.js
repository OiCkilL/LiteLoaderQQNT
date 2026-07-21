const fs = require("fs");
const path = require("path");
const electron = require("electron");
const { protocolRegister } = require("./api.js");
const { Runtime } = require("./runtime.js");

function fileLog(msg) {
    try {
        const line = `[LL hook] ${new Date().toISOString()} ${msg}\n`;
        fs.appendFileSync(path.join(process.env.TEMP || ".", "ll_hook.log"), line);
    } catch { /* ignore */ }
}

/**
 * QQ sandboxed preloads cannot reliably load multiple absolute-path scripts.
 * Build one combined preload: sandbox_preload first, then each plugin preload source.
 * Regenerated whenever plugin set changes.
 */
let _combinedPreloadPath = null;
let _combinedPreloadKey = "";

function pluginPreloadList() {
    const list = [];
    for (const plugin of Object.values(LiteLoader.plugins || {})) {
        if (!plugin || plugin.disabled || plugin.incompatible) continue;
        const p = plugin.path?.injects?.preload;
        if (typeof p === "string" && p.length > 0 && fs.existsSync(p)) {
            list.push({ slug: plugin.manifest?.slug || "?", file: p });
        }
    }
    return list;
}

function ensureCombinedPreload() {
    try {
        const root = LiteLoader?.path?.root;
        if (!root) return null;
        const sandbox = path.join(root, "src", "preload", "sandbox_preload.js");
        if (!fs.existsSync(sandbox)) {
            fileLog(`E_NO_SANDBOX_PRELOAD ${sandbox}`);
            return null;
        }
        const plugins = pluginPreloadList();
        const key = [sandbox, ...plugins.map((p) => p.file + ":" + fs.statSync(p.file).mtimeMs)].join("|");
        if (_combinedPreloadPath && key === _combinedPreloadKey && fs.existsSync(_combinedPreloadPath)) {
            return _combinedPreloadPath;
        }

        /*
         * Each segment in its own IIFE with a local require() that only allows "electron".
         * Avoids "Identifier 'contextBridge' has already been declared" when concatenating.
         */
        const wrap = (src, label, isPlugin) => {
            const safe = String(label).replace(/[^a-zA-Z0-9_-]/g, "_");
            // Plugins: soft-fail exposeInMainWorld if key already bound (re-entry / double register)
            // Plugins: prefer contextBridge; on failure also assign globalThis so ES modules
            // can still see free globals like ListViewer / mspring_theme / qqnt_toolbox.
            const patch = isPlugin
                ? `try{const __e=require("electron");const __x=__e.contextBridge.exposeInMainWorld.bind(__e.contextBridge);` +
                  `__e.contextBridge.exposeInMainWorld=function(k,v){` +
                  `try{const r=__x(k,v);try{globalThis[k]=v;}catch(_g){}return r;}` +
                  `catch(err){try{globalThis[k]=v;}catch(_g2){}` +
                  `try{__e.ipcRenderer.send("LiteLoader.Log","expose fallback "+k+": "+err);}catch(_e){}}` +
                  `};}catch(_p){}\n`
                : "";
            return (
                `(function(require){try{\n` +
                patch +
                src +
                `\ntry{require("electron").ipcRenderer.send("LiteLoader.Log","combined:${safe}:ok");}catch(_o){}` +
                `\n}catch(e){try{require("electron").ipcRenderer.send("LiteLoader.Log",` +
                `"combined:${safe}:fail:"+String(e&&e.stack||e));}catch(_e){}}\n` +
                `})(__ll_require);\n`
            );
        };

        const parts = [];
        parts.push(`/* LiteLoader combined preload — generated ${new Date().toISOString()} */\n`);
        parts.push(`"use strict";\n`);
        parts.push(`const __ll_electron = require("electron");\n`);
        parts.push(
            `function __ll_require(m){` +
            `if(m==="electron")return __ll_electron;` +
            `throw new Error("[LL combined] require blocked: "+m);` +
            `}\n`
        );
        parts.push(`/* ---- sandbox_preload ---- */\n`);
        parts.push(wrap(fs.readFileSync(sandbox, "utf8"), "sandbox", false));
        for (const p of plugins) {
            try {
                const src = fs.readFileSync(p.file, "utf8");
                parts.push(`/* ---- plugin: ${p.slug} ---- */\n`);
                parts.push(wrap(src, p.slug, true));
                fileLog(`combined+ ${p.slug} <- ${p.file}`);
            } catch (e) {
                fileLog(`combined skip ${p.slug}: ${e.message || e}`);
            }
        }

        const outDir = path.join(LiteLoader.path.data || process.env.TEMP || ".", "_ll_runtime");
        fs.mkdirSync(outDir, { recursive: true });
        const out = path.join(outDir, "combined_preload.js");
        fs.writeFileSync(out, parts.join("\n"), "utf8");
        _combinedPreloadPath = out;
        _combinedPreloadKey = key;
        fileLog(`combined preload written n_plugins=${plugins.length} path=${out}`);
        return out;
    } catch (e) {
        fileLog(`ensureCombinedPreload: ${e.message || e}`);
        return null;
    }
}

/**
 * Whether to use single combined preload (sandbox + plugins).
 * Open default: on for win32 (QQ sandbox multi-preload is unreliable), off elsewhere
 * unless LITELOADERQQNT_COMBINED_PRELOAD=1. Private Mode B launcher forces =1.
 */
function useCombinedPreload() {
    const v = process.env.LITELOADERQQNT_COMBINED_PRELOAD;
    if (v === "0" || v === "false") return false;
    if (v === "1" || v === "true") return true;
    return process.platform === "win32";
}

/** Classic multi-file preloads (upstream-style; used when combined is off). */
function classicPreloadList() {
    const root = LiteLoader?.path?.root;
    if (!root) return [];
    const list = [];
    // Prefer sandbox-safe single file when present; else classic api+module
    const sandbox = path.join(root, "src", "preload", "sandbox_preload.js");
    if (fs.existsSync(sandbox)) {
        list.push(sandbox);
    } else {
        for (const rel of ["./src/preload/api.js", "./src/preload/module.js"]) {
            const p = path.join(root, rel);
            if (fs.existsSync(p)) list.push(p);
        }
    }
    for (const plugin of Object.values(LiteLoader.plugins || {})) {
        if (plugin.disabled || plugin.incompatible) continue;
        const p = plugin.path?.injects?.preload;
        if (typeof p === "string" && p.length > 0 && fs.existsSync(p)) list.push(p);
    }
    return list;
}

/** Absolute path list for session preloads */
const LL_PRELOADS = () => {
    if (useCombinedPreload()) {
        const combined = ensureCombinedPreload();
        if (combined) return [combined];
    }
    const classic = classicPreloadList();
    if (classic.length) return classic;
    try {
        const root = LiteLoader?.path?.root;
        if (root) return [path.join(root, "src", "preload", "sandbox_preload.js")];
    } catch { /* ignore */ }
    return [];
};

function proxySend(func) {
    return new Proxy(func, {
        apply(target, thisArg, [channel, ...args]) {
            if (channel.includes("RM_IPCFROM_")) {
                if (args?.[1]?.cmdName == "nodeIKernelSessionListener/onSessionInitComplete") {
                    Runtime.triggerHooks("onLogin", [args[1].payload.uid]);
                }
            }
            return Reflect.apply(target, thisArg, [channel, ...args]);
        }
    });
}

function mergePreloads(existing) {
    const ours = LL_PRELOADS();
    const list = Array.isArray(existing)
        ? existing.filter((p) => typeof p === "string" && p.length > 0)
        : [];
    for (let i = ours.length - 1; i >= 0; i--) {
        const p = ours[i];
        const idx = list.indexOf(p);
        if (idx !== -1) list.splice(idx, 1);
        list.unshift(p);
    }
    return list;
}

function mergePreloadScripts(existing) {
    const ours = LL_PRELOADS().map((filePath) => ({ filePath, type: "frame" }));
    const list = Array.isArray(existing) ? existing.slice() : [];
    for (let i = ours.length - 1; i >= 0; i--) {
        const o = ours[i];
        const idx = list.findIndex((x) => x && x.filePath === o.filePath);
        if (idx !== -1) list.splice(idx, 1);
        list.unshift(o);
    }
    return list;
}

function registerOurPreloads(session) {
    const preloads = LL_PRELOADS();
    fileLog(`registerOurPreloads paths=${JSON.stringify(preloads)}`);
    // Use ONE registration path only — both setPreloads + registerPreloadScript
    // causes the combined file to run twice (exposeInMainWorld conflicts).
    if (typeof session.setPreloads === "function") {
        try {
            session.setPreloads(preloads);
            fileLog(`setPreloads ok n=${preloads.length}`);
            return;
        } catch (e) {
            fileLog(`setPreloads skip: ${e.message || e}`);
        }
    }
    if (typeof session.registerPreloadScript === "function") {
        for (const filePath of preloads) {
            try {
                session.registerPreloadScript({ type: "frame", filePath });
            } catch (e) {
                fileLog(`registerPreloadScript fail ${filePath}: ${e.message || e}`);
            }
        }
        fileLog(`registerPreloadScript n=${preloads.length}`);
    }
}

function patchSession(session) {
    if (!session) return;

    if (!session.__ll_protocol) {
        session.__ll_protocol = true;
        try {
            protocolRegister(session.protocol);
        } catch (e) {
            fileLog(`protocolRegister: ${e.message || e}`);
        }
    }

    // Always refresh combined preload list (plugins may load after first patch)
    registerOurPreloads(session);

    if (session.__ll_session_wrapped) return;
    session.__ll_session_wrapped = true;

    try {
        if (typeof session.setPreloads === "function") {
            const origSet = session.setPreloads.bind(session);
            const origGet = typeof session.getPreloads === "function"
                ? session.getPreloads.bind(session)
                : () => [];
            session.setPreloads = (preloads) => {
                const base = Array.isArray(preloads)
                    ? preloads.filter((p) => typeof p === "string" && p.length > 0)
                    : [];
                const merged = mergePreloads(base);
                fileLog(`setPreloads wrapped n=${merged.length}`);
                try {
                    return origSet(merged);
                } catch (e) {
                    fileLog(`origSet fail: ${e.message || e}`);
                    try {
                        return origSet(LL_PRELOADS());
                    } catch (e2) {
                        fileLog(`origSet ours fail: ${e2.message || e2}`);
                        return undefined;
                    }
                }
            };
            try {
                let cur = [];
                try { cur = origGet() || []; } catch { cur = []; }
                if (!Array.isArray(cur)) cur = [];
                session.setPreloads(cur);
                fileLog("setPreloads seeded via wrap");
            } catch (e) {
                fileLog(`setPreloads seed: ${e.message || e}`);
            }
        }
    } catch (e) {
        fileLog(`setPreloads wrap: ${e.message || e}`);
    }

    try {
        if (typeof session.getPreloadScripts === "function") {
            const orig = session.getPreloadScripts.bind(session);
            session.getPreloadScripts = (...args) => mergePreloadScripts(orig(...args));
            fileLog("getPreloadScripts wrapped");
        }
    } catch (e) {
        fileLog(`getPreloadScripts wrap: ${e.message || e}`);
    }
}

function injectWebContents(webContents) {
    if (!webContents || webContents.isDestroyed?.()) return;
    if (webContents.__ll_wc_hooks) {
        // still refresh preloads for this session
        try { patchSession(webContents.session); } catch { /* ignore */ }
        return;
    }
    webContents.__ll_wc_hooks = true;

    try {
        patchSession(webContents.session);
    } catch (e) {
        fileLog(`patchSession: ${e.message || e}`);
    }

    try {
        if (webContents._getPreloadPaths) {
            const orig = webContents._getPreloadPaths.bind(webContents);
            webContents._getPreloadPaths = () => mergePreloads(orig());
        }
    } catch (e) {
        fileLog(`_getPreloadPaths: ${e.message || e}`);
    }

    try {
        webContents.send = proxySend(webContents.send);
    } catch { /* ignore */ }

    const reassert = () => {
        try {
            patchSession(webContents.session);
        } catch (e) {
            fileLog(`reassert: ${e.message || e}`);
        }
    };

    try {
        webContents.on("did-start-loading", reassert);
        webContents.on("dom-ready", () => fileLog(`dom-ready id=${webContents.id}`));
        webContents.on("did-finish-load", async () => {
            const url = (webContents.getURL && webContents.getURL()) || "?";
            fileLog(`did-finish-load id=${webContents.id} url=${url}`);
            if (url.includes("renderer") || url.includes("app://")) {
                try {
                    const r = await webContents.executeJavaScript(`
                        (async () => {
                            try {
                                const ver = globalThis.__ll_renderer_ver || 0;
                                globalThis.__ll_renderer_ver = ver + 1;
                                await import("local://root/src/renderer.js?v=" + Date.now());
                                globalThis.__ll_renderer_loaded = true;
                                return "ok";
                            } catch (e) {
                                return "fail:" + (e && e.message ? e.message : String(e));
                            }
                        })()
                    `, true);
                    fileLog(`renderer inject id=${webContents.id} result=${r}`);
                } catch (e) {
                    fileLog(`renderer inject throw id=${webContents.id}: ${e.message || e}`);
                }
            }
        });
        webContents.on("preload-error", (_e, preloadPath, error) => {
            fileLog(`preload-error path=${preloadPath} err=${error && error.message ? error.message : error}`);
        });
    } catch (e) {
        fileLog(`wc events: ${e.message || e}`);
    }

    reassert();
    fileLog(`injectWebContents id=${webContents.id}`);
}

function proxyWindow(func) {
    return new Proxy(func, {
        construct(target, argArray, newTarget) {
            Runtime.triggerHooks("onBrowserWindowCreating", [target, argArray, newTarget]);
            const window = Reflect.construct(target, argArray, newTarget);
            injectWebContents(window.webContents);
            Runtime.triggerHooks("onBrowserWindowCreated", [window]);
            return window;
        }
    });
}

function proxyElectronModule(mod) {
    return new Proxy(mod, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (property === "BrowserWindow") return proxyWindow(value);
            return value;
        }
    });
}

function proxyElectronCacheEntry(moduleObj) {
    return new Proxy(moduleObj, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (property === "exports") return proxyElectronModule(value);
            return value;
        }
    });
}

exports.installHook = () => {
    // Rebuild combined preload now that plugins are loaded
    ensureCombinedPreload();

    if (require.cache["electron"]) {
        require.cache["electron"] = proxyElectronCacheEntry(require.cache["electron"]);
        fileLog("patched require.cache[electron]");
    } else {
        try {
            require("electron");
            if (require.cache["electron"]) {
                require.cache["electron"] = proxyElectronCacheEntry(require.cache["electron"]);
                fileLog("required+patched electron cache");
            }
        } catch (e) {
            fileLog(`electron require: ${e.message || e}`);
        }
    }

    try {
        electron.ipcMain.on("LiteLoader.Log", (_e, msg) => {
            fileLog(`[preload] ${msg}`);
            try {
                const line = `[LL preload] ${new Date().toISOString()} ${msg}\n`;
                fs.appendFileSync(path.join(process.env.TEMP || ".", "ll_preload.log"), line);
            } catch { /* ignore */ }
        });
    } catch (e) {
        fileLog(`ipc preloadLog: ${e.message || e}`);
    }

    try {
        const { app, session } = electron;
        app.on("web-contents-created", (_e, wc) => {
            try { injectWebContents(wc); }
            catch (err) { fileLog(`web-contents-created: ${err.message || err}`); }
        });
        fileLog("listening web-contents-created");

        const seedDefault = () => {
            try {
                if (session && session.defaultSession) patchSession(session.defaultSession);
            } catch (e) {
                fileLog(`defaultSession: ${e.message || e}`);
            }
        };
        if (app.isReady()) seedDefault();
        else app.whenReady().then(seedDefault).catch((e) => fileLog(`whenReady: ${e.message || e}`));
    } catch (e) {
        fileLog(`app hook: ${e.message || e}`);
    }
};

/** Call after plugins installed/removed so next window picks up new preloads */
exports.refreshPluginPreloads = () => {
    _combinedPreloadKey = "";
    ensureCombinedPreload();
};
