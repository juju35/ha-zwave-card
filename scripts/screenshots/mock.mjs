// Mock Z-Wave network for the screenshots and the tests: a fictional controller and fictional nodes in a fictional
// home, on a fixed clock (NOW), with the Z-Wave JS integration's websocket answer (`zwave_js/network_status`).
export const NOW = Date.parse("2026-06-12T09:41:00+02:00");
const iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();

export const HOME = 3786842820; // 0xE1B6A2C4
// Security classes of Z-Wave JS: 2 S2 Access Control, 1 S2 Authenticated, 0 S2 Unauthenticated, 7 S0, -1 none.
// Node status: 1 asleep, 2 awake, 3 dead, 4 alive.
const CONTROLLER = { id: "dev_ctrl", node: 1, name: "Z-Stick 800", maker: "Northgate", model: "Z-Stick 800 LR", fw: "7.22.1" };

// Each node: its device, its entities ([entity id, state, attributes, registry extras]) and its network status.
const NODES = [
  {
    id: "dev_dimmer", node: 2, name: "Hall dimmer", maker: "Lumen Labs", model: "Dimmer Switch", fw: "2.4.0", sec: 1, status: 4, plus: 2,
    entities: [
      ["light.hall_dimmer", "on", { friendly_name: "Hall dimmer", brightness: 153 }],
      ["sensor.hall_dimmer_signal_strength", "-62", { friendly_name: "Hall dimmer Signal strength", device_class: "signal_strength", unit_of_measurement: "dBm" }, { entity_category: "diagnostic" }],
    ],
  },
  {
    id: "dev_lock", node: 3, name: "Front door lock", maker: "Keystone", model: "Deadbolt Z", fw: "5.0.3", sec: 2, status: 4, plus: 2,
    entities: [
      ["lock.front_door_lock", "locked", { friendly_name: "Front door lock" }],
      ["sensor.front_door_lock_battery", "76", { friendly_name: "Front door lock Battery", device_class: "battery", unit_of_measurement: "%" }, { entity_category: "diagnostic" }],
      ["sensor.front_door_lock_signal_strength", "-67", { friendly_name: "Front door lock Signal strength", device_class: "signal_strength", unit_of_measurement: "dBm" }, { entity_category: "diagnostic" }],
    ],
  },
  {
    id: "dev_plug", node: 4, name: "Kitchen plug", maker: "Northgate", model: "Smart Plug", fw: "1.9.2", sec: 0, status: 4, plus: 2,
    entities: [
      ["switch.kitchen_plug", "on", { friendly_name: "Kitchen plug", device_class: "outlet" }],
      ["sensor.kitchen_plug_power", "37.5", { friendly_name: "Kitchen plug Power", device_class: "power", unit_of_measurement: "W" }],
    ],
  },
  {
    id: "dev_garage", node: 5, name: "Garage sensor", maker: "Northgate", model: "Multisensor 6", fw: "1.13", sec: 7, status: 4, plus: 1, down: 180,
    entities: [
      ["sensor.garage_sensor_temperature", "11.2", { friendly_name: "Garage sensor Temperature", device_class: "temperature", unit_of_measurement: "°C" }],
      ["sensor.garage_sensor_battery", "61", { friendly_name: "Garage sensor Battery", device_class: "battery", unit_of_measurement: "%" }, { entity_category: "diagnostic" }],
    ],
  },
  {
    id: "dev_patio", node: 6, name: "Patio door", maker: "Northgate", model: "Door Sensor 7", fw: "1.1.0", sec: 1, status: 1, plus: 2,
    entities: [
      ["binary_sensor.patio_door", "off", { friendly_name: "Patio door", device_class: "door" }],
      ["sensor.patio_door_battery", "88", { friendly_name: "Patio door Battery", device_class: "battery", unit_of_measurement: "%" }, { entity_category: "diagnostic" }],
    ],
  },
  {
    id: "dev_attic", node: 7, name: "Attic sensor", maker: "Lumen Labs", model: "Climate Sensor", fw: "1.0.9", sec: -1, status: 1, plus: 0,
    entities: [
      ["sensor.attic_sensor_temperature", "14.8", { friendly_name: "Attic sensor Temperature", device_class: "temperature", unit_of_measurement: "°C" }],
      ["sensor.attic_sensor_battery", "54", { friendly_name: "Attic sensor Battery", device_class: "battery", unit_of_measurement: "%" }, { entity_category: "diagnostic" }],
    ],
  },
  {
    id: "dev_blind", node: 8, name: "Bedroom blind", maker: "Shadeworks", model: "Roller Blind Z", fw: "3.2.1", sec: 1, status: 4, plus: 2,
    entities: [
      ["cover.bedroom_blind", "open", { friendly_name: "Bedroom blind", device_class: "blind", current_position: 100 }],
      ["sensor.bedroom_blind_battery", "17", { friendly_name: "Bedroom blind Battery", device_class: "battery", unit_of_measurement: "%" }, { entity_category: "diagnostic" }],
    ],
  },
  {
    id: "dev_siren", node: 9, name: "Hallway siren", maker: "Keystone", model: "Indoor Siren", fw: "2.0.1", sec: -1, status: 4, plus: 2,
    entities: [["switch.hallway_siren", "off", { friendly_name: "Hallway siren" }]],
  },
  {
    id: "dev_shed", node: 260, name: "Garden shed sensor", maker: "Lumen Labs", model: "Outdoor Sensor LR", fw: "1.2.0", sec: 1, status: 4, plus: 2,
    entities: [
      ["binary_sensor.garden_shed_motion", "off", { friendly_name: "Garden shed sensor Motion", device_class: "motion" }],
      ["sensor.garden_shed_battery", "92", { friendly_name: "Garden shed sensor Battery", device_class: "battery", unit_of_measurement: "%" }, { entity_category: "diagnostic" }],
      ["sensor.garden_shed_signal_strength", "-91", { friendly_name: "Garden shed sensor Signal strength", device_class: "signal_strength", unit_of_measurement: "dBm" }, { entity_category: "diagnostic" }],
    ],
  },
];

