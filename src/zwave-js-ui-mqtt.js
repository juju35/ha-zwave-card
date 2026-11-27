// ---------------------------------------------------------------------------
// Z-Wave JS UI over MQTT (no zwave_js integration): its nodes from the device registry (the `mqtt` identifiers of its
// Home Assistant discovery), their status, security and controller from its MQTT API through Home Assistant
// (`mqtt/subscribe` and `mqtt.publish`, administrators): `<prefix>/_CLIENTS/<gateway>/api/getNodes` and `getInfo`.
// ---------------------------------------------------------------------------
import { bump, controllerOf, isAdmin } from "./z-wave-nodes.js";

// The MQTT prefix of Z-Wave JS UI (its MQTT settings, `zwave` by default).
export const baseTopic = (config) => String(config?.base_topic || "zwave").replace(/^\/+|\/+$/g, "") || "zwave";

// Security classes of Z-Wave JS UI (SecurityClass names) → the numbers of the zwave_js network status.
export const ZUI_SECURITY = { S2_AccessControl: 2, S2_Authenticated: 1, S2_Unauthenticated: 0, S0_Legacy: 7, None: -1 };
// A node of getNodes in the shape of a `zwave_js/network_status` node, plus its last activity, signal and protocol.
export const zuiNode = (n) => ({
  node_id: n.id,
  status: n.status,
  highest_security_class: ZUI_SECURITY[n.security] ?? null,
  is_secure: typeof n.isSecure === "boolean" ? n.isSecure : undefined,
  zwave_plus_version: n.zwavePlusVersion ?? null,
  last_active: typeof n.lastActive === "number" ? n.lastActive : null,
  rssi: typeof n.statistics?.rssi === "number" ? n.statistics.rssi : null,
  long_range: n.protocol === 1,
});

export const ZUI_TTL = 60 * 1000;
export const ZUI_THROTTLE_MS = 1000;
export const ZUI_RETRY_MS = 30000;
export const ZUI_DROP_MS = 60000;
// The MQTT entries, by prefix: one set of subscriptions for every card of the page.
export const zuiStore = new Map();

export const zuiTopics = (topic) => [`${topic}/_CLIENTS/+/status`, `${topic}/_CLIENTS/+/api/getNodes`, `${topic}/_CLIENTS/+/api/getInfo`];

const parsePayload = (p) => {
  try {
    return JSON.parse(p);
  } catch (_e) {
    return p;
  }
};

// One message into the entry: the gateway's status (its LWT, retained), or the answer of getNodes / getInfo.
export const zuiMessage = (e, topic, m) => {
  const t = String(m?.topic ?? "");
  const prefix = `${topic}/_CLIENTS/`;
  if (!t.startsWith(prefix)) return false;
  const [client, kind, api, extra] = t.slice(prefix.length).split("/");
  if (!client || extra !== undefined) return false;
  const p = parsePayload(m.payload);
  const c = e.clients.get(client) ?? { online: false, nodes: null, info: null, asked: 0 };
  e.clients.set(client, c);
  if (kind === "status" && api === undefined) {
    const was = c.online;
    c.online = p && typeof p === "object" ? !!p.value : p === true || p === "true";
    if (c.online && !was) c.asked = 0;
    return true;
  }
  if (kind !== "api" || !p || typeof p !== "object" || p.success !== true) return false;
  if (api === "getNodes" && Array.isArray(p.result)) c.nodes = p.result;
  else if (api === "getInfo" && p.result && typeof p.result === "object") c.info = p.result;
  else return false;
  return true;
};

// An API call to a gateway: published on `<prefix>/_CLIENTS/<gateway>/api/<name>/set`, answered without `/set`.
export const zuiCall = (hass, topic, client, api, args = []) =>
  Promise.resolve(hass.callService("mqtt", "publish", { topic: `${topic}/_CLIENTS/${client}/api/${api}/set`, payload: JSON.stringify({ args }) }));

// Asks the nodes and the info of each gateway online, once a minute.
export const zuiAsk = (e, hass, topic) => {
  if (typeof hass?.callService !== "function") return;
  const now = Date.now();
  for (const [client, c] of e.clients) {
    if (!c.online || now - c.asked < ZUI_TTL) continue;
    c.asked = now;
    zuiCall(hass, topic, client, "getInfo").catch(() => {});
    zuiCall(hass, topic, client, "getNodes").catch(() => {});
  }
};

