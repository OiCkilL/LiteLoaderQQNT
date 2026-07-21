// Ensure global LiteLoader + protocol/API are ready before other main modules.
const { paths } = require("./main/api.js");
const store = require("./main/store.js");
const { installHook } = require("./main/hook.js");
const { loadAllPlugins } = require("./main/loader.js");
const { Runtime } = require("./main/runtime.js");

function fileLog(msg) {
    try {
        const fs = require("fs");
        const path = require("path");
        const line = `[LL main] ${new Date().toISOString()} ${msg}\n`;
        fs.appendFileSync(path.join(process.env.TEMP || ".", "ll_main.log"), line);
    } catch { /* ignore */ }
}

// Windows taskbar AppUserModelID (open-neutral default; private packaging sets env).
try {
    require("./main/platform_win.js").applyAppUserModelId(fileLog);
} catch (e) {
    fileLog(`platform_win: ${e && e.message ? e.message : e}`);
}

const attachOnly =
    process.env.LITELOADERQQNT_ATTACH_ONLY === "1" ||
    process.env.LITELOADERQQNT_MODE === "attach";

fileLog(`root=${paths.root} entry=${paths.entry} entry_main=${paths.entry_main} attachOnly=${attachOnly}`);

// Plugins first so combined preload includes them when hooks install
loadAllPlugins();
{
    const slugs = Object.keys(LiteLoader.plugins);
    fileLog(`plugins=${slugs.length} [${slugs.join(", ")}]`);
    for (const p of Object.values(LiteLoader.plugins)) {
        fileLog(
            `plugin ${p.manifest?.slug}: disabled=${!!p.disabled} incompatible=${!!p.incompatible}` +
            ` main=${!!p.path?.injects?.main} preload=${!!p.path?.injects?.preload} renderer=${!!p.path?.injects?.renderer}`
        );
    }
}

const config = LiteLoader.api.config.get("LiteLoader", require("./common/static/config.json"));
for (const slug in config.deleting_plugins) store.deletePlugin(slug, [true, true], true);
for (const slug in config.installing_plugins) store.installPlugin(slug);
// Rescan after install/delete mutations
loadAllPlugins();

for (const plugin of Object.values(LiteLoader.plugins)) {
    if (plugin.disabled || plugin.incompatible || !plugin.path.injects.main) continue;
    try {
        Runtime.registerPlugin(plugin, require(plugin.path.injects.main));
        fileLog(`plugin main OK: ${plugin.manifest.slug}`);
    } catch (error) {
        fileLog(`plugin main FAIL ${plugin.manifest.slug}: ${error && error.stack ? error.stack : error}`);
        console.log(`[Main] [${plugin.manifest.slug}]: `, error);
    }
}

// Hooks after plugins known → combined preload includes plugin bridges
installHook();

// Mode B attach-only: stock remains Electron main; we only install hooks/preload.
if (attachOnly) {
    fileLog("attach-only: skip require(stock); stock main continues after --require");
} else if (!globalThis.qwqnt) {
    // entry_main matches official package.json main shape (./application.asar/...)
    // Always points at host QQ.app (path.js rewrites helper resourcesPath).
    const main_path = paths.entry_main;
    const t0 = Date.now();
    fileLog(`require stock entry begin ${paths.entry}`);
    try {
        require(paths.entry);
        fileLog(`require stock entry ok in ${Date.now() - t0}ms`);
    } catch (error) {
        fileLog(`require stock entry FAIL: ${error && error.stack ? error.stack : error}`);
        throw error;
    }
    setImmediate(() => {
        try {
            if (global.launcher?.installPathPkgJson) {
                global.launcher.installPathPkgJson.main = main_path;
            }
        } catch (error) {
            console.log("[Main] restore installPathPkgJson.main failed:", error);
        }
    });
} else {
    fileLog("skip stock entry: globalThis.qwqnt present");
}
