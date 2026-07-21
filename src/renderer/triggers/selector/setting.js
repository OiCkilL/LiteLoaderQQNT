import { Runtime } from "../../runtime.js"
import { initView, appropriateIcon, pluginAssetUrl } from "../../settings/renderer.js";

/**
 * Shell state must survive cache-busted double imports of renderer.js
 * (preload + did-finish-load). Keep everything on globalThis.
 */
function shell() {
    const g = globalThis;
    if (!g.__ll_settings_shell__) {
        g.__ll_settings_shell__ = {
            navBar: document.createElement("div"),
            settingView: document.createElement("div"),
            inited: false,
            hookedSlugs: new Set(),
            lateTimer: null
        };
    }
    return g.__ll_settings_shell__;
}

function findSettingTab() {
    return document.querySelector(".setting-tab")
        || document.querySelector("[class*='setting-tab']")
        || document.querySelector("[class*='settingTab']");
}

function findSettingMainContent() {
    return document.querySelector(".setting-main .setting-main__content")
        || document.querySelector(".setting-main__content")
        || document.querySelector(".setting-main .q-scroll-view")?.parentElement
        || document.querySelector(".setting-main");
}

function findSettingTitle() {
    return document.querySelector(".setting-main .setting-title")
        || document.querySelector(".setting-title");
}

function findSettingScroll() {
    return document.querySelector(".setting-main .q-scroll-view")
        || document.querySelector(".setting-main .scroll-view")
        || document.querySelector(".setting-main");
}

function findSampleNavItem() {
    return document.querySelector(".setting-tab .nav-item")
        || document.querySelector(".setting-tab [class*='nav-item']")
        || document.querySelector(".setting-tab .nav-bar > *")
        || document.querySelector(".setting-tab [class*='nav'] > *");
}

function init() {
    const s = shell();
    if (s.inited && document.contains(s.navBar)) return true;
    // If a previous module instance already mounted into DOM, adopt it
    const existingBar = document.querySelector(".nav-bar.liteloader");
    if (existingBar) {
        s.navBar = existingBar;
        s.settingView = document.querySelector(".q-scroll-view.liteloader") || s.settingView;
        s.inited = true;
        return true;
    }

    const setting_tab = findSettingTab();
    const setting_view = findSettingScroll();
    const setting_title = findSettingTitle();
    const content = findSettingMainContent();
    if (!setting_tab || !content) {
        console.warn("[LL] setting DOM not ready", {
            tab: !!setting_tab, content: !!content, view: !!setting_view
        });
        return false;
    }

    s.navBar.classList.add("nav-bar", "liteloader");
    s.settingView.classList.add("q-scroll-view", "scroll-view--show-scrollbar", "liteloader");
    s.settingView.style.display = "none";

    const existing_bar = setting_tab.querySelector(".nav-bar") || setting_tab;
    if (existing_bar !== setting_tab && existing_bar.parentElement) {
        existing_bar.parentElement.append(s.navBar);
    } else {
        setting_tab.append(s.navBar);
    }
    content.append(s.settingView);

    setting_tab.addEventListener("click", event => {
        const nav_item = event.target.closest(".nav-item") || event.target.closest("[data-slug]");
        if (!nav_item) return;
        if (nav_item.parentElement?.classList?.contains("liteloader") || nav_item.closest(".nav-bar.liteloader")) {
            if (setting_view) setting_view.style.display = "none";
            s.settingView.style.display = "block";
        } else {
            if (setting_view) setting_view.style.display = "block";
            s.settingView.style.display = "none";
        }
        try {
            const name = nav_item.querySelector(".name")?.textContent || nav_item.textContent;
            if (setting_title?.childNodes?.[1]) setting_title.childNodes[1].textContent = name;
        } catch { /* ignore */ }
        document.querySelectorAll(".setting-tab .nav-item, .setting-tab [data-slug]").forEach(element => {
            element.classList.remove("nav-item-active");
        });
        nav_item.classList.add("nav-item-active");
    });

    s.inited = true;
    console.log("[LL] setting UI shell mounted");
    return true;
}

