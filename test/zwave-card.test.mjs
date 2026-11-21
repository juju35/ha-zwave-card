import assert from "node:assert/strict";
import { test } from "node:test";
import { HOME, mockHass, NOW } from "../scripts/screenshots/mock.mjs";
import { load } from "./load.mjs";

const zc = load([
  "zwaveId",
  "zwaveDevices",
  "deviceEntities",
  "nodeInfo",
  "summaryOf",
  "controllerOf",
  "securityOf",
  "statusName",
  "refreshNetwork",
  "networkNodes",
  "driverVersion",
  "store",
  "plural",
  "STRINGS",
  "ZWaveCard",
  "ZWaveMiniCard",
  "ZWaveCardEditor",
  "ZWaveMiniCardEditor",
  "document",
  "window",
  "history",
]);

// The websocket answers of the mock, in the shared store, as if the cards had asked them.
const settle = () => new Promise((r) => setTimeout(r, 0));
const withData = async (hass = mockHass()) => {
  zc.store.net.clear();
  const { controllers } = zc.zwaveDevices(hass);
  zc.refreshNetwork(hass, controllers);
  for (let i = 0; i < 10; i++) await settle();
  return hass;
};
const noData = () => zc.store.net.clear();
const card = (Cls, config = {}, hass = mockHass()) => {
  const el = new Cls();
  el._now = () => NOW;
  el._config = { type: "custom:x", ...config };
  el._hass = hass;
  el._update = () => {};
  return el;
};
const render = (el) => {
  el._collect();
  return el._render();
};
const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("a Z-Wave device identifier gives its home id and node id", () => {
  assert.deepEqual({ ...zc.zwaveId({ identifiers: [["zwave_js", "3786842820-7"]] }) }, { home: 3786842820, node: 7 });
  assert.deepEqual({ ...zc.zwaveId({ identifiers: [["zwave_js", "3786842820-260-0x0086:0x0003:0x0104"]] }) }, { home: 3786842820, node: 260 });
  assert.equal(zc.zwaveId({ identifiers: [["zha", "00:11"]] }), null);
});

test("the controller is the network's own node, the other Z-Wave devices are nodes; exclude leaves some out", () => {
  const hass = mockHass();
  const { controllers, nodes } = zc.zwaveDevices(hass);
  assert.deepEqual([...controllers.map((d) => d.id)], ["dev_ctrl"]);
  assert.equal(nodes.length, 9);
  assert.ok(!nodes.some((d) => d.id === "dev_other"));
  assert.equal(zc.zwaveDevices(hass, { exclude: ["dev_plug", "hall dimmer"] }).nodes.length, 7);
  // Another own node id, from the network status.
  const own = new Map([[String(HOME), 2]]);
  assert.deepEqual([...zc.zwaveDevices(hass, {}, own).controllers.map((d) => d.id)], ["dev_dimmer"]);
});

test("the device scan is kept per registry, exclude and own node ids", () => {
  const hass = mockHass();
  const a = zc.zwaveDevices(hass, {});
  assert.equal(zc.zwaveDevices(hass, {}), a);
  const b = zc.zwaveDevices(hass, { exclude: ["Kitchen plug"] });
  assert.notEqual(b, a);
  assert.equal(b.nodes.length, a.nodes.length - 1);
  assert.notEqual(zc.zwaveDevices({ ...hass, devices: { ...hass.devices } }, {}), a);
});

test("a node's main entity, battery, power, signal, node status and last seen sensors", () => {
  const hass = mockHass();
  const lock = zc.deviceEntities(hass, "dev_lock");
  assert.equal(lock.main, "lock.front_door_lock");
  assert.equal(lock.battery, "sensor.front_door_lock_battery");
  assert.equal(lock.rssi, "sensor.front_door_lock_signal_strength");
  assert.equal(lock.status, "sensor.front_door_lock_node_status");
  assert.equal(zc.deviceEntities(hass, "dev_plug").power, "sensor.kitchen_plug_power");
  assert.equal(zc.deviceEntities(hass, "dev_attic").main, "sensor.attic_sensor_temperature");
});

