// ---------------------------------------------------------------------------
// Shadow DOM patching (kept nodes keep their focus, hover and running animations)
// ---------------------------------------------------------------------------
import { ICONS, ZWAVE } from "./core.js";

export const patchAttrs = (cur, next) => {
  for (const { name } of [...cur.attributes]) if (!next.hasAttribute(name)) cur.removeAttribute(name);
  for (const { name, value } of next.attributes) if (cur.getAttribute(name) !== value) cur.setAttribute(name, value);
};
export const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute("data-key") : null);
export const sameNode = (a, b) => !!a && a.nodeType === b.nodeType && a.nodeName === b.nodeName;
export const patchChildren = (cur, next) => {
  const old = [...cur.childNodes];
  const fresh = [...next.childNodes];
  const byKey = new Map();
  for (const o of old) {
    const k = keyOf(o);
    if (k !== null && !byKey.has(k)) byKey.set(k, o);
  }
  const used = new Set();
  fresh.forEach((n, i) => {
    const k = keyOf(n);
    let o = k !== null ? byKey.get(k) : old[i];
    if (!sameNode(o, n) || used.has(o) || (k === null && keyOf(o) !== null)) o = null;
    const ref = cur.childNodes[i] ?? null;
    if (!o) {
      cur.insertBefore(n, ref);
      return;
    }
    used.add(o);
    if (o !== ref) cur.insertBefore(o, ref);
    if (n.nodeType === 1) {
      patchAttrs(o, n);
      patchChildren(o, n);
    } else if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
  });
  while (cur.childNodes.length > fresh.length) cur.removeChild(cur.lastChild);
};
export const morph = (root, html) => {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  patchChildren(root, tpl.content);
};

// A click inside a dialog (more-info opened from the card) is not a click outside the card.
export const inDialog = (ev) => ev.composedPath().some((n) => ["ha-more-info-dialog", "ha-dialog", "dialog"].includes(n.localName));

// "A click elsewhere" is caught on the pointer, not only on the click event: on iOS (Safari and the companion app)
// a tap on something that is not clickable sends no click to the page. The handler runs when the press and the
// release are both outside the card; keyboard clicks (no click count) still go through the click event.
export const watchOutside = (card, handler) => {
  let downOutside = false;
  const outside = (ev) => !ev.composedPath().includes(card);
  const onDown = (ev) => {
    downOutside = outside(ev);
  };
  const onUp = (ev) => {
    if (downOutside && outside(ev)) handler(ev);
    downOutside = false;
  };
  const onClick = (ev) => {
    if (ev.detail === 0 && outside(ev)) handler(ev);
  };
  return {
    on() {
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("pointerup", onUp, true);
      document.addEventListener("click", onClick, true);
    },
    off() {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("click", onClick, true);
    },
    tap(ev) {
      onDown(ev);
      onUp(ev);
    },
  };
};

// ---------------------------------------------------------------------------
// The banner's scene: a house section, the Z-Wave controller at its centre linked to six devices; packets travel the
// links, a sleeping battery device dozes (its link dashed, a "z" floating up), and a dead node turns red and blinks
// ---------------------------------------------------------------------------

// Every animation of the banner lasts a divisor of 6 s (packets 1.5 / 2 / 3 s, ping 2 s, blink 1.5 s, strip 2 s,
// doze 3 s): a 6 s recording loops. The scene is drawn in the 108 × 80 window (x 94 → 202) of a 200 × 80 box whose
// bottom edge stands on the ground strip; the house's walls go down to it. No SVG ids: several cards share a page safely.
export const SCENE_HUB = [148, 44];
export const SCENE_DEVICES = [
  [112, 22, "light"],
  [140, 14, "outlet"],
  [168, 31, "temperature"],
  [110, 58, "motion"],
  [186, 58, "lock"],
  [160, 66, "blinds_h"],
];
export const SCENE_DOWN = 4;
export const SCENE_SLEEP = 2;
export const SCENE_SPEEDS = [1.5, 2, 3, 1.5, 2, 3];
export const sceneSvg = (down, asleep) => {
  const [hx, hy] = SCENE_HUB;
  const kind = (i) => (down && i === SCENE_DOWN ? "down" : asleep && i === SCENE_SLEEP ? "sleep" : "up");
  const links = SCENE_DEVICES.map(([x, y], i) => {
    const k = kind(i);
    const line = `<line class="${k}" x1="${hx}" y1="${hy}" x2="${x}" y2="${y}"/>`;
    if (k !== "up") return line;
    return `${line}<circle class="pkt" r="1.6" style="offset-path:path('M${hx} ${hy} L${x} ${y}');animation-duration:${SCENE_SPEEDS[i]}s;animation-delay:-${i * 0.5}s"/>`;
  }).join("");
  const devices = SCENE_DEVICES.map(([x, y, icon], i) => {
    const k = kind(i);
    const extra =
      k === "down"
        ? '<circle class="alarm blink" cx="6.6" cy="-6.6" r="2.4"/>'
        : k === "sleep"
          ? `<g transform="translate(4 -16) scale(0.3)"><path class="zz" d="${ICONS.sleep}"/></g>`
          : "";
    return `<g class="dev${k === "up" ? "" : ` ${k}`}" transform="translate(${x} ${y})"><circle r="9"/><path transform="translate(-6.5 -6.5) scale(0.54)" d="${ICONS[icon]}"/>${extra}</g>`;
  }).join("");
  return `<svg class="scene" viewBox="94 0 108 80" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
    <path class="house" d="M98 80 V30 L148 6 L198 30 V80"/><line class="floor" x1="98" y1="44" x2="198" y2="44"/>
    <g class="links">${links}</g>${devices}
    <g transform="translate(${hx} ${hy})"><circle class="ping" r="10"/><circle class="hub" r="10"/><path class="hub-logo" transform="translate(-7 -7) scale(0.5833)" d="${ZWAVE}"/></g>
  </svg>`;
};
