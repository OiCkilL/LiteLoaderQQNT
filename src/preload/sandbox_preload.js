/**
 * Sandbox-safe single preload: ONLY require("electron").
 * QQ runs preloads in sandbox_bundle — relative requires (./api.js) fail.
 */
const { ipcRenderer, contextBridge } = require("electron");

function log(msg) {
    try { ipcRenderer.send("LiteLoader.Log", String(msg)); } catch { /* ignore */ }
}

try {
    log("sandbox_preload start");

    const sendSync = (method, args) =>
        ipcRenderer.sendSync("LiteLoader.LiteLoader.LiteLoader", method, args);

    const data = sendSync([], []) || {};
    // Prefer live plugins from dedicated path if snapshot missed them
    let plugins = data.plugins && typeof data.plugins === "object" ? data.plugins : {};
    if (!Object.keys(plugins).length) {
        const again = sendSync(["plugins"], []) || {};
        if (again && typeof again === "object" && !again.__error) {
            plugins = again;
            data.plugins = plugins;
        }
    }
    const LiteLoader = {
        ...data,
        plugins,
        api: {
            config: {
                get: async (...args) => sendSync(["api", "config", "get"], args),
                set: async (...args) => sendSync(["api", "config", "set"], args)
            },
            plugin: {
                install: async (...args) => sendSync(["api", "plugin", "install"], args),
                delete: async (...args) => sendSync(["api", "plugin", "delete"], args),
                disable: async (...args) => sendSync(["api", "plugin", "disable"], args),
                /** Live list from main (settings page should use this if plugins looks empty). */
                list: async () => sendSync(["plugins"], []) || {}
            },
            openExternal: async (...args) => sendSync(["api", "openExternal"], args),
            openPath: async (...args) => sendSync(["api", "openPath"], args),
            /** Full serializable snapshot refresh */
            snapshot: async () => sendSync([], []) || {}
        }
    };

    // contextIsolation on → contextBridge; off → assign main world globals directly
    let exposed = false;
    try {
        contextBridge.exposeInMainWorld("LiteLoader", LiteLoader);
        exposed = true;
        log("exposeInMainWorld ok");
    } catch (e) {
        log("exposeInMainWorld skip: " + (e && e.message ? e.message : e));
        try {
            // no isolation: preload shares world with page
            globalThis.LiteLoader = LiteLoader;
            exposed = true;
            log("assigned globalThis.LiteLoader");
        } catch (e2) {
            log("global assign fail: " + e2);
        }
    }
    const pkeys = Object.keys(LiteLoader.plugins || {});
    log(
        "LiteLoader exposed=" + exposed +
        " root=" + (LiteLoader.path && LiteLoader.path.root) +
        " plugins=" + pkeys.length +
        " [" + pkeys.join(",") + "]"
    );

    const loadRenderer = (moduleUrl) => {
        import(moduleUrl).then(
            () => console.log("[LL] renderer loaded"),
            (e) => console.error("[LL] renderer import failed", e)
        );
        return true;
    };
    try {
        contextBridge.executeInMainWorld({
            func: loadRenderer,
            args: ["local://root/src/renderer.js?v=" + Date.now()]
        });
        log("renderer import requested via contextBridge");
    } catch (e) {
        log("executeInMainWorld skip: " + (e && e.message ? e.message : e));
        try {
            loadRenderer("local://root/src/renderer.js?v=" + Date.now());
            log("renderer import requested in-place");
        } catch (e2) {
            log("renderer import fail: " + e2);
        }
    }
} catch (e) {
    log("sandbox_preload FAIL: " + (e && e.stack ? e.stack : e));
}
