// ---------------------------------------------------------------------------
// Z-Wave nodes, from the device and entity registries
// ---------------------------------------------------------------------------
import { ICONS } from "./core.js";
import { num, unavailableState } from "./helpers.js";

export const DOMAIN = "zwave_js";

// Node status of Z-Wave JS (NodeStatus): the websocket gives a number, the node status sensor a word.
export const STATUS_NAMES = ["unknown", "asleep", "awake", "dead", "alive"];
export const statusName = (v) => {
  if (typeof v === "number") return STATUS_NAMES[v] ?? "unknown";
  const s = String(v ?? "").toLowerCase();
  return STATUS_NAMES.includes(s) ? s : null;
};

// Security classes of Z-Wave JS (SecurityClass): the highest one a node was included with.
export const SECURITY = { 2: "s2_access", 1: "s2_auth", 0: "s2_unauth", 7: "s0" };
export const SECURITY_TAGS = { s2_access: "S2 Access", s2_auth: "S2 Auth", s2_unauth: "S2", s0: "S0" };
export const securityOf = (n) => {
  if (!n) return null;
  const v = n.highest_security_class ?? n.highestSecurityClass;
  if (v !== null && v !== undefined && SECURITY[v]) return SECURITY[v];
  if (n.is_secure === false || v === -1) return "none";
  return null;
};

// RF regions of Z-Wave JS (RFRegion), shown by their usual short names.
export const REGIONS = { 0: "EU", 1: "US", 2: "ANZ", 3: "HK", 5: "IN", 6: "IL", 7: "RU", 8: "CN", 9: "US LR", 10: "US LR", 11: "EU LR", 32: "JP", 33: "KR" };

// The home id and node id of a Z-Wave device, from its device registry identifier: `<home id>-<node id>`, or
// `<home id>-<node id>-<manufacturer>:<type>:<product>` (homeassistant/components/zwave_js/helpers.py, get_device_id
// and get_device_id_ext). Null when the device has no such identifier.
export const zwaveId = (device) => {
  for (const ident of device?.identifiers || []) {
    if (!Array.isArray(ident) || ident[0] !== DOMAIN) continue;
    const m = /^(\d+)-(\d+)(?:-.*)?$/.exec(String(ident[1]));
    if (m) return { home: Number(m[1]), node: Number(m[2]) };
  }
  return null;
};

export const isZwaveDevice = (d) => !!d && !d.disabled_by && (d.identifiers || []).some((i) => Array.isArray(i) && i[0] === DOMAIN);

// Node ids from 256 up are Z-Wave Long Range nodes.
export const isLongRange = (node) => node !== null && node !== undefined && node >= 256;

// The entities of each device, memoized on the registry objects (Home Assistant replaces them on every change).
export let _byDevice = { entities: null, map: new Map() };
export const entitiesByDevice = (hass) => {
  if (_byDevice.entities === hass?.entities) return _byDevice.map;
  const map = new Map();
  for (const e of Object.values(hass?.entities || {})) {
    if (!e?.device_id) continue;
    if (!map.has(e.device_id)) map.set(e.device_id, []);
    map.get(e.device_id).push(e);
  }
  _byDevice = { entities: hass?.entities, map };
  return map;
};

// The Z-Wave devices of the registry: the controllers (their node id is the network's own node id, else node 1) and
// the nodes. `exclude` (device ids or names) leaves nodes out.
// Kept per device registry object, `exclude` and the controllers' node ids: the card looks its devices up on every
// state change of Home Assistant, which should not walk the whole registry each time.
export const _zwaveDevices = new WeakMap();
export const zwaveDevices = (hass, config = {}, own = null) => {
  const reg = hass?.devices;
  const key = JSON.stringify([Array.isArray(config.exclude) ? config.exclude : [], own ? [...own] : null]);
  const hit = reg && _zwaveDevices.get(reg);
  if (hit && hit.key === key) return hit.value;
  const value = scanZwaveDevices(hass, config, own);
  if (reg) _zwaveDevices.set(reg, { key, value });
  return value;
};
export const scanZwaveDevices = (hass, config, own) => {
  const exclude = new Set((Array.isArray(config.exclude) ? config.exclude : []).map((x) => String(x).toLowerCase()));
  const left = (d) => exclude.has(d.id.toLowerCase()) || exclude.has(String(d.name_by_user || d.name || "").toLowerCase());
  const controllers = [];
  const nodes = [];
  for (const d of Object.values(hass?.devices || {})) {
    if (!isZwaveDevice(d)) continue;
    const id = zwaveId(d);
    const ownNode = own?.get(String(id?.home)) ?? 1;
    if (id && id.node === ownNode) controllers.push(d);
    else if (!left(d)) nodes.push(d);
  }
  return { controllers, nodes };
};

