import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load.mjs";

const zc = load(["zuiId", "sourceOf", "baseTopic", "zwaveDevices", "nodeInfo", "zuiNetwork", "zuiStore", "fetchZui", "releaseZui", "zuiMessage", "ZWaveCard"]);

const HOME = 0xc0ffee42;
const HEX = HOME.toString(16);
const dev = (id, name, node, extra = {}) => ({
  id,
  name,
  name_by_user: null,
  manufacturer: "Acme",
  model: "Plug (ZW-1)",
  identifiers: [["mqtt", `zwavejs2mqtt_0x${HEX}_node${node}`]],
  config_entries: ["mqtt_entry"],
  ...extra,
});
// A Home Assistant with Z-Wave JS UI's MQTT devices only, recording its MQTT subscriptions and publishes.
const zuiHass = ({ admin = true } = {}) => {
  const subs = [];
  const calls = [];
  const devices = { d_plug: dev("d_plug", "Kitchen plug", 5), d_door: dev("d_door", "Front door", 7), d_ctrl: dev("d_ctrl", "Controller", 1) };
  const entities = {
    "switch.kitchen_plug": { entity_id: "switch.kitchen_plug", device_id: "d_plug", platform: "mqtt" },
    "binary_sensor.front_door": { entity_id: "binary_sensor.front_door", device_id: "d_door", platform: "mqtt" },
    "sensor.front_door_battery": { entity_id: "sensor.front_door_battery", device_id: "d_door", platform: "mqtt" },
  };
  const states = {
    "switch.kitchen_plug": { entity_id: "switch.kitchen_plug", state: "on", attributes: {}, last_changed: "2026-11-27T10:00:00Z" },
    "binary_sensor.front_door": { entity_id: "binary_sensor.front_door", state: "off", attributes: { device_class: "door" }, last_changed: "2026-11-27T10:00:00Z" },
    "sensor.front_door_battery": { entity_id: "sensor.front_door_battery", state: "15", attributes: { device_class: "battery" }, last_changed: "2026-11-27T10:00:00Z" },
  };
  return {
    subs,
    calls,
    devices,
    entities,
    states,
    language: "en",
    user: { is_admin: admin },
    config: { components: ["mqtt"] },
    connection: {
      subscribeMessage: (cb, msg) => {
        subs.push({ cb, topic: msg.topic, type: msg.type });
        return Promise.resolve(() => {});
      },
    },
    callService: (domain, service, data) => {
      calls.push({ domain, service, ...data });
      return Promise.resolve();
    },
  };
};
const settle = () => new Promise((r) => setTimeout(r, 0));
const send = (hass, topic, payload) => {
  for (const s of hass.subs) s.cb({ topic, payload: JSON.stringify(payload) });
};
const GW = "ZWAVE_GATEWAY-zui";
const NODES = [
  { id: 1, isControllerNode: true, manufacturer: "Zooz", productLabel: "ZST39", sdkVersion: "7.21.4", firmwareVersion: "1.50", RFRegion: 0, status: "Alive" },
  { id: 5, status: "Alive", security: "S2_Authenticated", zwavePlusVersion: 2, lastActive: 1764237600000, statistics: { rssi: -62 }, protocol: 0 },
  { id: 7, status: "Asleep", security: "S0_Legacy", protocol: 0 },
];

test("Z-Wave JS UI's MQTT devices are found by their discovery identifier and picked by themselves", () => {
  const hass = zuiHass();
  assert.equal(JSON.stringify(zc.zuiId(hass.devices.d_plug)), JSON.stringify({ home: HOME, node: 5 }));
  assert.equal(zc.zuiId({ identifiers: [["mqtt", "zigbee2mqtt_0x00124b"]] }), null);
  assert.equal(zc.sourceOf(hass, {}), "zwave_js_ui");
  assert.equal(zc.sourceOf(hass, { integration: "zwave_js" }), "zwave_js");
  assert.equal(zc.baseTopic({ base_topic: "/zwave2/" }), "zwave2");
  assert.equal(zc.baseTopic({}), "zwave");
  const { controllers, nodes } = zc.zwaveDevices(hass, {});
  assert.equal(JSON.stringify(controllers.map((d) => d.id)), '["d_ctrl"]');
  assert.equal(JSON.stringify(nodes.map((d) => d.id).sort()), '["d_door","d_plug"]');
  // Without the API (a non-admin user), the nodes still show from their entities.
  const info = zc.nodeInfo(hass, hass.devices.d_door);
  assert.equal(info.lowBattery, true);
  assert.equal(info.node, 7);
});

