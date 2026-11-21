// Browser test (Chromium through Playwright) of the cards' layout: at their minimum width (8 columns of a sections
// view on a phone for the full card, 6 for the mini card) and wider, in long languages and both themes, with and
// without the illustration: nothing leaves the card, no text lies under the scene, the title keeps a few characters,
// the 40 px badges keep their size, and the node popup opens at the top of the card.
// Skipped when Playwright or Chromium is not installed, except in CI, where it must run.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { NOW } from "../scripts/screenshots/mock.mjs";

const src = readFileSync(new URL("../src/zwave-card.js", import.meta.url), "utf8");
const mock = `${readFileSync(new URL("../scripts/screenshots/mock.mjs", import.meta.url), "utf8").replace(/^export /gm, "")}\nwindow.mockHass = mockHass;`;
const THEMES = {
  light: { "--card-background-color": "#fff", "--primary-text-color": "#212121", "--secondary-text-color": "#727272", "--secondary-background-color": "#f1f1f1" },
  dark: { "--card-background-color": "#1c1c1c", "--primary-text-color": "#e1e1e1", "--secondary-text-color": "#9b9b9b", "--secondary-background-color": "#282828" },
};
const HA_CARD = `customElements.define("ha-card", class extends HTMLElement { constructor() { super();
  this.attachShadow({ mode: "open" }).innerHTML = "<style>:host{display:block;overflow:hidden;background:var(--card-background-color);color:var(--primary-text-color)}</style><slot></slot>"; } });`;

let browser;
let skip = false;
before(async () => {
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  } catch (err) {
    if (process.env.CI) throw err;
    skip = `Chromium not available: ${err.message.split("\n")[0]}`;
  }
});
after(() => browser?.close());