// Domains a device's main entity is taken from, the first first; then the sensors (a battery last).
export const MAIN_DOMAINS = [
  "lock", "light", "cover", "climate", "fan", "valve", "vacuum", "water_heater", "humidifier", "media_player", "switch",
  "binary_sensor", "sensor", "event", "button", "number", "select",
];

// What the card reads among a device's entities: its main entity, its battery, its power, its signal (the node
// statistics' RSSI), its node status sensor and its last seen sensor.
export const deviceEntities = (hass, deviceId) => {
  const list = entitiesByDevice(hass).get(deviceId) || [];
  const states = hass?.states || {};
  const out = { all: list.map((e) => e.entity_id), main: null, battery: null, batteryLow: null, power: null, rssi: null, status: null, lastSeen: null };
  let best = null;
  for (const e of list) {
    const st = states[e.entity_id];
    if (!st) continue;
    const domain = e.entity_id.split(".")[0];
    const dc = st.attributes?.device_class;
    const key = e.platform === DOMAIN || !e.platform ? e.translation_key : undefined;
    if (domain === "sensor" && (key === "node_status" || /_node_status$/.test(e.entity_id))) out.status = e.entity_id;
    if (domain === "sensor" && (key === "last_seen" || /_last_seen$/.test(e.entity_id))) out.lastSeen = e.entity_id;
    if (!out.rssi && domain === "sensor" && (key === "rssi" || dc === "signal_strength")) out.rssi = e.entity_id;
    if (domain === "sensor" && dc === "battery" && !out.battery) out.battery = e.entity_id;
    if (domain === "binary_sensor" && dc === "battery" && !out.batteryLow) out.batteryLow = e.entity_id;
    if (domain === "sensor" && dc === "power" && !out.power) out.power = e.entity_id;
    if (e.entity_category || e.hidden || e.entity_id === out.status) continue;
    let rank = MAIN_DOMAINS.indexOf(domain);
    if (rank < 0) rank = MAIN_DOMAINS.length;
    if (domain === "sensor" && ["battery", "signal_strength", "voltage"].includes(dc)) rank += 10;
    if (!best || rank < best.rank) best = { rank, id: e.entity_id };
  }
  out.main = best?.id ?? null;
  return out;
};

// The icon of an entity, as an mdi path of ICONS (or an mdi name, for an entity icon of its own).
export const BINARY_ICONS = { door: "door", garage_door: "garage", window: "window", opening: "door", motion: "motion", occupancy: "motion", presence: "motion", moisture: "moisture", smoke: "smoke", carbon_monoxide: "smoke", battery: "battery" };
export const SENSOR_ICONS = { temperature: "temperature", humidity: "humidity", power: "power", energy: "power", battery: "battery", pm25: "air", pm10: "air", aqi: "air", volatile_organic_compounds: "air", carbon_dioxide: "air" };
export const COVER_ICONS = { blind: "blinds", shade: "blinds", shutter: "shutter", curtain: "curtains", garage: "garage", gate: "garage", door: "door", window: "window" };
export const DOMAIN_ICONS = { light: "light", lock: "lock", climate: "thermostat", fan: "fan", valve: "valve", vacuum: "vacuum", water_heater: "boiler", humidifier: "humidifier", media_player: "speaker", button: "button", event: "button", cover: "blinds" };
export const iconOf = (hass, entityId) => {
  const st = entityId && hass?.states?.[entityId];
  if (!st) return { path: ICONS.chip };
  const custom = hass.entities?.[entityId]?.icon || st.attributes?.icon;
  if (custom) return { mdi: custom };
  const domain = entityId.split(".")[0];
  const dc = st.attributes?.device_class;
  let key = DOMAIN_ICONS[domain];
  if (domain === "switch") key = dc === "outlet" ? "outlet" : "plug";
  if (domain === "binary_sensor") key = BINARY_ICONS[dc] || "chip";
  if (domain === "sensor") key = SENSOR_ICONS[dc] || "chip";
  if (domain === "cover") key = COVER_ICONS[dc] || "blinds";
  return { path: ICONS[key] || ICONS.chip };
};

