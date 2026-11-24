// ---------------------------------------------------------------------------
// The mini card: the status of the network beside the Z-Wave badge; its detail button unfolds the full card
// ---------------------------------------------------------------------------
import { ICONS } from "./core.js";
import { esc, svgIcon } from "./helpers.js";
import { isZwaveDevice } from "./z-wave-nodes.js";
import { inDialog, watchOutside } from "./shadow-dom-patching.js";
import { BANNER_STYLE, COMMON_STYLE, MINI_BANNER_STYLE, MINI_STYLE, PILL_STYLE, ZOOM_STYLE } from "./styles.js";
import { ZWaveCard } from "./full-card.js";

export class ZWaveMiniCard extends ZWaveCard {
  constructor() {
    super();
    this._zoomed = false;
    this._onFold = (ev) => {
      // The click that closed the node popup only closes the popup.
      if (this._detailClosedBy === ev) return;
      if (this._zoomed && !inDialog(ev)) this._setZoom(false);
    };
  }

  static getConfigElement() {
    return document.createElement("zwave-mini-card-editor");
  }

  connectedCallback() {
    super.connectedCallback();
    (this._foldWatch ??= watchOutside(this, (ev) => this._onFold(ev))).on();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._foldWatch?.off();
    this._zoomed = false;
  }

  getCardSize() {
    return this._zoomed ? super.getCardSize() : this._config?.illustration === false ? 2 : 3;
  }

  getGridOptions() {
    return this._zoomed ? super.getGridOptions() : { columns: 6, min_columns: 6 };
  }

  _setZoom(zoomed) {
    this._zoomed = zoomed;
    if (!zoomed) {
      this._detail = null;
      window.removeEventListener("keydown", this._onKey);
    }
    this._update(this._sig);
  }

  _click(ev) {
    if (!this._detail && ev.composedPath().some((n) => n.classList?.contains("zoom"))) {
      ev.stopPropagation();
      this._setZoom(!this._zoomed);
      if (ev.detail === 0) this.shadowRoot.querySelector(".zoom")?.focus({ preventScroll: true });
      return;
    }
    super._click(ev);
  }

  _extraStyle() {
    return this._zoomed ? ZOOM_STYLE : "";
  }

  _zoomButton(cls = "") {
    if (this._config.zoom === false) return "";
    const z = this._zoomed;
    const label = esc(this._t(z ? "zoom_out" : "zoom_in"));
    return `<button class="zoom ${cls}" title="${label}" aria-label="${label}" aria-expanded="${z}">${svgIcon(z ? ICONS.collapse : ICONS.expand)}</button>`;
  }

  _miniChip(icon, text, cls = "") {
    return `<span class="r${cls ? ` pill ${cls}` : ""}">${svgIcon(icon)}<span>${esc(text)}</span></span>`;
  }

  _render() {
    if (this._zoomed) return super._render();
    if (!this._infos.length && !Object.values(this._hass?.devices || {}).some(isZwaveDevice)) return this._noDevices();
    const s = this._summary;
    const chips = [this._miniChip(ICONS.zwave, this._p("nodes", s.total))];
    if (s.asleep) chips.push(this._miniChip(ICONS.sleep, this._p("asleep", s.asleep)));
    if (s.longRange) chips.push(this._miniChip(ICONS.zwave, this._t("count_lr", { n: this._num(s.longRange) })));
    if (this._disconnected()) chips.push(this._miniChip(ICONS.offline, this._t("disconnected"), "alert"));
    if (s.dead) chips.push(this._miniChip(ICONS.offline, this._p("dead", s.dead), "alert"));
    if (s.lowBattery) chips.push(this._miniChip(ICONS.battery, this._p("low_battery", s.lowBattery), "warn"));
    const title = esc(this._config.title || this._t("zwave"));
    if (this._config.illustration === false)
      return `<style>${COMMON_STYLE}${PILL_STYLE}${MINI_STYLE}</style>
      <ha-card>
        <div class="mini s-${this._level()}">
          ${this._badgeHtml()}
          <div class="body">
            <div class="mhead${this._fitCls("mini")}">
              <span class="title">${title}</span>${this._pill()}
              ${this._zoomButton()}
            </div>
            <div class="rs">${chips.join("")}</div>
          </div>
        </div>
      </ha-card>`;
    // The illustrated mini card: the full card's banner, its status pill after the title, the chips below.
    return `<style>${COMMON_STYLE}${BANNER_STYLE}${MINI_BANNER_STYLE}${ZOOM_STYLE}</style>
      <ha-card>
        <div class="mini">
          ${this._bannerOpen()}
            <div class="head">${this._badgeHtml()}<div class="titles${this._fitCls("banner")}"><div class="trow"><div class="name">${title}</div>${this._pill()}</div></div></div>
            ${this._zoomButton(this._night() ? "on-night" : "")}
          </div>
          <div class="rs">${chips.join("")}</div>
        </div>
      </ha-card>`;
  }
}