test("status names and security classes of Z-Wave JS", () => {
  assert.equal(zc.statusName(1), "asleep");
  assert.equal(zc.statusName(3), "dead");
  assert.equal(zc.statusName("Alive"), "alive");
  assert.equal(zc.statusName("whatever"), null);
  assert.equal(zc.securityOf({ highest_security_class: 2 }), "s2_access");
  assert.equal(zc.securityOf({ highest_security_class: 1 }), "s2_auth");
  assert.equal(zc.securityOf({ highest_security_class: 0 }), "s2_unauth");
  assert.equal(zc.securityOf({ highest_security_class: 7 }), "s0");
  assert.equal(zc.securityOf({ highest_security_class: -1, is_secure: false }), "none");
  assert.equal(zc.securityOf(null), null);
});

test("levels and statuses without the network status (non-admin): from the node status sensor, else unavailable entities", () => {
  noData();
  const hass = mockHass();
  const info = (id, h = hass) => zc.nodeInfo(h, h.devices[id]);
  assert.equal(info("dev_garage").status, "dead");
  assert.equal(info("dev_garage").level, "alert");
  assert.equal(info("dev_patio").status, "asleep");
  assert.equal(info("dev_patio").level, "ok");
  assert.equal(info("dev_blind").level, "warn");
  assert.equal(info("dev_lock").level, "ok");
  assert.equal(info("dev_shed").longRange, true);
  assert.equal(info("dev_lock").security, null);
  // Without the status sensor, a node whose entities are all unavailable is dead.
  const states = { ...hass.states };
  delete states["sensor.garage_sensor_node_status"];
  assert.equal(info("dev_garage", { ...hass, states }).status, "dead");
  // A dead node's battery is no warning.
  assert.equal(info("dev_garage").lowBattery, false);
});

test("the network status is asked once per controller through zwave_js/network_status, then kept for a minute", async () => {
  const asked = [];
  const base = mockHass();
  const hass = {
    ...base,
    callWS: (m) => {
      asked.push(m);
      return base.callWS(m);
    },
  };
  await withData(hass);
  assert.deepEqual(asked.map((m) => ({ ...m })), [{ type: "zwave_js/network_status", device_id: "dev_ctrl" }]);
  zc.refreshNetwork(hass, zc.zwaveDevices(hass).controllers);
  for (let i = 0; i < 5; i++) await settle();
  assert.equal(asked.length, 1);
  const net = zc.networkNodes();
  assert.equal(net.nodes.get(`${HOME}-3`).highest_security_class, 2);
  assert.equal(net.own.get(String(HOME)), 1);
});

