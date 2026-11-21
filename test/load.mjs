// Test loader: evaluates the card source (a plain script, as shipped in dist/) in an isolated context
// with minimal browser stubs, and returns the requested top-level bindings. The bundle is unchanged.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SRC = new URL("../src/zwave-card.js", import.meta.url);

export const load = (names) => {
  const src = readFileSync(SRC, "utf8");
  class HTMLElement {
    attachShadow() {
      // Listeners kept by type, so tests can dispatch events to them.
      this.shadowRoot = {
        listeners: {},
        addEventListener(type, fn) {
          (this.listeners[type] ??= []).push(fn);
        },
        querySelector: () => null,
        innerHTML: "",
      };
      return this.shadowRoot;
    }
    dispatchEvent(ev) {
      (this.events ??= []).push(ev);
    }
    appendChild() {}
  }
  const registry = new Map();
  const docListeners = {};
  const context = {
    HTMLElement,
    customElements: { get: (n) => registry.get(n), define: (n, c) => registry.set(n, c) },
    window: {
      addEventListener(type, fn) {
        this[`on_${type}`] = fn;
      },
      removeEventListener(type, fn) {
        if (this[`on_${type}`] === fn) delete this[`on_${type}`];
      },
      dispatchEvent(ev) {
        (this.events ??= []).push(ev);
      },
    },
    // The document's capture listeners by type, so tests can tap outside a card.
    document: {
      listeners: docListeners,
      addEventListener(type, fn) {
        (docListeners[type] ??= new Set()).add(fn);
      },
      removeEventListener(type, fn) {
        docListeners[type]?.delete(fn);
      },
      createElement: (tag) => ({ tag, addEventListener() {}, appendChild() {} }),
    },
    console: { info() {}, error() {}, log() {}, warn() {} },
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    CSS: { escape: (s) => String(s) },
    history: {
      pushState(_s, _t, path) {
        this.last = path;
      },
    },
    setInterval: () => 0,
    clearInterval() {},
    Intl,
    Date,
  };
  vm.createContext(context);
  // The source keeps its own file name, so that the coverage report counts its lines.
  return vm.runInContext(`${src}\n;({ ${names.join(", ")} })`, context, { filename: fileURLToPath(SRC) });
};