const measure = async (cases) => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.setContent("<!doctype html><body style='margin:0;font-family:Roboto,Arial,sans-serif'></body>");
  await page.addScriptTag({ content: HA_CARD });
  await page.addScriptTag({ content: mock });
  await page.addScriptTag({ content: src });
  // Every card created once first, so that the websocket answers of the mock are in the shared store.
  await page.evaluate(() => {
    const el = document.createElement("zwave-card");
    el.setConfig({});
    el.hass = window.mockHass();
    document.body.appendChild(el);
  });
  await page.waitForTimeout(100);
  const out = await page.evaluate(
    async ({ cases, THEMES }) => {
      // The header is fitted (status pill) once laid out: a frame after the card is attached or changed.
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = [];
      for (const c of cases) {
        const box = document.createElement("div");
        box.style.cssText = `width:${c.width}px;${Object.entries(THEMES[c.theme]).map(([k, v]) => `${k}:${v}`).join(";")}`;
        document.body.appendChild(box);
        const el = document.createElement(c.type);
        el.setConfig({ type: `custom:${c.type}`, language: c.lang, ...c.config });
        el.hass = window.mockHass({ dark: c.theme === "dark" });
        box.appendChild(el);
        await frame();
        const sr = el.shadowRoot;
        const click = (sel) => sr.querySelector(sel)?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, detail: 1 }));
        if (c.zoom) click(".zoom");
        if (c.detail) click(".tile[data-node]");
        if (c.zoom || c.detail) await frame();
        const card = sr.querySelector("ha-card").getBoundingClientRect();
        const rect = (n) => n.getBoundingClientRect();
        const shown = (n) => n.getClientRects().length > 0 && getComputedStyle(n).visibility !== "hidden" && getComputedStyle(n).display !== "none";
        // What shows of an element: its box clipped by its ancestors that hide their overflow (an ellipsis).
        const visible = (n) => {
          let { left, right } = rect(n);
          for (let p = n.parentElement; p && p.localName !== "ha-card"; p = p.parentElement) {
            if (getComputedStyle(p).overflowX !== "visible") {
              left = Math.max(left, rect(p).left);
              right = Math.min(right, rect(p).right);
            }
          }
          return { left, right };
        };
        const outside = [...sr.querySelectorAll("*")]
          .filter((n) => shown(n) && !n.closest("svg") && !n.closest(".strip") && !n.closest(".backdrop"))
          .filter((n) => {
            const v = visible(n);
            return v.right > v.left && (v.right > card.right + 0.5 || v.left < card.left - 0.5);
          })
          .map((n) => n.className?.baseVal ?? n.className);
        const scene = sr.querySelector(".scene");
        const head = sr.querySelector(".head");
        const sceneShown = scene && shown(scene);
        const under =
          sceneShown && head
            ? [...head.querySelectorAll("*")].filter((n) => shown(n) && n.children.length === 0 && n.textContent && rect(n).right > rect(scene).left + 0.5).map((n) => n.textContent)
            : [];
        const name = sr.querySelector(".name, .title");
        const badge = sr.querySelector(".badge");
        const tileIcon = sr.querySelector(".grid .ic");
        const modal = sr.querySelector(".modal");
        const tiles = [...sr.querySelectorAll(".grid .tile[data-node]")];
        const r = {
          cols: new Set(tiles.map((n) => Math.round(rect(n).left))).size,
          cutNames: tiles.map((n) => n.querySelector(".tname")).filter((n) => n.scrollHeight > n.clientHeight + 0.5 || n.scrollWidth > n.clientWidth + 0.5).map((n) => n.textContent),
          smallText: tiles.flatMap((n) => [...n.querySelectorAll(".tname, .tstate, .tag")]).filter((n) => parseFloat(getComputedStyle(n).fontSize) < 11).map((n) => n.textContent),
          outside,
          under,
          nameWidth: name ? rect(name).width : 0,
          ch: name ? parseFloat(getComputedStyle(name).fontSize) * 2 : 0,
          badge: badge ? [Math.round(rect(badge).width), Math.round(rect(badge).height)] : null,
          tileIcon: tileIcon ? Math.round(rect(tileIcon).width) : null,
          modalTop: modal ? rect(modal).top - card.top : null,
          modalOut: modal ? rect(modal).right > card.right + 0.5 || rect(modal).left < card.left - 0.5 : false,
          pill: (() => {
            const p = sr.querySelector(".bst");
            const tx = p?.querySelector(".txt");
            if (!tx) return null;
            const nm = rect(name);
            const pr = rect(p);
            // The header's text against the banner and the top of its ground strip.
            const t = p.closest(".titles") || p.parentElement;
            const banner = p.closest(".banner");
            const parts = [...t.querySelectorAll(":scope > *, .trow > *")].map(rect).filter((r) => r.width);
            const b = banner ? rect(banner) : null;
            const floor = banner ? rect(banner.querySelector(".strip")).top : Infinity;
            return { cut: tx.scrollWidth - tx.clientWidth, dot: !shown(tx), label: p.getAttribute("aria-label"), beside: pr.top < nm.bottom - 2,
                     centred: Math.abs((pr.top + pr.bottom) / 2 - (nm.top + nm.bottom) / 2) <= 2, titleCut: name.scrollWidth - name.clientWidth,
                     low: Math.max(...parts.map((r) => r.bottom)) - floor,
                     out: b ? Math.max(b.top - Math.min(...parts.map((r) => r.top)), Math.max(...parts.map((r) => r.right)) - b.right) : 0 };
          })(),
        };
        box.remove();
        out.push(r);
      }
      return out;
    },
    { cases, THEMES },
  );
  await page.close();
  assert.deepEqual(errors, []);
  return out;
};

const LANGS = ["en", "fr", "de", "el", "sr", "lv", "hu", "pt", "ru"];
const matrix = (variants, widths) => {
  const cases = [];
  for (const v of variants) for (const lang of LANGS) for (const theme of ["light", "dark"]) for (const width of widths) cases.push({ ...v, lang, theme, width });
  return cases;
};

