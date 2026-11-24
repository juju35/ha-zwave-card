// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
import { pickerDefine } from "./card-picker.js";
import { VERSION } from "./core.js";
import { ZWaveCard } from "./full-card.js";
import { ZWaveMiniCard } from "./mini-card.js";
import { ZWaveCardEditor, ZWaveMiniCardEditor } from "./visual-editors.js";

export const define = (name, cls) => {
  if (!customElements.get(name)) pickerDefine(name, cls);
};
define("zwave-card", ZWaveCard);
define("zwave-mini-card", ZWaveMiniCard);
define("zwave-card-editor", ZWaveCardEditor);
define("zwave-mini-card-editor", ZWaveMiniCardEditor);

window.customCards = window.customCards || [];
for (const card of [
  {
    type: "zwave-card",
    name: "Z-Wave Card",
    description: "Every node of the Z-Wave JS integration with its status, security and protocol, its controller, under an animated banner.",
  },
  {
    type: "zwave-mini-card",
    name: "Z-Wave Mini Card",
    description: "The health of the Z-Wave network at a glance, with a detail button to the full card.",
  },
]) {
  if (!window.customCards.some((c) => c.type === card.type))
    window.customCards.push({ ...card, preview: true, documentationURL: "https://github.com/juju35/ha-zwave-card" });
}

console.info(
  `%c ZWAVE-CARD %c v${VERSION} `,
  "color: white; background: #1e6fd9; font-weight: 700;",
  "color: #1e6fd9; background: white; font-weight: 700;",
);