const STATUS_WORDS = { 1: "asleep", 2: "awake", 3: "dead", 4: "alive" };
const device = (n) => ({
  id: n.id, name: n.name, name_by_user: null, manufacturer: n.maker, model: n.model, model_id: null, sw_version: n.fw, hw_version: null,
  identifiers: [["zwave_js", `${HOME}-${n.node}`], ["zwave_js", `${HOME}-${n.node}-0x0086:0x0003:0x${String(n.node).padStart(4, "0")}`]],
  config_entries: ["zwave_entry"], via_device_id: n.node === 1 ? null : CONTROLLER.id, area_id: null, disabled_by: null, entry_type: null,
});

// The hass object of the cards: `healthy` brings the dead node back and changes the low battery; `rebuilding` shows
// a routes rebuild in progress; `disconnected` the driver disconnected.
export const mockHass = ({ dark = false, healthy = false, admin = true, rebuilding = false, disconnected = false } = {}) => {
  const states = {};
  const entities = {};
  const devices = { [CONTROLLER.id]: device(CONTROLLER) };
  const wsNodes = [{ node_id: 1, status: 4, ready: true, is_controller_node: true, is_secure: false, highest_security_class: null, zwave_plus_version: null }];
  for (const n of NODES) {
    const down = !healthy && n.down;
    const status = down ? 3 : n.status;
    devices[n.id] = device(n);
    for (const [id, state, attributes, extra = {}] of n.entities) {
      let value = down ? "unavailable" : state;
      if (healthy && id === "sensor.bedroom_blind_battery") value = "64";
      states[id] = { entity_id: id, state: value, attributes, last_changed: iso(down ? n.down : 180), last_updated: iso(down ? n.down : 2) };
      entities[id] = { entity_id: id, device_id: n.id, platform: "zwave_js", labels: [], ...extra };
    }
    // The node status sensor of Z-Wave JS.
    const sid = `sensor.${n.name.toLowerCase().replace(/ /g, "_")}_node_status`;
    states[sid] = { entity_id: sid, state: STATUS_WORDS[status], attributes: { friendly_name: `${n.name} Node status` }, last_changed: iso(down ? n.down : 240), last_updated: iso(down ? n.down : 240) };
    entities[sid] = { entity_id: sid, device_id: n.id, platform: "zwave_js", translation_key: "node_status", entity_category: "diagnostic", labels: [] };
    wsNodes.push({ node_id: n.node, status, ready: true, is_controller_node: false, is_secure: n.sec >= 0, highest_security_class: n.sec, zwave_plus_version: n.plus || null, is_routing: !n.entities.some((e) => e[2].device_class === "battery") });
  }
  // A device of another integration, left out of the cards.
  devices.dev_other = { id: "dev_other", name: "Router", identifiers: [["zha", "00:11"]], config_entries: ["zha"], via_device_id: null };
  let busy = rebuilding;
  const network = () => ({
    client: { ws_server_url: "ws://localhost:3000", state: disconnected ? "disconnected" : "connected", driver_version: "15.2.1", server_version: "3.1.0" },
    controller: {
      home_id: HOME, own_node_id: 1, sdk_version: "7.22.1", firmware_version: "7.22.1", rf_region: 11, is_rebuilding_routes: busy,
      rebuild_routes_progress: busy ? { 2: "done", 3: "done", 4: "done", 5: "pending", 6: "pending", 7: "pending", 8: "done", 9: "pending", 260: "pending" } : null,
      nodes: wsNodes,
    },
  });
  const LABELS = { on: "On", off: "Off", open: "Open", closed: "Closed", locked: "Locked", unlocked: "Unlocked", unavailable: "Unavailable" };
  return {
    language: "en",
    locale: { language: "en", number_format: "language", time_format: "24" },
    themes: { darkMode: dark },
    user: { is_admin: admin, name: "Admin" },
    config: { components: ["zwave_js"], time_zone: "Europe/Paris" },
    states,
    entities,
    devices,
    // Home Assistant's own formatting, reduced to what the mock entities need.
    formatEntityState: (st) => {
      const unit = st.attributes?.unit_of_measurement;
      if (st.entity_id.startsWith("binary_sensor.") && st.attributes?.device_class === "door") return st.state === "on" ? "Open" : "Closed";
      if (st.entity_id.startsWith("binary_sensor.") && st.attributes?.device_class === "motion") return st.state === "on" ? "Detected" : "Clear";
      if (st.entity_id.startsWith("light.") && st.state === "on" && st.attributes?.brightness) return `On · ${Math.round((st.attributes.brightness / 255) * 100)}%`;
      if (unit) return `${st.state} ${unit}`;
      return LABELS[st.state] ?? st.state;
    },
    callWS: async (msg) => {
      if (msg.type === "zwave_js/network_status") {
        if (!devices[msg.device_id]) throw { code: "not_found", message: "Device not found" };
        return JSON.parse(JSON.stringify(network()));
      }
      // Routes rebuild, on the config entry of the controller.
      if (msg.type === "zwave_js/begin_rebuilding_routes" || msg.type === "zwave_js/stop_rebuilding_routes") {
        if (msg.entry_id !== "zwave_entry") throw { code: "not_found", message: "Config entry not found" };
        busy = msg.type === "zwave_js/begin_rebuilding_routes";
        return busy;
      }
      throw { code: "not_supported", message: `${msg.type} not supported` };
    },
  };
};
