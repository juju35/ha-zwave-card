// Every capture of screenshots/: the stills (stills.mjs) and the GIFs (animations.mjs), each with its dark twin. The
// screenshots test reads it to flag a file of screenshots/ that no script produces any more.
// A light shot and its dark twin, both in English.
const pair = (file, extra = {}) => [
  { file, theme: "light", ...extra },
  { file: `${file}-dark`, theme: "dark", ...extra },
];

export const FULL = 480;
export const MINI = 400;
export const SHOTS = [
  // The full card: one node dead (its device blinks red in the banner), two asleep, one low battery.
  ...pair("card", { tag: "zwave-card", config: {} }),
  // Every node alive or asleep.
  ...pair("card-healthy", { tag: "zwave-card", config: {}, hass: { healthy: true } }),
  // The popup of a node, at the top of the card.
  ...pair("card-detail", { tag: "zwave-card", config: {}, clicks: ['.tile[data-node="dev_lock"]'] }),
  // The confirmation of a routes rebuild, at the top of the card.
  ...pair("card-rebuild", { tag: "zwave-card", config: {}, clicks: ['.btn[data-action="rebuild"]'] }),
  // Without the illustration, issues first.
  ...pair("card-classic", { tag: "zwave-card", config: { illustration: false, sort: "status" } }),
  // The mini card, with issues and healthy, and the same card unfolded by its detail button.
  ...pair("mini-card", { tag: "zwave-mini-card", config: {}, width: MINI }),
  ...pair("mini-card-healthy", { tag: "zwave-mini-card", config: {}, hass: { healthy: true }, width: MINI }),
  ...pair("mini-card-zoom", { tag: "zwave-mini-card", config: {}, clicks: [".zoom"] }),
];


export const GIFS = [
  // The banner of a healthy network: the controller and its devices, packets flowing along the links and the strip,
  // a sleeping battery device dozing.
  { name: "banner", tag: "zwave-card", width: 480, banner: true, config: {}, hass: { healthy: true } },
  // A dead node: its device and its link turn red, the device blinks.
  { name: "banner-dead", tag: "zwave-card", width: 480, banner: true, config: {} },
];
