/**
 * Windows-only helpers that are still open-eligible (no inject/sideload).
 * Branding / product AUMID is taken from env so private packaging can override
 * without hard-coding fork IDs into the open body.
 *
 *   LITELOADERQQNT_AUMID  default "LiteLoaderQQNT"
 *   (private packaging may set a product-specific id to match pinned shortcuts)
 */
const electron = require("electron");

const DEFAULT_AUMID = "LiteLoaderQQNT";

function applyAppUserModelId(log = () => {}) {
    if (process.platform !== "win32") return;
    try {
        const id = (process.env.LITELOADERQQNT_AUMID || DEFAULT_AUMID).trim() || DEFAULT_AUMID;
        if (electron.app && typeof electron.app.setAppUserModelId === "function") {
            electron.app.setAppUserModelId(id);
            log(`AppUserModelId=${id}`);
        }
    } catch (e) {
        log(`AppUserModelId skip: ${e && e.message ? e.message : e}`);
    }
}

module.exports = {
    DEFAULT_AUMID,
    applyAppUserModelId
};