test("the API is asked through MQTT once the gateway is online, its nodes fill the statuses and the controller", async () => {
  zc.zuiStore.clear();
  const hass = zuiHass();
  zc.fetchZui(hass, "zwave", null);
  await settle();
  assert.equal(JSON.stringify(hass.subs.map((s) => s.topic)), JSON.stringify(["zwave/_CLIENTS/+/status", "zwave/_CLIENTS/+/api/getNodes", "zwave/_CLIENTS/+/api/getInfo"]));
  assert.ok(hass.subs.every((s) => s.type === "mqtt/subscribe"));
  send(hass, `zwave/_CLIENTS/${GW}/status`, { value: true, time: 1 });
  assert.equal(
    JSON.stringify(hass.calls.map((c) => [c.service, c.topic, c.payload])),
    JSON.stringify([
      ["publish", `zwave/_CLIENTS/${GW}/api/getInfo/set`, '{"args":[]}'],
      ["publish", `zwave/_CLIENTS/${GW}/api/getNodes/set`, '{"args":[]}'],
    ]),
  );
  send(hass, `zwave/_CLIENTS/${GW}/api/getInfo`, { success: true, result: { homeid: HOME, controllerId: 1, zwaveVersion: "15.0.0" } });
  send(hass, `zwave/_CLIENTS/${GW}/api/getNodes`, { success: true, result: NODES });
  // Asked once a minute, not at every message.
  assert.equal(hass.calls.length, 2);
  const net = zc.zuiNetwork("zwave");
  assert.equal(net.own.get(String(HOME)), 1);
  const [ctrl] = net.controllers;
  assert.equal(ctrl.connected, true);
  assert.equal(ctrl.sdk, "7.21.4");
  assert.equal(ctrl.region, "EU");
  assert.equal(ctrl.driver, "15.0.0");
  assert.equal(ctrl.home, `0x${HEX.toUpperCase()}`);
  assert.equal(JSON.stringify(ctrl.zui), JSON.stringify({ topic: "zwave", client: GW }));
  const ws = net.nodes.get(`${HOME}-5`);
  const plug = zc.nodeInfo(hass, hass.devices.d_plug, { ws });
  assert.equal(plug.security, "s2_auth");
  assert.equal(plug.rssi, -62);
  assert.equal(plug.lastSeen, 1764237600000);
  assert.equal(plug.zwavePlus, 2);
  const door = zc.nodeInfo(hass, hass.devices.d_door, { ws: net.nodes.get(`${HOME}-7`) });
  assert.equal(door.status, "asleep");
  assert.equal(door.security, "s0");
  // A failed answer or a message of another prefix changes nothing.
  assert.equal(zc.zuiMessage(zc.zuiStore.get("zwave"), "zwave", { topic: `zwave/_CLIENTS/${GW}/api/getNodes`, payload: '{"success":false}' }), false);
  assert.equal(zc.zuiMessage(zc.zuiStore.get("zwave"), "zwave", { topic: "zigbee2mqtt/bridge/devices", payload: "[]" }), false);
});

test("the card shows the MQTT gateway as its controller, and a non-admin asks nothing", async () => {
  const card = (hass) => {
    const el = new zc.ZWaveCard();
    el._now = () => 1764240000000;
    el._config = { type: "custom:zwave-card" };
    el._hass = hass;
    el._update = () => {};
    el._closeDetail = () => {};
    el._collect();
    el._refresh();
    return el;
  };
  zc.zuiStore.clear();
  const hass = zuiHass();
  const el = card(hass);
  await settle();
  send(hass, `zwave/_CLIENTS/${GW}/status`, { value: true });
  send(hass, `zwave/_CLIENTS/${GW}/api/getInfo`, { success: true, result: { homeid: HOME, controllerId: 1 } });
  send(hass, `zwave/_CLIENTS/${GW}/api/getNodes`, { success: true, result: NODES });
  el._collect();
  const html = el._render();
  assert.match(html, /Controller · Zooz ZST39/);
  assert.match(html, /data-action="rebuild"/);
  assert.doesNotMatch(html, /data-nav="\/config\/zwave_js/);
  assert.match(html, /Front door/);
  // The rebuild goes through the gateway's API.
  el._runRebuild();
  await settle();
  assert.ok(hass.calls.some((c) => c.topic === `zwave/_CLIENTS/${GW}/api/beginRebuildingRoutes/set`));

  zc.zuiStore.clear();
  const guest = zuiHass({ admin: false });
  const g = card(guest);
  await settle();
  assert.equal(guest.subs.length, 0);
  assert.equal(guest.calls.length, 0);
  assert.match(g._render(), /Kitchen plug/);
});