function add(plugin) {
    const s = shell();
    const slug = plugin.manifest.slug;
    const existing = s.navBar.querySelector(`[data-slug="${slug}"]`);
    if (existing) {
        const views = document.querySelectorAll(`.tab-view.${slug}, .tab-view`);
        for (const v of views) {
            if (v.classList.contains(slug)) return v;
        }
        const reuse = document.createElement("div");
        reuse.classList.add("tab-view", slug);
        return reuse;
    }

    const default_thumb = `local://root/src/common/static/default.svg`;
    const thumb = plugin.manifest.thumb
        ? pluginAssetUrl(plugin.path.plugin, plugin.manifest.thumb)
        : default_thumb;
    const sample = findSampleNavItem();
    const nav_item = sample
        ? sample.cloneNode(true)
        : Object.assign(document.createElement("div"), { className: "nav-item" });
    if (!sample) {
        nav_item.innerHTML = `<div class="q-icon"></div><div class="name"></div>`;
        nav_item.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;";
    }
    const view = document.createElement("div");
    nav_item.classList.remove("nav-item-active");
    nav_item.setAttribute("data-slug", slug);
    const icon = nav_item.querySelector(".q-icon");
    if (icon) appropriateIcon(thumb).then(async text => { icon.innerHTML = text; }).catch(() => {});
    const nameEl = nav_item.querySelector(".name");
    if (nameEl) nameEl.textContent = plugin.manifest.name;
    else nav_item.append(document.createTextNode(plugin.manifest.name));
    nav_item.addEventListener("click", event => {
        if (!event.currentTarget.classList.contains("nav-item-active")) {
            s.settingView.textContent = null;
            s.settingView.append(view);
        }
    });
    s.navBar.append(nav_item);
    view.classList.add("tab-view", slug);
    return view;
}

function mountPluginSettings(plugin) {
    const s = shell();
    const slug = plugin?.manifest?.slug;
    if (!slug || s.hookedSlugs.has(slug)) return;
    if (!Runtime.hasPlugin(slug)) return;
    s.hookedSlugs.add(slug);
    const view = add(plugin);
    const ok = Runtime.invokeHook(slug, "onSettingWindowCreated", view);
    console.log(`[LL] onSettingWindowCreated ${slug} ok=${ok} ListViewer=${typeof globalThis.ListViewer}`);
}

function mountAllPluginSettings() {
    for (const slug of Runtime.slugs()) {
        const plugin = Runtime.getPlugin(slug) || LiteLoader.plugins?.[slug];
        if (!plugin || plugin.disabled || plugin.incompatible) continue;
        mountPluginSettings(plugin);
    }
}

function scheduleLatePluginSettings() {
    const s = shell();
    if (s.lateTimer) return;
    let tries = 0;
    s.lateTimer = setInterval(() => {
        tries += 1;
        try {
            if (!document.querySelector(".nav-bar.liteloader")) return;
            mountAllPluginSettings();
        } catch (e) {
            console.error("[LL] late settings poll", e);
        }
        const pending = Runtime.slugs().filter((slug) => !s.hookedSlugs.has(slug));
        if (pending.length === 0 || tries > 40) {
            clearInterval(s.lateTimer);
            s.lateTimer = null;
            console.log("[LL] late settings done hooked=", [...s.hookedSlugs], "pending=", pending);
        }
    }, 500);
}

export default {
    hash: "#/setting",
    selector: ".setting-tab .nav-bar, .setting-tab",
    action() {
        const s = shell();
        const already = !!(document.querySelector(".nav-bar.liteloader") || document.querySelector("[data-slug='config_view']"));
        if (already) {
            init(); // adopt existing shell if needed
            mountAllPluginSettings();
            scheduleLatePluginSettings();
            return;
        }
        if (!init()) return;
        if (!document.querySelector('link[href*="settings/style.css"]')) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.type = "text/css";
            link.href = "local://root/src/renderer/settings/style.css";
            document.head.append(link);
        }
        if (!s.hookedSlugs.has("config_view")) {
            const view = add({
                manifest: {
                    slug: "config_view",
                    name: "LiteLoaderQQNT"
                },
                path: {
                    plugin: LiteLoader.path.root
                }
            });
            s.hookedSlugs.add("config_view");
            fetch("local://root/src/renderer/settings/view.html")
                .then(res => res.text())
                .then(html => initView(view, html))
                .catch(e => console.error("[LL] settings view", e));
        }
        mountAllPluginSettings();
        console.log("[LL] settings shell ready plugins=", Runtime.slugs());
        scheduleLatePluginSettings();
    }
}
