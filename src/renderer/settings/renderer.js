import default_config from "../../common/static/config.json" with {type: "json"};


export function initView(view, html) {
    view.innerHTML = html;
    initVersions(view);
    initPluginList(view).catch((e) => console.error("[LL] initPluginList", e));
    initPath(view);
    initAbout(view);
}


/** Build local:// URL for a file under a plugin directory (prefer local://root/). */
export function pluginAssetUrl(pluginPath, relPath) {
    const rel = String(relPath || "").replace(/^\.\//, "").replace(/^\/+/, "").replace(/\\/g, "/");
    if (!rel) return `local://root/src/common/static/default.svg`;
    try {
        const root = String(LiteLoader.path.root || "").replace(/\\/g, "/").replace(/\/+$/, "");
        const full = String(pluginPath || "").replace(/\\/g, "/").replace(/\/+$/, "");
        if (root && full.toLowerCase().startsWith(root.toLowerCase())) {
            const sub = full.slice(root.length).replace(/^\/+/, "");
            const joined = [sub, rel].filter(Boolean).join("/");
            return `local://root/${joined}`;
        }
        // Absolute fallback: local:///C:/...
        return `local:///${full}/${rel}`;
    } catch {
        return `local://root/src/common/static/default.svg`;
    }
}

export async function appropriateIcon(icon) {
    if (!icon || typeof icon !== "string") {
        return `<img src="local://root/src/common/static/default.png"/>`;
    }
    if (!icon.endsWith(".svg")) {
        return `<img src="${icon}"/>`;
    }
    try {
        const res = await fetch(icon);
        if (!res.ok) throw new Error(`icon fetch ${res.status}`);
        const text = await res.text();
        // Guard: never inject protocol error plaintext into the sidebar
        if (!text || text.startsWith("local protocol") || !text.includes("<")) {
            throw new Error("invalid svg body");
        }
        return text;
    } catch (e) {
        console.warn("[LL] appropriateIcon fail", icon, e);
        return `<img src="local://root/src/common/static/default.png"/>`;
    }
}


async function initVersions(view) {
    if (globalThis.qwqnt) view.querySelector(".versions .qwqnt").style.display = "block";

    view.querySelector(".versions .liteloader .version").textContent = LiteLoader.versions.liteloader;
    view.querySelector(".versions .qqnt .version").textContent = LiteLoader.versions.qqnt;
    view.querySelector(".versions .electron .version").textContent = LiteLoader.versions.electron;
    view.querySelector(".versions .chromium .version").textContent = LiteLoader.versions.chrome;
    view.querySelector(".versions .nodejs .version").textContent = LiteLoader.versions.node;

    const title = view.querySelector(".versions .new setting-text");
    const update_btn = view.querySelector(".versions .new setting-button");

    const jump_link = () => LiteLoader.api.openExternal(update_btn.value);
    const try_again = () => {
        title.textContent = "正在瞅一眼 LiteLoaderQQNT 是否有新版本";
        update_btn.textContent = "你先别急";
        update_btn.value = null;
        update_btn.removeEventListener("click", jump_link);
        update_btn.removeEventListener("click", try_again);
        const repo_url = LiteLoader.package.liteloader.repository.url;
        const release_latest_url = `${repo_url.slice(0, repo_url.lastIndexOf(".git"))}/releases/latest`;
        fetch(release_latest_url).then((res) => {
            const new_version = res.url.slice(res.url.lastIndexOf("/") + 1);
            if (LiteLoader.versions.liteloader != new_version) {
                title.textContent = `发现 LiteLoaderQQNT 新版本 ${new_version}`;
                update_btn.textContent = "去瞅一眼";
                update_btn.value = res.url;
                update_btn.removeEventListener("click", try_again);
                update_btn.addEventListener("click", jump_link);
            }
            else {
                title.textContent = "暂未发现 LiteLoaderQQNT 有新版本，目前已是最新";
                update_btn.textContent = "重新发现";
                update_btn.value = null;
                update_btn.removeEventListener("click", jump_link);
                update_btn.addEventListener("click", try_again);
            }
        }).catch((e) => {
            title.textContent = `检查更新时遇到错误：${e}`;
            update_btn.textContent = "重新发现";
            update_btn.value = null;
            update_btn.removeEventListener("click", jump_link);
            update_btn.addEventListener("click", try_again);
        });
    };
    try_again();
}


async function resolvePluginsMap() {
    let plugins = LiteLoader.plugins;
    if (plugins && typeof plugins === "object" && Object.keys(plugins).length > 0) {
        return plugins;
    }
    // Snapshot may be empty on some QQ windows — pull live from main
    try {
        if (typeof LiteLoader.api?.plugin?.list === "function") {
            const live = await LiteLoader.api.plugin.list();
            if (live && typeof live === "object" && Object.keys(live).length > 0) {
                console.log("[LL] plugins from api.plugin.list", Object.keys(live));
                return live;
            }
        }
        if (typeof LiteLoader.api?.snapshot === "function") {
            const snap = await LiteLoader.api.snapshot();
            if (snap?.plugins && Object.keys(snap.plugins).length > 0) {
                console.log("[LL] plugins from api.snapshot", Object.keys(snap.plugins));
                return snap.plugins;
            }
        }
    } catch (e) {
        console.error("[LL] resolvePluginsMap", e);
    }
    console.warn("[LL] plugins map empty", {
        hasPlugins: !!LiteLoader.plugins,
        keys: LiteLoader.plugins ? Object.keys(LiteLoader.plugins) : null
    });
    return plugins && typeof plugins === "object" ? plugins : {};
}

async function initPluginList(view) {
    const plugin_item_template = view.querySelector("#plugin-item");
    const plugin_install_button = view.querySelector(".plugins .plugin .install setting-button");
    const plugin_loader_switch = view.querySelector(".plugins .plugin .loader setting-switch");
    const plugin_lists = {
        extension: view.querySelector(".plugins .extension"),
        theme: view.querySelector(".plugins .theme"),
        framework: view.querySelector(".plugins .framework"),
    };

    if (!plugin_item_template || !plugin_lists.extension) {
        console.error("[LL] plugin list DOM missing", {
            template: !!plugin_item_template,
            extension: !!plugin_lists.extension
        });
        return;
    }

    const input_file = document.createElement("input");
    input_file.type = "file";
    input_file.accept = ".zip,.json";
    input_file.addEventListener("change", async () => {
        const filepath = input_file.files?.[0]?.path;
        const is_install = await LiteLoader.api.plugin.install(filepath);
        alert(is_install ? "插件安装成功" : "无法安装无效插件");
        input_file.value = null;
    });
    plugin_install_button?.addEventListener("click", () => input_file.click());

    const config = {
        ...default_config,
        ...(await LiteLoader.api.config.get("LiteLoader", default_config) || {})
    };
    if (!Array.isArray(config.disabled_plugins)) config.disabled_plugins = [];
    if (!config.deleting_plugins || typeof config.deleting_plugins !== "object") {
        config.deleting_plugins = {};
    }

    if (plugin_loader_switch) {
        plugin_loader_switch.setActive(!!config.enable_plugins);
        plugin_loader_switch.addEventListener("click", () => {
            const isActive = plugin_loader_switch.getActive();
            plugin_loader_switch.setActive(!isActive);
            config.enable_plugins = !isActive;
            LiteLoader.api.config.set("LiteLoader", config);
        });
    }

    const plugin_counts = {
        extension: 0,
        theme: 0,
        framework: 0
    };

    const default_icon = `local://root/src/common/static/default.png`;
    const pluginsMap = await resolvePluginsMap();

    for (const [slug, plugin] of Object.entries(pluginsMap)) {
        try {
            if (!plugin || plugin.incompatible) continue;
            const type = plugin.manifest?.type || "extension";
            const plugin_list = plugin_lists[type] || plugin_lists.extension;
            if (!plugin_list) continue;

            const icon = plugin.manifest?.icon
                ? pluginAssetUrl(plugin.path?.plugin, plugin.manifest.icon)
                : default_icon;

            const plugin_item = document.importNode(plugin_item_template.content, true).querySelector("setting-item");
            if (!plugin_item) continue;

            const plugin_item_icon = plugin_item.querySelector(".icon");
            const plugin_item_name = plugin_item.querySelector(".name");
            const plugin_item_description = plugin_item.querySelector(".description");
            const plugin_item_version = plugin_item.querySelector(".version");
            const plugin_item_authors = plugin_item.querySelector(".authors");
            const plugin_item_repo = plugin_item.querySelector(".repo");
            const plugin_item_manager = plugin_item.querySelector(".manager");
            const plugin_item_manager_modal = plugin_item.querySelector(".manager-modal");
            const manager_modal_switch = plugin_item_manager_modal?.querySelector(".switch");
            const manager_modal_data = plugin_item_manager_modal?.querySelector(".data");
            const manager_modal_self = plugin_item_manager_modal?.querySelector(".self");

            if (plugin_item_icon) plugin_item_icon.innerHTML = await appropriateIcon(icon);
            if (plugin_item_name) {
                plugin_item_name.textContent = plugin.manifest?.name || slug;
                plugin_item_name.title = plugin.manifest?.name || slug;
            }
            if (plugin_item_description) {
                plugin_item_description.textContent = plugin.manifest?.description || "";
                plugin_item_description.title = plugin.manifest?.description || "";
            }

            if (plugin_item_version) {
                const version_link = document.createElement("setting-link");
                version_link.textContent = plugin.manifest?.version || "";
                plugin_item_version.append(version_link);
            }

            plugin.manifest?.authors?.forEach((author, index, array) => {
                if (!plugin_item_authors) return;
                const author_link = document.createElement("setting-link");
                author_link.textContent = author.name;
                author_link.setValue(author.link);
                plugin_item_authors.append(author_link);
                if (index < array.length - 1) plugin_item_authors.append(" | ");
            });

            if (plugin_item_repo) {
                if (plugin.manifest?.repository) {
                    const { repo, branch } = plugin.manifest.repository;
                    const repo_link = document.createElement("setting-link");
                    repo_link.textContent = repo;
                    repo_link.setValue(`https://github.com/${repo}/tree/${branch}`);
                    plugin_item_repo.append(repo_link);
                } else {
                    plugin_item_repo.textContent = "暂无仓库信息";
                }
            }

            if (plugin_item_manager_modal && plugin_item_manager) {
                plugin_item_manager_modal.setTitle?.(plugin.manifest?.name || slug);
                plugin_item_manager.addEventListener("click", () => {
                    const isActive = plugin_item_manager_modal.getActive();
                    plugin_item_manager_modal.setActive(!isActive);
                });
            }

            if (manager_modal_switch) {
                manager_modal_switch.setActive(!config.disabled_plugins.includes(slug));
                manager_modal_switch.addEventListener("click", () => {
                    const isActive = manager_modal_switch.getActive();
                    manager_modal_switch.setActive(!isActive);
                    plugin_item.classList.toggle("disabled", !isActive);
                    LiteLoader.api.plugin.disable(slug, !isActive);
                });
                plugin_item.classList.toggle("disabled", !manager_modal_switch.getActive());
            }

            if (manager_modal_data && manager_modal_self) {
                manager_modal_data.setActive(!!config.deleting_plugins?.[slug]?.data_path);
                manager_modal_data.addEventListener("click", () => {
                    const isActive = manager_modal_data.getActive();
                    manager_modal_data.setActive(!isActive);
                    plugin_item.classList.toggle("deleted", !isActive);
                    LiteLoader.api.plugin.delete(slug, [manager_modal_self.getActive(), !isActive], false);
                });
                plugin_item.classList.toggle("deleted", manager_modal_data.getActive());

                manager_modal_self.setActive(!!config.deleting_plugins?.[slug]);
                manager_modal_self.addEventListener("click", () => {
                    const isActive = manager_modal_self.getActive();
                    manager_modal_self.setActive(!isActive);
                    plugin_item.classList.toggle("deleted", !isActive);
                    LiteLoader.api.plugin.delete(slug, [!isActive, manager_modal_data.getActive()], false);
                });
                plugin_item.classList.toggle("deleted", manager_modal_self.getActive());
            }

            plugin_list.append(plugin_item);
            plugin_counts[type] = (plugin_counts[type] || 0) + 1;
        } catch (e) {
            console.error("[LL] plugin row failed", slug, e);
        }
    }

    // Titles + expand sections that have plugins (is-collapsible hides slot until is-active)
    for (const [type, el] of Object.entries(plugin_lists)) {
        if (!el) continue;
        const n = plugin_counts[type] || 0;
        const label = type === "extension" ? "扩展" : type === "theme" ? "主题" : "依赖";
        el.setTitle?.(`${label} （ ${n} 个插件 ）`);
        if (n > 0) {
            el.setActive?.(true);
            el.setAttribute?.("is-active", "");
        }
    }
    console.log("[LL] plugin list rendered", plugin_counts, "from", Object.keys(pluginsMap));
}


async function initPath(view) {
    // Display paths as plain text only — no click / no shell open.
    // (Clickable links previously opened Microsoft Store via c: URL mishandling;
    //  and Store popups were observed even without electron.shell traffic.)
    for (const [sel, p] of [
        [".path .root", LiteLoader.path.root],
        [".path .profile", LiteLoader.path.profile]
    ]) {
        const el = view.querySelector(sel);
        if (!el) continue;
        el.textContent = p;
        el.removeAttribute("data-value");
        el.style.cursor = "text";
        el.style.userSelect = "text";
        el.style.pointerEvents = "none";
    }
}


async function initAbout(view) {
    let visible = true;
    const text = view.querySelector(".about .hitokoto_text");
    const author = view.querySelector(".about .hitokoto_author");
    const observer = new IntersectionObserver((entries) => visible = entries[0].isIntersecting);
    const update = async () => {
        if (!document.hidden && visible) {
            const { hitokoto, creator } = await (await fetch("https://v1.hitokoto.cn")).json();
            text.textContent = hitokoto;
            author.textContent = creator;
        }
    }
    observer.observe(text);
    setInterval(update, 1000 * 10);
    update();
}
