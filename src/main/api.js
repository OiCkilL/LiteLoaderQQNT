const path = require("path");
const { pathToFileURL } = require("url");
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
LiteLoader.api.openExternal = (url) => (electron.shell.openExternal(url), true);
LiteLoader.api.openPath = (p) => (electron.shell.openPath(p), true);

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

electron.ipcMain.on("LiteLoader.LiteLoader.LiteLoader", (event, method, args) => {
    event.returnValue = method.length ?
        method.reduce((obj, key) => obj?.[key], LiteLoader)?.(...args) :
        JSON.parse(JSON.stringify(LiteLoader));
});

electron.protocol.registerSchemesAsPrivileged([
    {
        scheme: "local",
        privileges: {
            standard: false,
            allowServiceWorkers: true,
            corsEnabled: false,
            supportFetchAPI: true,
            stream: true,
            bypassCSP: true
        }
    }
]);

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
 * File URL construction uses pathToFileURL for spaces / unicode safety.
 */
exports.protocolRegister = (protocol) => {
    if (!protocol.isProtocolRegistered("local")) {
        protocol.handle("local", (req) => {
            const { host, pathname } = new URL(decodeURI(req.url));
            const filepath = path.normalize(pathname.slice(1));
            let absolute;
            switch (host) {
                case "root":
                    absolute = path.join(LiteLoader.path.root, filepath);
                    break;
                case "profile":
                    absolute = path.join(LiteLoader.path.profile, filepath);
                    break;
                default:
                    // Preserve original absolute mapping (Windows drive / Unix root host)
                    absolute = path.normalize(`${host}/${filepath}`);
                    break;
            }
            return electron.net.fetch(pathToFileURL(absolute).href);
        });
    }
};

// Export resolved paths for main bootstrap (not part of public LiteLoader surface)
exports.paths = paths;
