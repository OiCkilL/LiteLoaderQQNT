/**
 * Single preload entry (sandbox-safe: no fs/path Node builtins).
 * api.js → expose LiteLoader → run preload.js (renderer inject) via Node require.
 */
const { contextBridge, ipcRenderer } = require("electron");

function log(msg) {
    try {
        ipcRenderer.send("LiteLoader.Log", String(msg));
    } catch { /* ignore */ }
    try {
        console.log("[LL preload]", msg);
    } catch { /* ignore */ }
}

try {
    log(`bootstrap start`);

    const apiExports = require("./api.js");
    const LL = apiExports.LiteLoader;
    if (!LL || !LL.path || !LL.path.root) {
        log(`E_NO_LL_API`);
    } else {
        log(`LiteLoader ok root=${LL.path.root}`);
    }

    // preload.js expects free identifier LiteLoader (was provided by module.js sandbox)
    globalThis.LiteLoader = LL;

    const { Runtime } = require("./runtime.js");

    for (const plugin of Object.values(LL.plugins || {})) {
        if (plugin.disabled || plugin.incompatible || !plugin.path?.injects?.preload) continue;
        try {
            Runtime.registerPlugin(plugin, require(plugin.path.injects.preload));
        } catch (error) {
            log(`plugin preload ${plugin.manifest?.slug}: ${error}`);
        }
    }

    // Load renderer into main world (same as src/preload.js)
    contextBridge.executeInMainWorld({
        func: (moduleUrl) => (import(moduleUrl), true),
        args: ["local://root/src/renderer.js"]
    });
    log("executeInMainWorld renderer.js requested");
} catch (e) {
    log(`bootstrap FAIL: ${e && e.stack ? e.stack : e}`);
}
