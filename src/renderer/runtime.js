/**
 * Shared across repeated cache-busted imports of renderer.js
 * (preload + did-finish-load both import with ?v=timestamp).
 */
function pluginMap() {
    const g = globalThis;
    if (!g.__ll_renderer_plugins__) g.__ll_renderer_plugins__ = new Map();
    return g.__ll_renderer_plugins__;
}

function errMsg(error) {
    return error && (error.stack || error.message) ? String(error.stack || error.message) : String(error);
}

function invokeOne(plugin, exports, name, callArgs) {
    const fn = exports?.[name];
    if (typeof fn !== "function") return;
    try {
        const ret = fn(...callArgs);
        if (ret && typeof ret.then === "function") {
            ret.catch((error) => {
                console.error(`[Renderer] [${plugin.manifest?.slug}] [${name}] async:`, error);
            });
        }
    } catch (error) {
        console.error(`[Renderer] [${plugin.manifest?.slug}] [${name}]:`, error);
    }
}

export class Runtime {

    static registerPlugin(plugin, exports) {
        const slug = plugin?.manifest?.slug || String(Math.random());
        pluginMap().set(slug, { plugin, exports });
    }

    static triggerHooks(name, args) {
        for (const { plugin, exports } of pluginMap().values()) {
            const callArgs = typeof args === "function" ? args(plugin) : args;
            invokeOne(plugin, exports, name, callArgs);
        }
    }

    /** Invoke a single plugin hook by slug (for late settings tabs). */
    static invokeHook(slug, name, ...callArgs) {
        const entry = pluginMap().get(slug);
        if (!entry) return false;
        invokeOne(entry.plugin, entry.exports, name, callArgs);
        return typeof entry.exports?.[name] === "function";
    }

    static hasPlugin(slug) {
        return pluginMap().has(slug);
    }

    static getPlugin(slug) {
        return pluginMap().get(slug)?.plugin || null;
    }

    static pluginCount() {
        return pluginMap().size;
    }

    static slugs() {
        return [...pluginMap().keys()];
    }
}
