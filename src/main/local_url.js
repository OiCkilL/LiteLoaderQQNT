const path = require("path");

const ROOT_HOSTS = new Set(["root", "profile"]);

function posixFromRaw(raw) {
    // local:///Users/... or local:////Users/... (list-viewer / scriptio extra slash)
    // Do not match local://root/... (only two slashes after local:)
    const m = String(raw).match(/^local:\/{3,}([^?#]+)/);
    if (!m) return null;
    let p = m[1];
    if (/^[A-Za-z]:/.test(p)) return null; // local:///C:/...
    if (!p.startsWith("/")) p = "/" + p;
    return path.normalize(p);
}

/**
 * Resolve a local:// URL to an absolute filesystem path.
 *
 * Hosts:
 *   local://root/...      → paths.root
 *   local://profile/...   → paths.profile
 *   local:///C:/...       → Windows drive (host empty)
 *   local://C/Users/...   → Windows drive letter as host
 *   local:///Users/...    → POSIX absolute
 *   local:////Users/...   → POSIX absolute (list-viewer extra slash)
 *   local://Users/...     → Chromium may collapse extra slashes into host "Users"
 */
function resolveLocalUrl(reqUrl, paths = {}) {
    let raw = String(reqUrl || "");
    try { raw = decodeURI(raw); } catch { /* keep raw */ }

    const posix = posixFromRaw(raw);
    if (posix) return posix;

    const u = new URL(raw);
    const host = (u.hostname || u.host || "").toString();
    const rawPath = decodeURIComponent(u.pathname || "");
    let filepath = rawPath.replace(/^\/+/, "");
    filepath = filepath.replace(/^([a-zA-Z]):\/\//, "$1:/");

    switch (host) {
        case "root":
            return path.normalize(path.join(paths.root || "", filepath));
        case "profile":
            return path.normalize(path.join(paths.profile || "", filepath));
        default:
            if (!host && /^[a-zA-Z]:[\\/]/.test(filepath)) {
                return path.normalize(filepath);
            }
            if (/^[a-zA-Z]$/.test(host)) {
                const rest = filepath.replace(/^[\\/]+/, "");
                return path.normalize(`${host}:\\${rest}`);
            }
            if (!host && filepath) {
                if (!/^[a-zA-Z]:/.test(filepath)) {
                    return path.normalize("/" + filepath.replace(/^\/+/, ""));
                }
                return path.normalize(filepath);
            }
            // Chromium: local://Users/evan/... → host=Users (not root/profile/drive)
            if (host && !ROOT_HOSTS.has(host) && !/^[a-zA-Z]$/.test(host)) {
                return path.normalize("/" + host + "/" + filepath);
            }
            return path.normalize(path.join(host, filepath));
    }
}

module.exports = { resolveLocalUrl, posixFromRaw };