test("a non-admin user asks nothing and gets no settings button", async () => {
  noData();
  const asked = [];
  const base = mockHass({ admin: false });
  const hass = { ...base, callWS: (m) => asked.push(m) };
  zc.refreshNetwork(hass, zc.zwaveDevices(hass).controllers);
  await settle();
  assert.equal(asked.length, 0);
  const html = render(card(zc.ZWaveCard, {}, hass));
  assert.doesNotMatch(html, /Z-Wave JS settings/);
  assert.doesNotMatch(html, /data-nav="\/config\/zwave_js/);
  // The tiles still show the statuses, from the node status sensors.
  assert.match(text(html), /Dead · 3 h/);
});

test("summary and controller", async () => {
  await withData();
  const hass = mockHass();
  const infos = zc.zwaveDevices(hass).nodes.map((d) => zc.nodeInfo(hass, d, { ws: zc.networkNodes().nodes.get(`${HOME}-${zc.zwaveId(d).node}`) }));
  const s = zc.summaryOf(infos);
  assert.deepEqual({ ...s }, { total: 9, alive: 8, dead: 1, asleep: 2, lowBattery: 1, longRange: 1, issues: 2 });
  const c = zc.controllerOf(hass.devices.dev_ctrl, zc.store.net.get("dev_ctrl").data);
  assert.equal(c.home, "0xE1B6A2C4");
  assert.equal(c.sdk, "7.22.1");
  assert.equal(c.region, "EU LR");
  assert.equal(c.driver, "15.2.1");
  assert.equal(c.connected, true);
  assert.equal(c.entry, "zwave_entry");
});

test("the full card: banner stats, status chips, controller tile, one tile per node with its tags, and the settings button", async () => {
  const hass = await withData();
  const html = render(card(zc.ZWaveCard, {}, hass));
  const txt = text(html);
  assert.match(txt, /Z-Wave network 2 issues/);
  assert.match(txt, /Z-Wave JS 15\.2\.1 9 nodes EU LR/);
  assert.match(txt, /8 \/ 9 alive 1 dead 2 asleep 1 low battery/);
  assert.match(txt, /Controller · Northgate Z-Stick 800 LR Home ID 0xE1B6A2C4 · SDK 7\.22\.1 · EU LR 9 nodes/);
  assert.match(html, /data-nav="\/config\/zwave_js\/dashboard\?config_entry=zwave_entry"/);
  assert.equal((html.match(/data-node=/g) || []).length, 9);
  assert.match(txt, /Front door lock Locked · −67 dBm S2 Access/);
  assert.match(txt, /Garage sensor Dead · 3 h S0/);
  assert.match(txt, /Patio door Asleep · 88% S2 Auth/);
  assert.match(txt, /Bedroom blind Battery 17% S2 Auth/);
  assert.match(txt, /Garden shed sensor Clear · −91 dBm S2 Auth LR/);
  assert.match(txt, /Kitchen plug On · 37\.5 W S2/);
  assert.match(txt, /Z-Wave JS settings/);
  // The banner: the dead lock and the dozing thermometer.
  assert.match(html, /class="dev down"/);
  assert.match(html, /class="dev sleep"/);
  assert.match(html, /class="tile lvl-ok asleep"/);
});

test("rebuilding routes and a disconnected driver", async () => {
  const busy = render(card(zc.ZWaveCard, {}, await withData(mockHass({ rebuilding: true }))));
  assert.match(text(busy), /Rebuilding routes · 44%/);
  const off = render(card(zc.ZWaveCard, {}, await withData(mockHass({ disconnected: true, healthy: true }))));
  assert.match(text(off), /Controller · Northgate Z-Stick 800 LR Driver disconnected/);
  assert.match(off, /class="badge s-alert"/);
  assert.match(text(off), /1 issue/);
  const mini = render(card(zc.ZWaveMiniCard, {}, await withData(mockHass({ disconnected: true, healthy: true }))));
  assert.match(text(mini), /Driver disconnected/);
});

test("sort, columns, show_controller, show_manage and illustration", async () => {
  const hass = await withData();
  const first = (html) => /data-node="([^"]+)"/.exec(html)[1];
  assert.equal(first(render(card(zc.ZWaveCard, {}, hass))), "dev_attic");
  assert.equal(first(render(card(zc.ZWaveCard, { sort: "status" }, hass))), "dev_garage");
  assert.match(render(card(zc.ZWaveCard, { columns: 3 }, hass)), /--cols:3/);
  assert.doesNotMatch(render(card(zc.ZWaveCard, { show_controller: false }, hass)), /tile controller/);
  assert.doesNotMatch(render(card(zc.ZWaveCard, { show_manage: false }, hass)), /Z-Wave JS settings/);
  const classic = render(card(zc.ZWaveCard, { illustration: false }, hass));
  assert.doesNotMatch(classic, /class="scene"/);
  assert.match(classic, /class="header"/);
});

test("the Z-Wave badge's colour is the network's status, on both cards", async () => {
  const issues = await withData();
  assert.match(render(card(zc.ZWaveCard, {}, issues)), /class="badge s-alert"/);
  assert.match(render(card(zc.ZWaveMiniCard, {}, issues)), /class="badge s-alert"/);
  const healthy = await withData(mockHass({ healthy: true }));
  assert.match(render(card(zc.ZWaveCard, {}, healthy)), /class="badge s-ok"/);
  assert.match(render(card(zc.ZWaveMiniCard, {}, healthy)), /class="badge s-ok"/);
});