test("at their minimum width and wider, nothing leaves the card and no text lies under the scene", { timeout: 180000 }, async (t) => {
  if (skip) return t.skip(skip);
  const cases = [
    ...matrix([{ type: "zwave-card", config: {} }, { type: "zwave-card", config: { illustration: false, columns: 3 } }], [208, 245, 300, 380, 480, 560]),
    ...matrix([{ type: "zwave-mini-card", config: {} }], [156, 208, 245, 300, 400]),
    ...matrix([{ type: "zwave-mini-card", config: {}, zoom: true }], [208, 300, 480]),
  ];
  const results = await measure(cases);
  results.forEach((r, i) => {
    const c = cases[i];
    const at = `${c.type} ${JSON.stringify(c.config)}${c.zoom ? " zoomed" : ""} ${c.lang} ${c.theme} ${c.width}px`;
    assert.deepEqual(r.outside, [], `outside the card: ${at}`);
    assert.deepEqual(r.under, [], `text under the scene: ${at}`);
    assert.ok(r.nameWidth >= r.ch, `title ${r.nameWidth.toFixed(0)} px: ${at}`);
    assert.deepEqual(r.badge, [40, 40], `badge: ${at}`);
    if (r.tileIcon !== null) assert.equal(r.tileIcon, 40, `tile icon: ${at}`);
  });
});

test("the node popup opens at the top of the card and stays in it", { timeout: 60000 }, async (t) => {
  if (skip) return t.skip(skip);
  const cases = matrix([{ type: "zwave-card", config: {}, detail: true }, { type: "zwave-mini-card", config: {}, zoom: true, detail: true }], [245, 480]);
  const results = await measure(cases);
  results.forEach((r, i) => {
    const c = cases[i];
    const at = `${c.type} ${c.lang} ${c.theme} ${c.width}px`;
    assert.ok(r.modalTop !== null && r.modalTop <= 12, `popup top ${r.modalTop}: ${at}`);
    assert.equal(r.modalOut, false, `popup outside the card: ${at}`);
  });
});

// The status pill: on the title's row only beside the whole title (no ellipsis), otherwise on a line of its own under
// the subtitle; its label whole, or its dot alone (always at 190 px); nothing into the ground strip or out of the banner.
test("the status pill: beside the whole title or under the subtitle, whole label or dot, inside the banner", { timeout: 300000 }, async (t) => {
  if (skip) return t.skip(skip);
  const widths = [190, 245, 300, 400, 460, 500];
  const langs = ["en", "fr", "de", "hu", "el", "ru"];
  const pillMatrix = (variants) => matrix(variants, widths).filter((c) => langs.includes(c.lang));
  const cases = [
    ...pillMatrix([{ type: "zwave-card", config: {} }, { type: "zwave-card", config: { illustration: false } }]),
    ...pillMatrix([{ type: "zwave-mini-card", config: {} }, { type: "zwave-mini-card", config: { illustration: false } }]),
    ...pillMatrix([{ type: "zwave-mini-card", config: {}, zoom: true }]),
  ];
  const results = await measure(cases);
  results.forEach((r, i) => {
    const c = cases[i];
    const at = `${c.type} ${JSON.stringify(c.config)}${c.zoom ? " zoomed" : ""} ${c.lang} ${c.theme} ${c.width}px`;
    assert.ok(r.pill, `no pill: ${at}`);
    if (c.width <= 200) assert.ok(r.pill.dot, `pill label shown: ${at}`);
    if (!r.pill.dot) assert.ok(r.pill.cut <= 0.5, `pill "${r.pill.label}" cut by ${r.pill.cut}px: ${at}`);
    if (r.pill.beside) assert.ok(r.pill.centred, `pill not centred on the title: ${at}`);
    if (r.pill.beside) assert.ok(r.pill.titleCut <= 0, `title cut beside the pill: ${at}`);
    assert.ok(r.nameWidth >= 24, `title ${r.nameWidth}px wide: ${at}`);
    assert.ok(r.pill.low <= 0.5, `header text ${r.pill.low}px into the ground strip: ${at}`);
    assert.ok(r.pill.out <= 0.5, `header text ${r.pill.out}px out of the banner: ${at}`);
  });
});

test("node tiles: two per row from 400 px, every name whole (the tags on the state line), no text under 11 px", { timeout: 120000 }, async (t) => {
  if (skip) return t.skip(skip);
  const cases = [...matrix([{ type: "zwave-card", config: {} }], [400, 450, 500]), ...matrix([{ type: "zwave-card", config: {} }], [245, 300])];
  const results = await measure(cases);
  results.forEach((r, i) => {
    const c = cases[i];
    const at = `${c.lang} ${c.theme} ${c.width}px`;
    if (c.width >= 400) assert.equal(r.cols, 2, `tiles per row: ${at}`);
    assert.deepEqual(r.cutNames, [], `names cut: ${at}`);
    assert.deepEqual(r.smallText, [], `text under 11 px: ${at}`);
  });
});