// Everything the card shows of a node, worked out from the registries, the states and the network status. `ws` is
// the node's entry of `zwave_js/network_status` (status, security…), when an administrator's card has it. `level`
// is ok, warn (low battery) or alert (dead).
export const nodeInfo = (hass, device, { ws = null, threshold = 20 } = {}) => {
  const ents = deviceEntities(hass, device.id);
  const states = hass?.states || {};
  const main = ents.main ? states[ents.main] : null;
  const ownStates = ents.all.map((id) => states[id]).filter(Boolean);
  // The status: the network status first, then the node status sensor; else Z-Wave JS marks every entity of a dead
  // node unavailable, which tells.
  let status = ws ? statusName(ws.status) : null;
  if (!status || status === "unknown") status = statusName(ents.status ? states[ents.status]?.state : null) || status;
  if (!status || status === "unknown") {
    const anyUp = main ? !unavailableState(main) : ownStates.some((s) => !unavailableState(s));
    status = ownStates.length && !anyUp ? "dead" : status || "unknown";
  }
  const dead = status === "dead";
  const battery = num(ents.battery ? states[ents.battery]?.state : null);
  const lowFlag = ents.batteryLow && states[ents.batteryLow]?.state === "on";
  const lowBattery = !dead && (lowFlag || (battery !== null && battery < threshold));
  const statusSt = ents.status ? states[ents.status] : null;
  const changed = (dead && statusSt?.state === "dead" ? statusSt.last_changed : null) || main?.last_changed || ownStates.map((s) => s.last_changed).sort().pop();
  const seenSt = ents.lastSeen ? states[ents.lastSeen] : null;
  const seen = seenSt && !unavailableState(seenSt) ? Date.parse(seenSt.state) : Number.NaN;
  const updated = ownStates.map((s) => s.last_updated || s.last_changed).filter(Boolean).sort().pop();
  const id = zwaveId(device);
  const node = ws?.node_id ?? id?.node ?? null;
  return {
    id: device.id,
    device,
    name: device.name_by_user || device.name || device.model || device.id,
    node,
    home: id?.home ?? null,
    icon: iconOf(hass, ents.main),
    main: ents.main,
    ents,
    status,
    available: !dead,
    asleep: status === "asleep",
    battery,
    lowBattery,
    level: dead ? "alert" : lowBattery ? "warn" : "ok",
    security: securityOf(ws),
    longRange: isLongRange(node),
    zwavePlus: ws?.zwave_plus_version ?? null,
    rssi: num(ents.rssi ? states[ents.rssi]?.state : null),
    power: ents.power && !unavailableState(states[ents.power]) ? states[ents.power] : null,
    since: dead && changed ? Date.parse(changed) : null,
    lastSeen: Number.isFinite(seen) ? seen : updated ? Date.parse(updated) : null,
    ws,
  };
};

// Network-wide counts.
export const summaryOf = (infos) => {
  const dead = infos.filter((i) => !i.available).length;
  const asleep = infos.filter((i) => i.asleep).length;
  const lowBattery = infos.filter((i) => i.lowBattery).length;
  const longRange = infos.filter((i) => i.longRange).length;
  return { total: infos.length, alive: infos.length - dead, dead, asleep, lowBattery, longRange, issues: dead + lowBattery };
};

// A controller as the card shows it: its device, and the network status of its config entry when there is one.
export const controllerOf = (device, net) => {
  const c = net?.controller || {};
  const client = net?.client || {};
  const home = c.home_id ?? zwaveId(device)?.home ?? null;
  const connected = net ? client.state === undefined || client.state === "connected" : true;
  const rebuilding = !!c.is_rebuilding_routes;
  const progress = c.rebuild_routes_progress;
  let pct = null;
  if (rebuilding && progress && typeof progress === "object") {
    const all = Object.values(progress);
    if (all.length) pct = Math.round((100 * all.filter((v) => v !== "pending").length) / all.length);
  }
  return {
    id: device.id,
    device,
    entry: (device.config_entries || [])[0] ?? null,
    home: home !== null ? `0x${Number(home).toString(16).toUpperCase().padStart(8, "0")}` : null,
    sdk: c.sdk_version ?? null,
    firmware: c.firmware_version ?? device.sw_version ?? null,
    region: REGIONS[c.rf_region] ?? null,
    driver: client.driver_version ?? null,
    connected,
    rebuilding,
    pct,
    level: connected ? "ok" : "alert",
  };
};

