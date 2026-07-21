import "./renderer/components/renderer.js";
import "./renderer/triggers/renderer.js";
import { installHook } from "./renderer/hook.js"
import { Runtime } from "./renderer/runtime.js"

// Guard against concurrent cache-busted double imports of this module
const g = globalThis;
if (!g.__ll_renderer_load__) g.__ll_renderer_load__ = { started: false, done: false, promise: null };

installHook();

function pluginRendererUrl(absPath) {
    // Prefer local://root/ relative so protocol handler resolves under LiteLoader root
    try {
        const root = LiteLoader.path.root.replace(/\\/g, "/").replace(/\/+$/, "");
        const full = String(absPath).replace(/\\/g, "/");
        const prefix = root.endsWith("/") ? root : root + "/";
        if (full.toLowerCase().startsWith(prefix.toLowerCase())) {
            const rel = full.slice(prefix.length).replace(/^\/+/, "");
            return `local://root/${rel}?v=${Date.now()}`;
        }
        // Absolute Windows path: local:///C:/...
        if (/^[a-zA-Z]:\//.test(full)) return `local:///${full}?v=${Date.now()}`;
    } catch { /* fall through */ }
    return `local:///${String(absPath).replace(/\\/g, "/")}?v=${Date.now()}`;
}

function rlog(msg) {
    try { console.log(`[Renderer] ${msg}`); } catch { /* ignore */ }
    try {
        // Surface into main log via existing preload log channel if bridge allows
        const { ipcRenderer } = globalThis.__ll_ipc || {};
        if (ipcRenderer?.send) ipcRenderer.send("LiteLoader.Log", `[renderer] ${msg}`);
    } catch { /* ignore */ }
}

async function loadPluginRenderers() {
    const plugins = Object.values(LiteLoader.plugins || {});
    rlog(`loadPluginRenderers n=${plugins.length} already=${Runtime.pluginCount()}`);
    for (const plugin of plugins) {
        if (plugin.disabled || plugin.incompatible || !plugin.path?.injects?.renderer) continue;
        const slug = plugin.manifest?.slug || "?";
        if (Runtime.hasPlugin(slug)) {
            rlog(`skip already registered ${slug}`);
            continue;
        }
        const url = pluginRendererUrl(plugin.path.injects.renderer);
        try {
            const mod = await import(url);
            Runtime.registerPlugin(plugin, mod);
            rlog(`plugin OK ${slug} exports=[${Object.keys(mod || {}).join(",")}] ListViewer=${typeof globalThis.ListViewer}`);
        } catch (error) {
            rlog(`plugin FAIL ${slug} ${url}: ${error && (error.stack || error.message) || error}`);
            console.error(`[Renderer] [${slug}] FAIL ${url}:`, error);
        }
    }
    rlog(`done slugs=[${Runtime.slugs().join(",")}] ListViewer=${typeof globalThis.ListViewer}`);
}

if (!g.__ll_renderer_load__.promise) {
    g.__ll_renderer_load__.started = true;
    g.__ll_renderer_load__.promise = loadPluginRenderers()
        .catch((e) => rlog(`loadPluginRenderers throw: ${e && e.stack || e}`))
        .finally(() => { g.__ll_renderer_load__.done = true; });
}
await g.__ll_renderer_load__.promise;