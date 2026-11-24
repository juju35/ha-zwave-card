// ---------------------------------------------------------------------------
// Visual editors (ha-form)
// ---------------------------------------------------------------------------
import { lang, t } from "./helpers.js";

// Options on by default (left out of the YAML while on), and off by default (left out while off).
export const ON_BY_DEFAULT = ["show_title", "show_subtitle", "show_controller", "show_rebuild", "show_manage", "illustration", "zoom"];
export const OFF_BY_DEFAULT = [];
export const DEFAULTS = { sort: "name", columns: 2, battery_threshold: 20, illustration_theme: "auto" };
export const LANGUAGES = [
  ["en", "English"], ["fr", "Français"], ["de", "Deutsch"], ["es", "Español"], ["sr", "Српски"], ["sr-Latn", "Srpski (latinica)"],
  ["it", "Italiano"], ["nl", "Nederlands"], ["pt", "Português (Portugal)"], ["pl", "Polski"], ["ro", "Română"], ["da", "Dansk"],
  ["sv", "Svenska"], ["bg", "Български"], ["ru", "Русский"], ["uk", "Українська"], ["hu", "Magyar"], ["sk", "Slovenčina"],
  ["cs", "Čeština"], ["sl", "Slovenščina"], ["lv", "Latviešu"], ["el", "Ελληνικά"],
];

export class ZWaveCardEditor extends HTMLElement {
  static get mini() {
    return false;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _schema() {
    const tr = (k) => t(this._hass, this._config, k);
    const toggles = ["show_title", "show_subtitle", "show_controller", "show_rebuild", "show_manage", "illustration"];
    if (this.constructor.mini) toggles.push("zoom");
    return [
      { name: "title", selector: { text: {} } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "sort", selector: { select: { mode: "dropdown", options: ["name", "status"].map((v) => ({ value: v, label: tr(`sort_${v}`) })) } } },
          { name: "columns", selector: { number: { min: 1, max: 4, step: 1, mode: "box" } } },
          { name: "battery_threshold", selector: { number: { min: 1, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
          {
            name: "illustration_theme",
            selector: { select: { mode: "dropdown", options: ["auto", "day", "night"].map((v) => ({ value: v, label: tr(`theme_${v}`) })) } },
          },
        ],
      },
      { type: "grid", name: "", schema: toggles.map((name) => ({ name, selector: { boolean: {} } })) },
      {
        name: "language",
        selector: { select: { mode: "dropdown", options: [{ value: "", label: tr("lang_auto") }, ...LANGUAGES.map(([value, label]) => ({ value, label }))] } },
      },
    ];
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => t(this._hass, this._config, s.name === "title" ? "ed_title" : s.name);
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const config = { ...ev.detail.value };
        for (const [k, v] of Object.entries(config)) {
          // A minimal YAML: no empty values, no options left at their default.
          if (
            v === "" ||
            v === undefined ||
            v === null ||
            (ON_BY_DEFAULT.includes(k) && v === true) ||
            (OFF_BY_DEFAULT.includes(k) && v === false) ||
            (k in DEFAULTS && DEFAULTS[k] === v)
          )
            delete config[k];
        }
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    const data = { ...DEFAULTS, ...this._config };
    for (const k of ON_BY_DEFAULT) if (data[k] === undefined) data[k] = true;
    for (const k of OFF_BY_DEFAULT) if (data[k] === undefined) data[k] = false;
    this._form.hass = this._hass;
    // hass is pushed on every state change while the editor is open: data and schema are set again only when they
    // changed, so that the form does not redraw each time.
    const dataKey = JSON.stringify(data);
    if (dataKey !== this._dataKey) {
      this._dataKey = dataKey;
      this._form.data = data;
    }
    const schemaKey = lang(this._hass, this._config);
    if (schemaKey !== this._schemaKey) {
      this._schemaKey = schemaKey;
      this._form.schema = this._schema();
    }
  }
}

export class ZWaveMiniCardEditor extends ZWaveCardEditor {
  static get mini() {
    return true;
  }
}