// Subscribes (once per prefix) and asks what is due; administrators only (mqtt/subscribe needs one).
export const fetchZui = (hass, topic, card) => {
  if (!isAdmin(hass)) return;
  let e = zuiStore.get(topic);
  if (!e) zuiStore.set(topic, (e = { gen: 0, sub: null, error: null, at: 0, clients: new Map(), users: new Set(), drop: null }));
  if (card) {
    e.users.add(card);
    clearTimeout(e.drop);
  }
  e.hass = hass;
  if (!e.sub && (!e.error || Date.now() - e.at >= ZUI_RETRY_MS)) {
    const conn = hass.connection;
    if (typeof conn?.subscribeMessage !== "function") {
      e.error = "load_error";
      e.at = Date.now();
      return;
    }
    const gen = ++e.gen;
    const live = () => e.gen === gen;
    e.clients = new Map();
    e.error = null;
    let timer = null;
    const onMsg = (m) => {
      if (!live() || !zuiMessage(e, topic, m)) return;
      zuiAsk(e, e.hass, topic);
      timer ??= setTimeout(() => {
        timer = null;
        if (live()) bump();
      }, ZUI_THROTTLE_MS);
    };
    const subs = zuiTopics(topic).map((t) => Promise.resolve(conn.subscribeMessage(onMsg, { type: "mqtt/subscribe", topic: t })));
    const endAll = () => {
      for (const p of subs) p.then((unsub) => typeof unsub === "function" && unsub()).catch(() => {});
    };
    e.sub = Promise.all(subs)
      .then(() => endAll)
      .catch((err) => {
        endAll();
        if (!live()) return null;
        e.error = err?.code === "unauthorized" ? "not_admin" : err?.code === "unknown_command" ? "no_mqtt" : "load_error";
        e.at = Date.now();
        e.sub = null;
        bump();
        return null;
      });
  }
  zuiAsk(e, hass, topic);
};

// A card left the page: the subscriptions end a minute after the last card of the prefix.
export const releaseZui = (topic, card) => {
  const e = zuiStore.get(topic);
  if (!e?.users.delete(card) || e.users.size) return;
  clearTimeout(e.drop);
  e.drop = setTimeout(() => {
    if (e.users.size) return;
    const sub = e.sub;
    e.gen++;
    e.sub = null;
    e.clients = new Map();
    sub?.then((end) => typeof end === "function" && end()).catch(() => {});
  }, ZUI_DROP_MS);
};

// The network of every gateway of a prefix, as networkNodes gives the zwave_js one: the nodes by
// "<home id>-<node id>", the controllers' node ids by home id, and the controllers as the card shows them (with the
// gateway, for the routes rebuild).
export const zuiNetwork = (topic) => {
  const nodes = new Map();
  const own = new Map();
  const controllers = [];
  for (const [client, c] of zuiStore.get(topic)?.clients ?? []) {
    const home = c.info?.homeid;
    if (home === undefined || home === null) continue;
    const list = Array.isArray(c.nodes) ? c.nodes : [];
    const ctrl = list.find((n) => n?.isControllerNode) || null;
    const ownId = c.info.controllerId ?? ctrl?.id ?? 1;
    own.set(String(home), ownId);
    const progress = {};
    for (const n of list) {
      if (!n || typeof n.id !== "number") continue;
      nodes.set(`${home}-${n.id}`, zuiNode(n));
      if (n.rebuildRoutesProgress) progress[n.id] = n.rebuildRoutesProgress;
    }
    const rebuilding = Object.values(progress).includes("pending");
    const device = {
      id: `zui:${client}`,
      name: client.replace(/^ZWAVE_GATEWAY-/, ""),
      manufacturer: ctrl?.manufacturer || "",
      model: ctrl?.productLabel || "",
      sw_version: ctrl?.firmwareVersion ?? null,
      config_entries: [],
    };
    const net = {
      controller: {
        home_id: home,
        own_node_id: ownId,
        sdk_version: ctrl?.sdkVersion ?? null,
        firmware_version: ctrl?.firmwareVersion ?? null,
        rf_region: ctrl?.RFRegion,
        is_rebuilding_routes: rebuilding,
        rebuild_routes_progress: rebuilding ? progress : null,
      },
      client: { state: c.online ? "connected" : "disconnected", driver_version: c.info.zwaveVersion ?? null },
    };
    controllers.push({ ...controllerOf(device, net), zui: { topic, client } });
  }
  return { nodes, own: own.size ? own : null, controllers };
};

// Starts or stops a routes rebuild through a gateway's API, then asks its nodes again a few seconds later.
export const zuiRebuild = (hass, controller, stop = false) => {
  const { topic, client } = controller.zui;
  return zuiCall(hass, topic, client, stop ? "stopRebuildingRoutes" : "beginRebuildingRoutes").then(() => {
    const c = zuiStore.get(topic)?.clients.get(client);
    if (c) {
      for (const n of c.nodes || []) if (n && !n.isControllerNode) n.rebuildRoutesProgress = stop ? undefined : "pending";
      c.asked = Date.now() - ZUI_TTL + 5000;
    }
    bump();
  });
};