test("night banner: forced, else the dark theme alone", () => {
  assert.match(render(card(zc.ZWaveCard, { illustration_theme: "night" })), /class="banner night"/);
  assert.match(render(card(zc.ZWaveCard, {}, mockHass({ dark: true }))), /class="banner night"/);
  assert.doesNotMatch(render(card(zc.ZWaveCard, {}, mockHass())), /banner night/);
  assert.doesNotMatch(render(card(zc.ZWaveCard, { illustration_theme: "day" }, mockHass({ dark: true }))), /banner night/);
});

test("a click on a node opens its popup at the top of the card; a click elsewhere, Escape or leaving the page closes it", async () => {
  const hass = await withData();
  const el = card(zc.ZWaveCard, {}, hass);
  el._collect();
  const tile = { dataset: { node: "dev_lock" } };
  el._click({ composedPath: () => [tile], detail: 1 });
  const html = el._render();
  assert.match(html, /class="backdrop"/);
  const txt = text(html);
  assert.match(txt, /Node ID 3/);
  assert.match(txt, /Status Alive/);
  assert.match(txt, /Vendor Keystone/);
  assert.match(txt, /Firmware 5\.0\.3/);
  assert.match(txt, /Protocol Z-Wave /);
  assert.match(txt, /Security S2 Access/);
  assert.match(txt, /Z-Wave Plus v2/);
  assert.match(txt, /Signal −67 dBm/);
  assert.match(txt, /Battery 76%/);
  el._onOutside({ composedPath: () => [] });
  assert.equal(el._detail, null);
  el._click({ composedPath: () => [tile], detail: 1 });
  el._onKey({ key: "Escape", stopPropagation() {} });
  assert.equal(el._detail, null);
  el._click({ composedPath: () => [tile], detail: 1 });
  el.disconnectedCallback();
  assert.equal(el._detail, null);
});

test("the popup of a Long Range node, of an insecure node, of a dead node; its button opens the device page", async () => {
  const hass = await withData();
  const el = card(zc.ZWaveCard, {}, hass);
  el._collect();
  const open = (id) => {
    el._detail = null;
    el._click({ composedPath: () => [{ dataset: { node: id } }], detail: 1 });
    return text(el._render());
  };
  assert.match(open("dev_shed"), /Protocol Z-Wave Long Range/);
  assert.match(open("dev_siren"), /Not secure/);
  const dead = open("dev_garage");
  assert.match(dead, /Dead · 3 h/);
  assert.match(dead, /Status Dead/);
  el._click({ composedPath: () => [{ dataset: { nav: "/config/devices/device/dev_garage" } }], detail: 1 });
  assert.equal(zc.history.last, "/config/devices/device/dev_garage");
  assert.equal(el._detail, null);
});

test("the controller tile and the settings button open the Z-Wave JS page", async () => {
  const el = card(zc.ZWaveCard, {}, await withData());
  el._click({ composedPath: () => [{ dataset: { nav: "/config/zwave_js/dashboard?config_entry=zwave_entry" } }], detail: 1 });
  assert.equal(zc.history.last, "/config/zwave_js/dashboard?config_entry=zwave_entry");
});

test("no Z-Wave device at all", () => {
  const html = render(card(zc.ZWaveCard, {}, { ...mockHass(), devices: {} }));
  assert.match(html, /No Z-Wave device found/);
});

test("the mini card: the status, the counts and the issues", async () => {
  const html = render(card(zc.ZWaveMiniCard, {}, await withData()));
  const txt = text(html);
  assert.match(txt, /Z-Wave 2 issues/);
  assert.match(txt, /9 nodes 2 asleep 1 LR 1 dead 1 low battery/);
  assert.match(html, /<div class="trow"><div class="name">Z-Wave<\/div><span class="chip bst s-alert" role="img" title="2 issues" aria-label="2 issues">/);
  assert.match(html, /class="r pill alert"/);
  assert.doesNotMatch(html, /data-node=/);
  const ok = render(card(zc.ZWaveMiniCard, {}, await withData(mockHass({ healthy: true }))));
  assert.match(text(ok), /Z-Wave Healthy/);
  assert.match(ok, /class="chip bst s-ok"/);
  assert.doesNotMatch(render(card(zc.ZWaveMiniCard, { illustration: false })), /class="scene"/);
});

