// ---------------------------------------------------------------------------
// The full card
// ---------------------------------------------------------------------------
import { ICONS } from "./core.js";
import { esc, fmtLang, navigate, num, plural, svgIcon, t, unavailableState, zwaveLogo } from "./helpers.js";
import { SECURITY_TAGS, controllerOf, driverVersion, entitiesByDevice, isAdmin, isZwaveDevice, networkNodes, nodeInfo, rebuildRoutes, refreshNetwork, sourceOf, store, summaryOf, zwaveDevices, zwaveId } from "./z-wave-nodes.js";
import { baseTopic, fetchZui, releaseZui, zuiNetwork, zuiRebuild } from "./zwave-js-ui-mqtt.js";
import { inDialog, morph, sceneSvg, watchOutside } from "./shadow-dom-patching.js";
import { BANNER_STYLE, COMMON_STYLE, FULL_STYLE, textWidth } from "./styles.js";

// The popup key of the rebuild's confirmation (node popups are keyed by device id).
export const REBUILD = "@rebuild";

export class ZWaveCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._html = "";
    this._detail = null;
    this.shadowRoot.addEventListener("click", (ev) => this._click(ev));
    this.shadowRoot.addEventListener("keydown", (ev) => {
      if ((ev.key === "Enter" || ev.key === " ") && ev.target.getAttribute?.("role") === "button") {
        ev.preventDefault();
        ev.target.click();
      }
    });
    this._onKey = (ev) => {
      if (this._detail && ev.key === "Escape") {
        ev.stopPropagation();
        this._closeDetail(true);
      }
    };
    // A click elsewhere on the page closes the node popup (and only that: a zoomed mini card stays zoomed).
    this._onOutside = (ev) => {
      if (this._detail && !inDialog(ev)) {
        this._detailClosedBy = ev;
        this._closeDetail(false);
      }
    };
  }

  static getConfigElement() {
    return document.createElement("zwave-card-editor");
  }

  static getStubConfig() {
    return {};
  }

  getCardSize() {
    const n = this._infos?.length ?? 4;
    return 3 + Math.ceil(n / this._cols());
  }

  // 8 columns: 208 px on a phone.
  getGridOptions() {
    return { columns: 12, min_columns: 8 };
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
    // show_title / show_subtitle: the header's title and its stats line, hidden by the stylesheet (the pill stays).
    this.toggleAttribute?.("hide-title", config.show_title === false);
    this.toggleAttribute?.("hide-subtitle", config.show_subtitle === false);
    this._html = "";
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const sig = this._signature();
    if (this._sig && sig.length === this._sig.length && sig.every((v, i) => v === this._sig[i])) return;
    this._update(sig);
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    store.cards.add(this);
    (this._outsideWatch ??= watchOutside(this, (ev) => this._onOutside(ev))).on();
    // The durations ("Dead · 12 min") follow the clock: checked every minute.
    clearInterval(this._timer);
    this._timer = setInterval(() => this._hass && this._config && (this.hass = this._hass), 60000);
    if (!this._fitObserver && typeof ResizeObserver === "function") this._fitObserver = new ResizeObserver(() => this._fitPill());
    this._fitObserver?.observe(this);
    document.fonts?.ready?.then(() => this._fitPill(true));
    this._update();
  }

  disconnectedCallback() {
    store.cards.delete(this);
    if (this._zuiUsed) releaseZui(this._zuiUsed, this);
    this._zuiUsed = null;
    this._outsideWatch?.off();
    this._fitObserver?.disconnect();
    clearInterval(this._timer);
    // Left (another view, a conditional card hidden): the popup closes without anything else.
    this._detail = null;
    window.removeEventListener("keydown", this._onKey);
  }

  // New websocket data (network status): drawn again.
  _dataChanged() {
    if (this._hass && this._config) this._update();
  }

  _t(key, vars) {
    return t(this._hass, this._config, key, vars);
  }

  _p(key, n) {
    return plural(this._hass, this._config, key, this._num(n));
  }

  _loc() {
    return fmtLang(this._hass, this._config);
  }

  _num(n) {
    try {
      return new Intl.NumberFormat(this._loc()).format(n);
    } catch (_e) {
      return String(n);
    }
  }

  _now() {
    return Date.now();
  }

  _cols() {
    return Math.max(1, Math.min(4, Math.round(num(this._config?.columns) ?? 2)));
  }

  // What the render depends on: language, dark mode, the registries, the states of the Z-Wave entities, the
  // websocket data and the minute.
  _signature() {
    const h = this._hass;
    const { controllers, nodes } = zwaveDevices(h, this._config, this._net().own);
    const byDev = entitiesByDevice(h);
    const ids = [];
    for (const d of [...controllers, ...nodes]) for (const e of byDev.get(d.id) || []) ids.push(e.entity_id);
    return [
      h.language,
      h.locale,
      h.themes?.darkMode,
      h.devices,
      h.entities,
      h.user?.is_admin,
      store.rev,
      ...ids.map((id) => h.states?.[id]),
      Math.floor(this._now() / 60000),
    ];
  }

  _update(sig) {
    if (!this._hass || !this._config) return;
    this._sig = sig ?? this._signature();
    this._collect();
    this._refresh();
    const html = this._render();
    if (html !== this._html) {
      this._html = html;
      morph(this.shadowRoot, html);
    }
    this._fitPill();
  }

  // Z-Wave JS UI over MQTT (sourceOf): its MQTT prefix, else null for the zwave_js integration.
  _zuiTopic() {
    return sourceOf(this._hass, this._config) === "zwave_js_ui" ? baseTopic(this._config) : null;
  }

  // The network data of the integration read: zwave_js's network status, or Z-Wave JS UI's MQTT API.
  _net() {
    const topic = this._zuiTopic();
    return topic ? zuiNetwork(topic) : networkNodes();
  }

  // Asks the network data that is due (administrators): the network status of each zwave_js controller, or the
  // MQTT subscriptions and the API calls of Z-Wave JS UI (released when the card leaves the page or the source
  // changes).
  _refresh() {
    const topic = this._zuiTopic();
    if (this._zuiUsed && this._zuiUsed !== topic) releaseZui(this._zuiUsed, this);
    this._zuiUsed = topic;
    if (topic) fetchZui(this._hass, topic, this);
    else refreshNetwork(this._hass, this._controllers.map((c) => c.device));
  }

  // The controllers and the nodes, sorted (by name, or issues first), and their summary.
  _collect() {
    const h = this._hass;
    const c = this._config;
    const net = this._net();
    const { controllers, nodes } = zwaveDevices(h, c, net.own);
    const threshold = num(c.battery_threshold) ?? 20;
    const infos = nodes.map((d) => {
      const id = zwaveId(d);
      return nodeInfo(h, d, { ws: id ? (net.nodes.get(`${id.home}-${id.node}`) ?? null) : null, threshold });
    });
    const rank = { alert: 0, warn: 1, ok: 2 };
    const byName = (a, b) => a.name.localeCompare(b.name, this._loc(), { sensitivity: "base" });
    infos.sort(c.sort === "status" ? (a, b) => rank[a.level] - rank[b.level] || byName(a, b) : byName);
    this._infos = infos;
    this._summary = summaryOf(infos);
    // Z-Wave JS UI: its gateways once its API answered, else the controller devices of its discovery, if any.
    this._controllers = net.controllers?.length ? net.controllers : controllers.map((d) => controllerOf(d, store.net.get(d.id)?.data ?? null));
  }

  // Night banner: forced by illustration_theme, else Home Assistant's dark theme alone (a light theme keeps the day
  // banner after sunset).
  _night() {
    const mode = this._config.illustration_theme;
    if (mode === "night") return true;
    if (mode === "day") return false;
    return !!this._hass?.themes?.darkMode;
  }

  // "12 min", "3 h", "2 d".
  _duration(ms) {
    const m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return this._t("dur_min", { n: this._num(m) });
    const h = Math.round(m / 60);
    if (h < 48) return this._t("dur_h", { n: this._num(h) });
    return this._t("dur_d", { n: this._num(Math.round(h / 24)) });
  }

  // "5 minutes ago", "now".
  _ago(ms) {
    const s = Math.round((ms - this._now()) / 1000);
    const units = [
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
    ];
    try {
      const rtf = new Intl.RelativeTimeFormat(this._loc(), { numeric: "auto" });
      for (const [u, size] of units) if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), u);
      return rtf.format(0, "second");
    } catch (_e) {
      return new Date(ms).toISOString();
    }
  }

  _fmtState(st) {
    if (!st) return "";
    let out;
    try {
      out = typeof this._hass?.formatEntityState === "function" ? this._hass.formatEntityState(st) : null;
    } catch (_e) {
      out = null;
    }
    if (!out) {
      const unit = st.attributes?.unit_of_measurement;
      out = `${st.state}${unit ? ` ${unit}` : ""}`;
    }
    // A true minus sign for a negative reading ("−58 dBm").
    return String(out).replace(/^-(?=\d)/, "−");
  }

  _dbm(v) {
    return `${this._num(v).replace(/^-/, "−")} dBm`;
  }

  _pct(v) {
    return `${this._num(Math.round(v))}%`;
  }

  // The state line of a node: what is wrong, else its main entity's state and one reading (power, signal, battery);
  // a sleeping node says so, with its battery.
  _stateLine(i) {
    if (!i.available) return [this._t("state_dead"), i.since ? this._duration(this._now() - i.since) : ""].filter(Boolean).join(" · ");
    if (i.lowBattery) return this._t("battery", { pct: i.battery !== null ? this._pct(i.battery) : "" }).trim();
    if (i.asleep) return [this._t("state_asleep"), i.battery !== null ? this._pct(i.battery) : ""].filter(Boolean).join(" · ");
    const st = i.main ? this._hass.states[i.main] : null;
    const parts = [];
    if (st && !unavailableState(st)) parts.push(this._fmtState(st));
    if (i.power) parts.push(this._fmtState(i.power));
    else if (i.rssi !== null) parts.push(this._dbm(i.rssi));
    else if (i.battery !== null) parts.push(this._pct(i.battery));
    return parts.filter(Boolean).join(" · ") || this._t(i.status === "awake" ? "state_awake" : "state_alive");
  }

  _iconHtml(icon) {
    return icon.mdi ? `<ha-icon icon="${esc(icon.mdi)}"></ha-icon>` : svgIcon(icon.path);
  }

  // The security tag (S2 Access, S2 Auth, S2, S0; "Not secure" only in the popup) and the Long Range tag.
  _tags(i, full = false) {
    const out = [];
    if (i.security && SECURITY_TAGS[i.security]) out.push(`<span class="tag ${i.security}">${esc(SECURITY_TAGS[i.security])}</span>`);
    else if (full && i.security === "none") out.push(`<span class="tag none">${esc(this._t("sec_none"))}</span>`);
    if (i.longRange) out.push(`<span class="tag lr">LR</span>`);
    return out.join("");
  }

  _tagText(i) {
    return [SECURITY_TAGS[i.security], i.longRange ? this._t("long_range") : ""].filter(Boolean).join(", ");
  }

  _chip(cls, text) {
    return `<span class="chip ${cls}"><span class="dot"></span><span class="txt">${esc(text)}</span></span>`;
  }

  _statsText() {
    const parts = [];
    const v = driverVersion(this._hass, this._controllers);
    if (v) parts.push(this._t("driver", { version: v }));
    parts.push(this._p("nodes", this._summary.total));
    const regions = [...new Set(this._controllers.map((c) => c.region).filter(Boolean))];
    if (regions.length) parts.push(regions.join(" · "));
    return parts;
  }

  // A controller whose driver is disconnected counts as an issue.
  _disconnected() {
    return this._controllers.filter((c) => !c.connected).length;
  }

  // The network's status, the colour of the Z-Wave badge: a dead node or a disconnected driver first, then a low
  // battery.
  _level() {
    const s = this._summary;
    if (!s.total && !this._controllers.length) return "na";
    return s.dead || this._disconnected() ? "alert" : s.lowBattery ? "warn" : s.total ? "ok" : "na";
  }

  // The status pill: the network's state in the badge's colour (a dot and its label) — no node, how many issues
  // (a dead node, a low battery or a disconnected driver), else healthy.
  _pill() {
    const s = this._summary;
    const issues = s.issues + this._disconnected();
    const text = issues ? this._p("issues", issues) : !s.total ? this._t("no_nodes") : this._t("healthy");
    return `<span class="chip bst s-${this._level()}" role="img" title="${esc(text)}" aria-label="${esc(text)}"><span class="dot"></span><span class="txt">${esc(text)}</span></span>`;
  }

  // The banner's status pill, measured after each render and on a new width (in every language): it sits on the
  // title's row, right after the title, only when the whole title and the pill's whole label fit there; otherwise it
  // takes a line of its own under the subtitle (.below), the title whole on its row (cut only when it does not fit
  // alone) and the subtitle on one line. When the three lines do not fit in the banner above the ground strip, or
  // the label does not fit its line, the pill shows its dot alone (.dot-only): beside the title when the whole title
  // leaves it room, else under the subtitle.
  // The result is kept with what it depends on (the header's width, the title, the pill's label, the buttons beside
  // them) and drawn by the next renders: a state change that leaves the header as it was changes nothing in it, and
  // the header is measured again only when one of these changes (or the fonts load, `force`).
  _fitPill(force = false) {
    this._fits ??= new Map();
    for (const t of this.shadowRoot?.querySelectorAll?.(".head .titles, .header .titles, .mhead") || []) {
      const row = t.matches(".mhead") ? t : t.querySelector(".trow");
      const chips = row ? [...row.querySelectorAll(":scope > .bst")] : [];
      if (!chips[0]?.getBoundingClientRect) continue;
      const name = row.querySelector(".name, .title");
      const kind = this._fitKind(t);
      const shownName = name && getComputedStyle(name).display !== "none";
      const key = [
        Math.round(t.getBoundingClientRect().width * 10),
        shownName ? name.textContent : "",
        chips.map((c) => c.textContent).join("|"),
        [...row.children].filter((c) => c !== name && !chips.includes(c)).length,
      ].join("\n");
      const prev = this._fits.get(kind);
      const cls = !force && prev?.key === key ? prev.cls : this._measurePill(t, row, chips, name, shownName);
      this._fits.set(kind, { key, cls });
      // toggle() with a force leaves an attribute that is already right untouched (no mutation).
      t.classList.toggle("below", cls.includes("below"));
      t.classList.toggle("dot-only", cls.includes("dot-only"));
    }
  }

  // Which header a fitted pill belongs to: the banner's titles, the classic header's, or the compact mini card's row.
  _fitKind(t) {
    return t.matches(".mhead") ? "mini" : t.closest(".banner") ? "banner" : "header";
  }

  // The classes the header keeps from its last fit (none before it is first measured).
  _fitCls(kind) {
    const cls = this._fits?.get(kind)?.cls;
    return cls ? ` ${cls}` : "";
  }

  // Measures the header from scratch and returns its classes ("", "below", "dot-only" or "below dot-only").
  _measurePill(t, row, chips, name, shownName) {
    t.classList.remove("below", "dot-only");
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    // A positive margin beside the title is the detail button's auto margin (pushed to the right): free room, not
    // width taken; its negative margins do count.
    const margin = (v) => Math.min(parseFloat(v) || 0, 0);
    const outer = (c) => c.getBoundingClientRect().width + margin(getComputedStyle(c).marginLeft) + margin(getComputedStyle(c).marginRight);
    const others = [...row.children].filter((c) => c !== name && !chips.includes(c) && c.getClientRects().length);
    const room = row.getBoundingClientRect().width - others.reduce((w, c) => w + outer(c) + gap, 0);
    const title = shownName ? textWidth(name) + gap : 0;
    const pills = () => chips.reduce((w, c) => w + c.getBoundingClientRect().width, gap * (chips.length - 1));
    if (title + pills() <= room) return "";
    t.classList.add("below");
    const banner = t.closest(".banner") || t;
    const ground = banner.querySelector(".strip");
    const floor = ground ? ground.getBoundingClientRect().top : banner.getBoundingClientRect().bottom;
    const box = t.getBoundingClientRect();
    const whole = chips.every((c) => {
      const tx = c.querySelector(".txt");
      return !tx || tx.scrollWidth <= tx.clientWidth + 0.5;
    });
    if (whole && box.bottom <= floor + 0.5 && box.top >= banner.getBoundingClientRect().top - 0.5) return "below";
    t.classList.add("dot-only");
    return title + pills() <= room ? "dot-only" : "below dot-only";
  }

  _badgeHtml() {
    return `<div class="badge s-${this._level()}">${zwaveLogo()}</div>`;
  }

  _bannerOpen() {
    const night = this._night();
    return `<div class="banner${night ? " night" : ""}${this._disconnected() ? " drv-off" : ""}">
      ${sceneSvg(this._summary.dead > 0, this._summary.asleep > 0)}
      <div class="strip"></div>`;
  }

  _titleBlock() {
    const stats = this._statsText();
    return `${this._badgeHtml()}
      <div class="titles${this._fitCls(this._config.illustration === false ? "header" : "banner")}">
        <div class="trow"><div class="name">${esc(this._config.title || this._t("title"))}</div>${this._pill()}</div>
        <div class="stats" title="${esc(stats.join(" · "))}">${stats.map((s) => `<span>${esc(s)}</span>`).join("")}</div>
      </div>`;
  }

  _header() {
    if (this._config.illustration === false) return `<div class="header">${this._titleBlock()}${this._zoomButton("plain")}</div>`;
    return `${this._bannerOpen()}
      <div class="head">${this._titleBlock()}</div>${this._zoomButton(this._night() ? "on-night" : "")}
    </div>`;
  }

  _statusRow() {
    const s = this._summary;
    const chips = [this._chip("ok", this._t("alive_count", { n: this._num(s.alive), total: this._num(s.total) }))];
    if (s.dead) chips.push(this._chip("alert", this._p("dead", s.dead)));
    if (s.asleep) chips.push(this._chip("na", this._p("asleep", s.asleep)));
    if (s.lowBattery) chips.push(this._chip("warn", this._p("low_battery", s.lowBattery)));
    const busy = this._controllers.find((c) => c.rebuilding);
    const aside = busy ? `<span class="aside">${esc(this._t("rebuilding", { pct: busy.pct !== null ? this._pct(busy.pct) : "…" }))}</span>` : "";
    return `<div class="status">${chips.join("")}${aside}</div>`;
  }

  // One tile per controller: its model, its home id, its SDK and its region; to the Z-Wave JS page (administrators).
  _controllerTiles() {
    if (this._config.show_controller === false) return "";
    return this._controllers
      .map((c) => {
        const d = c.device;
        const model = [d.manufacturer, d.model].filter(Boolean).join(" ");
        const title = model ? `${this._t("controller")} · ${model}` : this._t("controller");
        const line = c.connected
          ? [c.home ? this._t("home_id", { id: c.home }) : "", c.sdk ? this._t("sdk", { v: c.sdk }) : "", c.region || ""].filter(Boolean)
          : [this._t("disconnected")];
        const nav = isAdmin(this._hass) && c.entry ? ` role="button" tabindex="0" data-nav="/config/zwave_js/dashboard?config_entry=${esc(c.entry)}"` : "";
        const count = this._infos.filter((i) => i.home === null || c.home === null || i.home === Number.parseInt(c.home, 16)).length;
        return `<div class="tile controller lvl-${c.level}" data-key="c-${esc(c.id)}"${nav} aria-label="${esc([title, ...line].join(", "))}">
      <span class="ic">${svgIcon(ICONS.stick)}<span class="sdot"></span></span>
      <span class="txt"><span class="tname">${esc(title)}</span>${line.length ? `<span class="tstate">${esc(line.join(" · "))}</span>` : ""}</span>
      ${this._chip(c.level, this._p("nodes", count))}
    </div>`;
      })
      .join("");
  }

  _tile(i) {
    const state = this._stateLine(i);
    const label = [i.name, state, this._tagText(i)].filter(Boolean).join(", ");
    const tags = this._tags(i);
    return `<div class="tile lvl-${i.level}${i.asleep ? " asleep" : ""}" role="button" tabindex="0" data-key="n-${esc(i.id)}" data-node="${esc(i.id)}" aria-label="${esc(label)}">
      <span class="ic">${this._iconHtml(i.icon)}<span class="sdot"></span></span>
      <span class="txt"><span class="tname" title="${esc(i.name)}">${esc(i.name)}</span><span class="tsub"><span class="tstate">${esc(state)}</span>${tags ? `<span class="tags">${tags}</span>` : ""}</span></span>
    </div>`;
  }

  // The first controller an administrator can act on (one with its config entry and a connected driver).
  _actionable() {
    if (!isAdmin(this._hass)) return null;
    return this._controllers.find((x) => (x.entry || x.zui) && x.connected) || null;
  }

  // The buttons (administrators): rebuild the routes (or stop a rebuild in progress), after a confirmation; and the
  // Z-Wave JS page of the first controller, where devices are added.
  _manage() {
    const c = this._actionable();
    const settings = this._config.show_manage !== false && isAdmin(this._hass) && this._controllers.find((x) => x.entry);
    const buttons = [];
    if (c && this._config.show_rebuild !== false)
      buttons.push(
        `<button class="btn" data-action="rebuild">${svgIcon(c.rebuilding ? ICONS.stop : ICONS.refresh)}<span>${esc(this._t(c.rebuilding ? "stop_rebuild" : "rebuild"))}</span></button>`,
      );
    if (settings)
      buttons.push(`<button class="btn" data-nav="/config/zwave_js/dashboard?config_entry=${esc(settings.entry)}">${svgIcon(ICONS.cog)}<span>${esc(this._t("manage"))}</span></button>`);
    return buttons.length ? `<div class="actions">${buttons.join("")}</div>` : "";
  }

  // The confirmation of a routes rebuild (or of its stop), in the node popup's place at the top of the card.
  _rebuildHtml() {
    const c = this._actionable();
    if (!c) return "";
    const stop = c.rebuilding;
    const busy = this._busy ? ' aria-busy="true"' : "";
    return `<div class="backdrop" data-action="backdrop">
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="zw-dlg-title" aria-describedby="zw-dlg-msg">
        <div class="mhead">
          <span class="ic lvl-ok">${svgIcon(stop ? ICONS.stop : ICONS.refresh)}</span>
          <div><h3 id="zw-dlg-title">${esc(this._t(stop ? "stop_title" : "rebuild_title"))}</h3></div>
          <button class="close" data-action="close" title="${esc(this._t("close"))}" aria-label="${esc(this._t("close"))}">${svgIcon(ICONS.close)}</button>
        </div>
        <p class="msg" id="zw-dlg-msg">${esc(this._t(stop ? "stop_text" : "rebuild_text"))}</p>
        ${this._failed ? `<p class="err" role="alert">${esc(this._t("command_failed"))}</p>` : ""}
        <div class="actions">
          <button class="btn quiet" data-action="close">${esc(this._t("cancel"))}</button>
          <button class="btn" data-action="confirm"${busy}>${svgIcon(stop ? ICONS.stop : ICONS.refresh)}<span>${esc(this._t(stop ? "stop" : "start"))}</span></button>
        </div>
      </div>
    </div>`;
  }

  // Runs the confirmed command; the popup closes when it is accepted, and says so when it fails.
  _runRebuild() {
    const c = this._actionable();
    if (!c || this._busy) return;
    this._busy = true;
    this._failed = false;
    this._update(this._sig);
    (c.zui ? zuiRebuild(this._hass, c, c.rebuilding) : rebuildRoutes(this._hass, c, c.rebuilding))
      .then(
        () => {
          this._busy = false;
          this._closeDetail(true);
          this._refresh();
        },
        () => {
          this._busy = false;
          this._failed = true;
          this._update(this._sig);
        },
      );
  }

  _noDevices() {
    return `<style>${COMMON_STYLE}</style><ha-card><div class="warning">${esc(this._t("no_devices"))}</div></ha-card>`;
  }

  _render() {
    if (!this._infos.length && !Object.values(this._hass?.devices || {}).some(isZwaveDevice)) return this._noDevices();
    return `<style>${COMMON_STYLE}${BANNER_STYLE}${FULL_STYLE}${this._extraStyle()}</style>
      <ha-card style="--cols:${this._cols()}">
        ${this._header()}
        ${this._statusRow()}
        <div class="content">
          ${this._controllerTiles()}
          ${this._infos.length ? `<div class="grid">${this._infos.map((i) => this._tile(i)).join("")}</div>` : `<div class="empty">${esc(this._t("no_nodes"))}</div>`}
          ${this._manage()}
        </div>
        ${this._detailHtml()}
      </ha-card>`;
  }

  _extraStyle() {
    return "";
  }

  // The full card has no detail button.
  _zoomButton() {
    return "";
  }

  _detailHtml() {
    const id = this._detail;
    if (!id) return "";
    if (id === REBUILD) return this._rebuildHtml();
    const i = this._infos.find((x) => x.id === id);
    if (!i) return "";
    const d = i.device;
    const security = i.security === "none" ? this._t("sec_none") : SECURITY_TAGS[i.security];
    const facts = [
      [this._t("node_id"), i.node !== null ? String(i.node) : null],
      [this._t("status"), this._t(i.status === "unknown" ? "unknown" : `state_${i.status}`)],
      [this._t("vendor"), d.manufacturer],
      [this._t("product"), [d.model, d.model_id && d.model_id !== d.model ? `(${d.model_id})` : ""].filter(Boolean).join(" ")],
      [this._t("firmware"), d.sw_version],
      [this._t("protocol"), i.longRange ? `Z-Wave ${this._t("long_range")}` : "Z-Wave"],
      [this._t("security"), security],
      ["Z-Wave Plus", i.zwavePlus ? `v${i.zwavePlus}` : null],
      [this._t("rssi"), i.rssi !== null ? this._dbm(i.rssi) : null],
      [this._t("battery", { pct: "" }).trim(), i.battery !== null ? this._pct(i.battery) : null],
      [this._t("last_seen"), i.lastSeen ? this._ago(i.lastSeen) : null],
    ].filter(([, v]) => v);
    const chips = [this._chip(i.level === "ok" ? (i.asleep ? "na" : "ok") : i.level, this._stateLine(i))];
    const sub = [d.manufacturer, d.model].filter(Boolean).join(" · ");
    return `<div class="backdrop" data-action="backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="zw-dlg-title">
        <div class="mhead">
          <span class="ic lvl-${i.level}">${this._iconHtml(i.icon)}</span>
          <div><h3 id="zw-dlg-title">${esc(i.name)}</h3>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>
          <button class="close" data-action="close" title="${esc(this._t("close"))}" aria-label="${esc(this._t("close"))}">${svgIcon(ICONS.close)}</button>
        </div>
        <div class="mchips">${chips.join("")}${this._tags(i, true)}</div>
        <dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        <div class="actions"><button class="btn" data-nav="/config/devices/device/${esc(i.id)}">${svgIcon(ICONS.open)}<span>${esc(this._t("open_device"))}</span></button></div>
      </div>
    </div>`;
  }

  // Opens the node popup; from the keyboard (no click count), the focus goes to its close button.
  _openDetail(id, keyboard = false) {
    this._detail = id;
    window.addEventListener("keydown", this._onKey);
    this._update(this._sig);
    if (keyboard) this.shadowRoot.querySelector?.(".modal .close")?.focus({ preventScroll: true });
  }

  _closeDetail(refocus) {
    if (!this._detail) return;
    const id = this._detail;
    this._detail = null;
    this._failed = false;
    window.removeEventListener("keydown", this._onKey);
    this._update(this._sig);
    const back = id === REBUILD ? '.btn[data-action="rebuild"]' : `.tile[data-node="${CSS.escape(id)}"]`;
    if (refocus) this.shadowRoot.querySelector?.(back)?.focus({ preventScroll: true });
  }

  _click(ev) {
    const path = ev.composedPath();
    const action = path.find((n) => n.dataset?.action);
    const nav = path.find((n) => n.dataset?.nav);
    if (this._detail) {
      if (nav) {
        this._closeDetail(false);
        navigate(nav.dataset.nav);
        return;
      }
      // While the popup is open, its close button and the backdrop close it; a click in it does nothing else, but
      // for the rebuild's confirmation.
      if (action?.dataset.action === "confirm" && this._detail === REBUILD) this._runRebuild();
      else if (action?.dataset.action === "close" || (action?.dataset.action === "backdrop" && path[0] === action)) this._closeDetail(true);
      return;
    }
    if (action?.dataset.action === "rebuild") {
      this._failed = false;
      this._openDetail(REBUILD, ev.detail === 0);
      return;
    }
    if (nav) {
      navigate(nav.dataset.nav);
      return;
    }
    const tile = path.find((n) => n.dataset?.node);
    if (tile) this._openDetail(tile.dataset.node, ev.detail === 0);
  }
}