// A state change must not move the page: an update of an entity the card does not use changes nothing in its shadow
// DOM, an update of one of its nodes patches that tile's text in place (no node replaced, the header untouched), and
// the card's height never changes, frame after frame.
test("state updates: nothing changes for other entities, one tile patched in place, a steady height", { timeout: 120000 }, async (t) => {
  if (skip) return t.skip(skip);
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.setContent("<!doctype html><body style='margin:0;font-family:Roboto,Arial,sans-serif'></body>");
  await page.addScriptTag({ content: HA_CARD });
  await page.addScriptTag({ content: mock });
  await page.addScriptTag({ content: src });
  const variants = [
    ["zwave-card", {}, 400],
    ["zwave-card", { illustration: false }, 300],
    ["zwave-mini-card", {}, 300],
    ["zwave-mini-card", { illustration: false }, 245],
  ];
  const results = await page.evaluate(async (variants) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out = [];
    for (const [type, config, width] of variants) {
      const box = document.createElement("div");
      box.style.width = `${width}px`;
      document.body.appendChild(box);
      const el = document.createElement(type);
      el.setConfig(config);
      let hass = window.mockHass();
      el.hass = hass;
      box.appendChild(el);
      await new Promise((r) => setTimeout(r, 50));
      await frame();
      const heights = new Set();
      let watching = true;
      const tick = () => {
        heights.add(Math.round(el.getBoundingClientRect().height * 10) / 10);
        if (watching) requestAnimationFrame(tick);
      };
      tick();
      const seen = { unrelated: [], relevant: [] };
      let records = [];
      const mo = new MutationObserver((ms) => records.push(...ms));
      mo.observe(el.shadowRoot, { subtree: true, childList: true, attributes: true, characterData: true });
      for (let k = 0; k < 20; k++) {
        const relevant = k % 2 === 1;
        const states = { ...hass.states };
        if (relevant) states["sensor.kitchen_plug_power"] = { ...states["sensor.kitchen_plug_power"], state: String(30 + k) };
        else states["sensor.elsewhere"] = { entity_id: "sensor.elsewhere", state: String(k), attributes: {} };
        hass = { ...hass, states };
        records = [];
        el.hass = hass;
        await frame();
        seen[relevant ? "relevant" : "unrelated"].push({
          count: records.length,
          replaced: records.filter((m) => m.type === "childList").length,
          header: records.filter((m) => (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest(".banner, .header, .mhead")).length,
        });
      }
      watching = false;
      mo.disconnect();
      box.remove();
      out.push({ type, config, heights: [...heights], ...seen });
    }
    return out;
  }, variants);
  await page.close();
  assert.deepEqual(errors, []);
  for (const r of results) {
    const at = `${r.type} ${JSON.stringify(r.config)}`;
    assert.equal(r.heights.length, 1, `height changed (${r.heights.join(", ")}): ${at}`);
    assert.ok(r.unrelated.every((u) => u.count === 0), `DOM changed on another entity's update: ${at}`);
    assert.ok(r.relevant.every((u) => u.replaced === 0 && u.header === 0), `nodes replaced or header changed on a node's update: ${at}`);
    // The full card shows the plug's power on its tile: its text (and label) is patched, nothing more.
    if (r.type === "zwave-card") assert.ok(r.relevant.every((u) => u.count > 0 && u.count <= 2), `tile not patched in place: ${at} ${JSON.stringify(r.relevant)}`);
    else assert.ok(r.relevant.every((u) => u.count === 0), `the compact mini card changed: ${at}`);
  }
});

// The compact mini card's detail button is pushed to the right by an auto margin: that margin is free room, so a short
// title keeps its pill beside it.
test("compact mini card: the pill stays beside a short title, left of the detail button", { timeout: 60000 }, async (t) => {
  if (skip) return t.skip(skip);
  const cases = ["light", "dark"].map((theme) => ({ type: "zwave-mini-card", config: { illustration: false }, lang: "en", theme, width: 400 }));
  const results = await measure(cases);
  for (const r of results) assert.ok(r.pill?.beside && !r.pill.dot, `pill not beside the title: ${JSON.stringify(r.pill)}`);
});