test("the mini card's detail button unfolds the full card; a click outside folds it back", () => {
  const el = card(zc.ZWaveMiniCard);
  el._collect();
  const zoom = { classList: { contains: (c) => c === "zoom" }, dataset: {} };
  el._click({ composedPath: () => [zoom], detail: 1, stopPropagation() {} });
  assert.equal(el._zoomed, true);
  assert.match(el._render(), /data-node=/);
  assert.deepEqual({ ...el.getGridOptions() }, { columns: 12, min_columns: 8 });
  el._click({ composedPath: () => [{ dataset: { node: "dev_lock" } }], detail: 1 });
  const out = { composedPath: () => [] };
  el._onOutside(out);
  el._onFold(out);
  assert.equal(el._detail, null);
  assert.equal(el._zoomed, true);
  el._onFold({ composedPath: () => [] });
  assert.equal(el._zoomed, false);
  assert.deepEqual({ ...el.getGridOptions() }, { columns: 6, min_columns: 6 });
  assert.doesNotMatch(render(card(zc.ZWaveMiniCard, { zoom: false })), /class="zoom/);
  el._setZoom(true);
  el.disconnectedCallback();
  assert.equal(el._zoomed, false);
});

test("the editors keep the YAML minimal and the mini card's editor has the full card's options", () => {
  const ed = new zc.ZWaveCardEditor();
  let form;
  zc.document.createElement = (tag) => {
    form = { tag, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } };
    return form;
  };
  ed.appendChild = () => {};
  ed.dispatchEvent = (ev) => {
    ed.last = ev.detail.config;
  };
  ed.setConfig({ type: "custom:zwave-card" });
  ed.hass = mockHass();
  assert.equal(form.data.columns, 2);
  assert.equal(form.data.show_controller, true);
  assert.equal(form.data.show_manage, true);
  form.listeners["value-changed"]({
    stopPropagation() {},
    detail: { value: { type: "custom:zwave-card", columns: 2, sort: "status", show_controller: true, show_manage: false, battery_threshold: 20, illustration_theme: "auto", title: "" } },
  });
  assert.deepEqual({ ...ed.last }, { type: "custom:zwave-card", sort: "status", show_manage: false });
  const names = (schema) => schema.flatMap((s) => (s.schema ? names(s.schema) : [s.name]));
  const full = names(ed._schema());
  const mini = new zc.ZWaveMiniCardEditor();
  mini._config = {};
  const miniNames = names(mini._schema());
  for (const n of full) assert.ok(miniNames.includes(n), n);
  assert.ok(miniNames.includes("zoom") && !full.includes("zoom"));
  assert.ok(!full.includes("exclude"));
});

test("the editor sets its form's data and schema again only when they change", () => {
  const ed = new zc.ZWaveCardEditor();
  let form;
  let sets = 0;
  zc.document.createElement = (tag) => {
    form = { tag, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } };
    let data;
    Object.defineProperty(form, "data", { get: () => data, set: (v) => { sets++; data = v; } });
    return form;
  };
  ed.appendChild = () => {};
  ed.setConfig({ type: "custom:zwave-card" });
  ed.hass = mockHass();
  const schema = form.schema;
  const before = sets;
  ed.hass = mockHass();
  assert.equal(sets, before);
  assert.equal(form.schema, schema);
  ed.setConfig({ type: "custom:zwave-card", columns: 3 });
  assert.equal(sets, before + 1);
});

const LANGS = ["en", "fr", "de", "es", "sr", "sr-Latn", "it", "nl", "pt", "pl", "ro", "da", "sv", "bg", "ru", "uk", "hu", "sk", "cs", "sl", "lv", "el"];
const vars = (s) => s.match(/\{\w+\}/g)?.sort() ?? [];
const base = (k) => k.replace(/_(zero|one|two|few|many|other)$/, "");

