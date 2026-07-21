import { BaseElement } from "../element.js";


export class Link extends BaseElement {
    #openExternalBound = this.#openExternal.bind(this);

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("click", this.#openExternalBound);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener("click", this.#openExternalBound);
    }

    #openExternal() {
        const value = this.getValue();
        if (!value) return;

        // Strict: only http(s)/tg/mailto use openExternal. Everything else openPath.
        // Never use new URL() to detect paths — "C:\Users\..." becomes protocol "c:".
        if (/^https?:\/\//i.test(value) || /^(tg|mailto):/i.test(value)) {
            LiteLoader.api.openExternal(value);
            return;
        }
        LiteLoader.api.openPath(normalizeFsPath(value));
    }

    update() {
        this.textContent ||= this.getValue();
    }

    getTemplate() {
        return /*html*/ `
            <slot></slot>
        `;
    }

    getStyles() {
        return /*css*/ `
            :host { color: var(--text_link); cursor: pointer; }
        `;
    }
}

function normalizeFsPath(value) {
    if (!value) return value;
    if (/^file:/i.test(value)) {
        try {
            let p = decodeURIComponent(value.replace(/^file:\/\//i, ""));
            if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1);
            return p.replace(/\//g, "\\");
        } catch {
            return value;
        }
    }
    // Prefer backslashes on Windows for Explorer
    if (/^[a-zA-Z]:\//.test(value)) {
        return value.replace(/\//g, "\\");
    }
    return value;
}
