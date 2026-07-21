import search from "./selector/search.js";
import setting from "./selector/setting.js";
import title from "./selector/title.js";
import update from "./selector/update.js";

/**
 * 触发器注册表
 */
const TRIGGERS = [
    search,
    setting,
    title,
    update
];

function watchElement(target, callback) {
    const check = () => {
        const element = document.querySelector(target);
        if (!element) return false;
        callback(element);
        return true;
    };
    if (check()) return;
    const observer = new MutationObserver(() => {
        if (check()) observer.disconnect();
    });
    observer.observe(document.documentElement || document, {
        subtree: true,
        childList: true
    });
}

function watchHash(target, callback) {
    const check = () => {
        if (!location.hash.includes(target)) return false;
        callback();
        return true;
    };
    if (check()) return;
    try {
        navigation.addEventListener("navigatesuccess", check);
    } catch {
        window.addEventListener("hashchange", check);
        window.addEventListener("popstate", check);
    }
}

// Classic hash-based triggers
TRIGGERS.forEach((trigger) => {
    watchHash(trigger.hash, () => {
        watchElement(trigger.selector, trigger.action);
    });
});

function tryMountSettings(reason) {
    try {
        if (document.querySelector(".nav-bar.liteloader") || document.querySelector("[data-slug='config_view']")) {
            return;
        }
        setting.action();
        console.log("[LL] tryMountSettings", reason, !!document.querySelector(".nav-bar.liteloader"));
    } catch (e) {
        console.error("[LL] setting action", reason, e);
    }
}

// QQ 9.9+ may open settings without stable #/setting hash — also watch DOM
watchElement(".setting-tab", () => tryMountSettings("setting-tab"));
watchElement(".setting-tab .nav-bar, .setting-tab [class*='nav']", () => tryMountSettings("nav"));
watchElement("[class*='setting-tab']", () => tryMountSettings("setting-tab*"));
watchElement("[class*='SettingTab']", () => tryMountSettings("SettingTab"));

// Periodic retry while settings shell may mount asynchronously
let settingRetries = 0;
const settingTimer = setInterval(() => {
    settingRetries += 1;
    if (document.querySelector(".nav-bar.liteloader") || document.querySelector("[data-slug='config_view']")) {
        clearInterval(settingTimer);
        return;
    }
    if (
        document.querySelector(".setting-tab") ||
        document.querySelector("[class*='setting-tab']") ||
        document.querySelector("[class*='SettingTab']") ||
        location.hash.includes("setting")
    ) {
        tryMountSettings("timer");
    }
    if (settingRetries > 60) clearInterval(settingTimer);
}, 500);

console.log("[LL] renderer triggers armed", location.href);