test("every language has every English text, with the same placeholders", () => {
  assert.deepEqual([...Object.keys(zc.STRINGS)], LANGS);
  const en = zc.STRINGS.en;
  for (const l of LANGS) {
    const tr = zc.STRINGS[l];
    for (const k of Object.keys(en)) {
      if (/_(one|other)$/.test(k)) assert.ok(`${base(k)}_other` in tr, `${l}: ${base(k)}_other`);
      else assert.ok(k in tr, `${l}: ${k}`);
    }
    for (const [k, v] of Object.entries(tr)) {
      const ref = en[k] ?? en[`${base(k)}_other`];
      assert.ok(ref !== undefined, `${l}: unknown key ${k}`);
      assert.deepEqual(vars(v), vars(ref), `${l}: ${k}`);
    }
  }
});

test("plural forms: every category a language uses has its text or falls back to the other form", () => {
  const keys = Object.keys(zc.STRINGS.en).filter((k) => k.endsWith("_other")).map(base);
  for (const l of LANGS) {
    for (const key of keys) {
      for (const n of [0, 1, 2, 3, 5, 11, 21, 22, 25, 101, 1.5]) {
        const out = zc.plural({ language: l }, { language: l }, key, n);
        assert.ok(out.includes(String(n)), `${l} ${key} ${n}: ${out}`);
      }
    }
  }
  const p = (l, k, n) => zc.plural({ language: l }, { language: l }, k, n);
  assert.equal(p("en", "nodes", 1), "1 node");
  assert.equal(p("fr", "dead", 2), "2 morts");
  assert.equal(p("ru", "nodes", 5), "5 узлов");
  assert.equal(p("pl", "asleep", 3), "Uśpione: 3");
});

test("Z-Wave JS version: from the network status, else from its update entity", async () => {
  noData();
  const hass = mockHass();
  assert.equal(zc.driverVersion(hass, []), null);
  const states = { ...hass.states, "update.zwave_js_update": { entity_id: "update.zwave_js_update", state: "off", attributes: { title: "Z-Wave JS", installed_version: "0.8.1" } } };
  assert.equal(zc.driverVersion({ states }, []), "0.8.1");
  assert.equal(zc.driverVersion(hass, [{ driver: "15.2.1" }]), "15.2.1");
});

test("show_title / show_subtitle: hide the header's title and its stats line, the pill stays", () => {
  const el = new zc.ZWaveCard();
  const attrs = new Set();
  el.toggleAttribute = (n, on) => (on ? attrs.add(n) : attrs.delete(n));
  el._update = () => {};
  el.setConfig({ type: "custom:zwave-card", show_title: false, show_subtitle: false });
  assert.deepEqual([...attrs].sort(), ["hide-subtitle", "hide-title"]);
  el.setConfig({ type: "custom:zwave-card" });
  assert.deepEqual([...attrs], []);
  const html = render(card(zc.ZWaveCard));
  assert.match(html, /:host\(\[hide-title\]\) \.titles \.name/);
  assert.match(html, /:host\(\[hide-subtitle\]\) \.titles > \.stats/);
  for (const l of Object.keys(zc.STRINGS)) for (const k of ["show_title", "show_subtitle"]) assert.ok(zc.STRINGS[l][k], `${l}.${k}`);
});