// ---------------------------------------------------------------------------
// Websocket data: the network status of each Z-Wave JS config entry (controller and nodes), admins only.
// Shared by every card of the page, so a mini card and a full card ask once.
// ---------------------------------------------------------------------------

export const NET_TTL = 60 * 1000;
export const store = {
  rev: 0,
  net: new Map(), // controller device id → { at, data, pending, failed }
  cards: new Set(),
};
export const bump = () => {
  store.rev++;
  for (const c of store.cards) c._dataChanged();
};

export const isAdmin = (hass) => !!hass?.user?.is_admin;

// Asks the network status of each controller every minute (every 10 minutes after a failure), by the device id of
// its controller.
export const refreshNetwork = (hass, controllers) => {
  if (typeof hass?.callWS !== "function" || !isAdmin(hass)) return;
  const now = Date.now();
  for (const d of controllers) {
    let s = store.net.get(d.id);
    if (!s) store.net.set(d.id, (s = { at: 0, data: null, pending: false, failed: false }));
    if (s.pending || now - s.at < (s.failed ? 10 : 1) * NET_TTL) continue;
    s.pending = true;
    Promise.resolve()
      .then(() => hass.callWS({ type: "zwave_js/network_status", device_id: d.id }))
      .then(
        (r) => {
          s.data = r && typeof r === "object" ? r : null;
          s.failed = false;
        },
        () => {
          // A failed answer (the integration unloaded, its server gone) drops the last one: its node statuses and
          // its connected driver would else stay shown as they were; the statuses come from the entities meanwhile.
          s.data = null;
          s.failed = true;
        },
      )
      .finally(() => {
        s.at = Date.now();
        s.pending = false;
        bump();
      });
  }
};

// Starts or stops a routes rebuild on a controller's config entry (administrators), then asks its network status
// again at once; while the answer is on its way, the rebuild shows as started (or stopped).
export const rebuildRoutes = (hass, controller, stop = false) =>
  Promise.resolve()
    .then(() => hass.callWS({ type: stop ? "zwave_js/stop_rebuilding_routes" : "zwave_js/begin_rebuilding_routes", entry_id: controller.entry }))
    .then(() => {
      const s = store.net.get(controller.id);
      if (s?.data?.controller) {
        s.data.controller.is_rebuilding_routes = !stop;
        if (stop) s.data.controller.rebuild_routes_progress = null;
      }
      if (s) s.at = 0;
      bump();
    });

// The nodes of every network status, by "<home id>-<node id>", and the controllers' own node ids by home id.
export const networkNodes = () => {
  const nodes = new Map();
  const own = new Map();
  for (const s of store.net.values()) {
    const c = s.data?.controller;
    if (!c) continue;
    if (c.own_node_id !== undefined) own.set(String(c.home_id), c.own_node_id);
    for (const n of c.nodes || []) nodes.set(`${c.home_id}-${n.node_id}`, n);
  }
  return { nodes, own: own.size ? own : null };
};

// The version of Z-Wave JS, from the network status, else from the update entity of its add-on or app.
export const _updateIds = new WeakMap();
export const driverVersion = (hass, controllers) => {
  for (const c of controllers) if (c.driver) return String(c.driver);
  const states = hass?.states;
  if (!states) return null;
  const reg = hass.entities;
  let ids = reg ? _updateIds.get(reg) : null;
  if (!ids) {
    ids = Object.keys(reg || states).filter((id) => id.startsWith("update."));
    if (reg) _updateIds.set(reg, ids);
  }
  for (const id of ids) {
    const st = states[id];
    if (!st) continue;
    const title = String(st.attributes?.title || st.attributes?.friendly_name || "");
    if (/z-?wave js/i.test(title) && st.attributes?.installed_version) return String(st.attributes.installed_version);
  }
  return null;
};
