#!/usr/bin/env node
const path = require("path");
const assert = require("assert");
const { resolveLocalUrl } = require("../src/main/local_url.js");

const roots = { root: "/LL", profile: "/LL/profile" };
const plugin = "/Users/evan/Library/Containers/com.tencent.qq/Data/Documents/LiteLoaderQQNT/plugins/list-viewer";

// Same construction as plugins/list-viewer/renderer/index.js localFetch
function listViewerLocalFetchUrl(pluginPath, rel) {
    const p = pluginPath.replace(":\\", "://").replaceAll("\\", "/");
    const rest = rel.startsWith("/") ? rel.slice(1) : rel;
    return `local:///${p}/${rest}`;
}

const cases = [
    [
        "local://root/plugins/list-viewer/assets/view.html",
        path.join("/LL", "plugins/list-viewer/assets/view.html")
    ],
    [
        "local://profile/data/list-viewer/config.json",
        path.join("/LL/profile", "data/list-viewer/config.json")
    ],
    [
        `local:///${plugin}/assets/view.html`,
        `${plugin}/assets/view.html`
    ],
    [
        listViewerLocalFetchUrl(plugin, "/assets/view.html"),
        `${plugin}/assets/view.html`
    ],
    [
        listViewerLocalFetchUrl(plugin, "/assets/list-item.html"),
        `${plugin}/assets/list-item.html`
    ],
    [
        "local:///C:/Users/evan/Documents/LiteLoaderQQNT/plugins/list-viewer/assets/view.html",
        path.normalize("C:/Users/evan/Documents/LiteLoaderQQNT/plugins/list-viewer/assets/view.html")
    ],
    [
        // Chromium may collapse local:////Users/... → local://Users/...
        `local://Users/evan/Library/Containers/com.tencent.qq/Data/Documents/LiteLoaderQQNT/plugins/list-viewer/assets/view.html`,
        `${plugin}/assets/view.html`
    ],
    [
        `local://users/evan/Library/Containers/com.tencent.qq/Data/Documents/LiteLoaderQQNT/plugins/list-viewer/assets/view.html`,
        `/users/evan/Library/Containers/com.tencent.qq/Data/Documents/LiteLoaderQQNT/plugins/list-viewer/assets/view.html`
    ],
    [
        `local:///${plugin}/settings.html`,
        `${plugin}/settings.html`
    ],
    [
        `local://root/src/renderer.js?v=1`,
        path.join("/LL", "src/renderer.js")
    ]
];

let failed = 0;
for (const [url, expected] of cases) {
    const got = resolveLocalUrl(url, roots);
    try {
        assert.strictEqual(got, expected);
        console.log("OK", url);
        console.log("  ", got);
    } catch {
        failed += 1;
        console.error("FAIL", url);
        console.error("  got", got);
        console.error("  exp", expected);
    }
}

if (failed) {
    process.exit(1);
}
console.log("all passed", cases.length);