test("the rebuild button asks for a confirmation, then starts the routes rebuild on the controller's config entry", async () => {
  const asked = [];
  const base = mockHass();
  const hass = {
    ...base,
    callWS: (m) => {
      asked.push({ ...m });
      return base.callWS(m);
    },
  };
  await withData(hass);
  const el = card(zc.ZWaveCard, {}, hass);
  el._update = () => {};
  let html = render(el);
  assert.match(text(html), /Rebuild routes Z-Wave JS settings/);
  el._click({ composedPath: () => [{ dataset: { action: "rebuild" } }], detail: 1 });
  html = el._render();
  assert.match(html, /role="alertdialog"/);
  assert.match(text(html), /Rebuild the network routes\? Every node gets new routes to the controller/);
  // Cancel: nothing asked.
  el._click({ composedPath: () => [{ dataset: { action: "close" } }], detail: 1 });
  assert.equal(el._detail, null);
  assert.ok(!asked.some((m) => m.type === "zwave_js/begin_rebuilding_routes"));
  // Confirm.
  el._click({ composedPath: () => [{ dataset: { action: "rebuild" } }], detail: 1 });
  el._click({ composedPath: () => [{ dataset: { action: "confirm" } }], detail: 1 });
  for (let i = 0; i < 10; i++) await settle();
  assert.deepEqual(asked.find((m) => m.type === "zwave_js/begin_rebuilding_routes"), { type: "zwave_js/begin_rebuilding_routes", entry_id: "zwave_entry" });
  assert.equal(el._detail, null);
  // The rebuild runs: the button stops it, after its own confirmation.
  html = render(el);
  assert.match(text(html), /Rebuilding routes · 44%/);
  assert.match(text(html), /Stop rebuilding/);
  el._click({ composedPath: () => [{ dataset: { action: "rebuild" } }], detail: 1 });
  assert.match(text(el._render()), /Stop rebuilding the routes\? The routes already rebuilt are kept\. Cancel Stop/);
  el._click({ composedPath: () => [{ dataset: { action: "confirm" } }], detail: 1 });
  for (let i = 0; i < 10; i++) await settle();
  assert.ok(asked.some((m) => m.type === "zwave_js/stop_rebuilding_routes" && m.entry_id === "zwave_entry"));
  assert.match(text(render(el)), /Rebuild routes/);
});

test("a failed rebuild command is said in the popup; Escape closes it", async () => {
  const base = await withData();
  const hass = {
    ...base,
    callWS: (m) => (m.type === "zwave_js/begin_rebuilding_routes" ? Promise.reject({ code: "unknown_error" }) : base.callWS(m)),
  };
  const el = card(zc.ZWaveCard, {}, hass);
  el._collect();
  el._click({ composedPath: () => [{ dataset: { action: "rebuild" } }], detail: 1 });
  el._click({ composedPath: () => [{ dataset: { action: "confirm" } }], detail: 1 });
  for (let i = 0; i < 10; i++) await settle();
  assert.equal(el._detail, "@rebuild");
  assert.match(text(el._render()), /The command failed\. Try again\./);
  el._onKey({ key: "Escape", stopPropagation() {} });
  assert.equal(el._detail, null);
});

test("no rebuild button for a non-admin, with a disconnected driver, or with show_rebuild: false", async () => {
  noData();
  assert.doesNotMatch(render(card(zc.ZWaveCard, {}, mockHass({ admin: false }))), /data-action="rebuild"/);
  assert.doesNotMatch(render(card(zc.ZWaveCard, {}, await withData(mockHass({ disconnected: true })))), /data-action="rebuild"/);
  const hass = await withData();
  assert.doesNotMatch(render(card(zc.ZWaveCard, { show_rebuild: false }, hass)), /data-action="rebuild"/);
  assert.match(render(card(zc.ZWaveCard, { show_manage: false }, hass)), /data-action="rebuild"/);
});

test("a failed network status drops the last answer: the statuses come from the entities again", async () => {
  const hass = await withData();
  assert.ok(zc.networkNodes().nodes.size > 0);
  const s = [...zc.store.net.values()][0];
  s.at = 0;
  const failing = { ...hass, callWS: () => Promise.reject({ code: "not_loaded" }) };
  zc.refreshNetwork(failing, zc.zwaveDevices(failing).controllers);
  for (let i = 0; i < 10; i++) await settle();
  assert.equal(s.data, null);
  assert.equal(s.failed, true);
  assert.equal(zc.networkNodes().nodes.size, 0);
  // Without the answer, the node status sensors still tell the dead node.
  const el = card(zc.ZWaveCard, {}, failing);
  el._collect();
  assert.equal(el._summary.dead, 1);
  noData();
});
