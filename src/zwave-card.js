// ── Card picker: light previews ──────────────────────────────────────────────
// Home Assistant's card picker builds a live preview of every card registered with `preview: true`, all at once and
// with no lazy loading. A preview here is drawn only once it scrolls into view: the picker calls getStubConfig() right
// before it creates the preview, which marks the next instance of that card; once connected under <hui-card-picker>,
// that instance holds Home Assistant's state (no render, no history, no animation) until it is visible. Anywhere else
// (a dashboard, the card editor) the card behaves as before. Editors and other elements are defined unchanged.
function pickerDefine(tag, Card, options) {
  const isCard = !tag.endsWith("-editor") && (typeof Card.getStubConfig === "function" || typeof Card.getConfigElement === "function");
  if (!isCard || typeof IntersectionObserver !== "function") return customElements.define(tag, Card, options);
  let marks = [];
  const lazy = class extends Card {
    static getStubConfig(...args) {
      marks.push(Date.now());
      return Card.getStubConfig ? Card.getStubConfig(...args) : {};
    }

    constructor() {
      super();
      const now = Date.now();
      marks = marks.filter((t) => now - t < 5000);
      if (marks.length) {
        marks.shift();
        this._plHold = true;
      }
    }

    set hass(hass) {
      if (this._plHold) this._plHass = hass;
      else super.hass = hass;
    }

    get hass() {
      return this._plHold ? this._plHass : super.hass;
    }

    connectedCallback() {
      if (!this._plHold) return super.connectedCallback?.();
      if (this.getRootNode()?.host?.localName !== "hui-card-picker") return this._plRelease();
      if (this._plIo) return;
      // A custom element is inline until its styles arrive: a block of a card's height keeps the cells apart, so
      // that only the previews actually on screen intersect.
      this.style.display = "block";
      this.style.minHeight = "120px";
      this._plIo = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && this._plRelease(), {
        rootMargin: "200px",
      });
      this._plIo.observe(this);
    }

    disconnectedCallback() {
      if (this._plHold) return;
      super.disconnectedCallback?.();
    }

    _plRelease() {
      this._plIo?.disconnect();
      this._plIo = null;
      this._plHold = false;
      this.style.display = "";
      this.style.minHeight = "";
      if (this._plHass !== undefined) super.hass = this._plHass;
      this._plHass = undefined;
      if (this.isConnected) super.connectedCallback?.();
    }
  };
  return customElements.define(tag, lazy, options);
}

/*
 * Z-Wave Card for Home Assistant
 * https://github.com/juju35/ha-zwave-card
 *
 * The Z-Wave network of Home Assistant at a glance: every node of the Z-Wave JS integration, its status (alive,
 * awake, asleep, dead), its security class and its protocol (Z-Wave or Long Range), its health and its details, the
 * controller it hangs on, under an animated banner. The nodes come from the device registry (devices with a
 * `zwave_js` identifier), the controller and the status of every node from the integration's `zwave_js/network_status`
 * websocket command (administrators), else from the nodes' entities.
 */

const VERSION = "__VERSION__";

// The Z-Wave mark (mdi z-wave, 24 × 24): drawn with currentColor.
const ZWAVE =
  "M16.3,10.58C13.14,10.58 10.6,13.13 10.6,16.28C10.6,19.43 13.15,22 16.3,22C19.45,22 22,19.43 22,16.28C22,13.13 19.45,10.58 16.3,10.58M18,19.08H13.19L15.81,15H13.31L14.4,13.23H19.18L16.63,17.28H19.18L18,19.08M16.3,3.93V2C8.41,2 2,8.42 2,16.31H3.92C3.94,9.46 9.5,3.93 16.3,3.93M16.3,7.74V5.82C10.5,5.82 5.81,10.53 5.81,16.31H7.73C7.75,11.58 11.59,7.74 16.3,7.74";

// mdi icon paths: the cards draw their icons themselves (no <ha-icon> unless an entity has an icon of its own).
const ICONS = {
  light: "M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z",
  plug: "M16,7V3H14V7H10V3H8V7H8C7,7 6,8 6,9V14.5L9.5,18V21H14.5V18L18,14.5V9C18,8 17,7 16,7Z",
  outlet: "M7.5,10.5A1.5,1.5 0 0,1 9,12A1.5,1.5 0 0,1 7.5,13.5C6.66,13.5 6,12.83 6,12A1.5,1.5 0 0,1 7.5,10.5M16.5,10.5A1.5,1.5 0 0,1 18,12A1.5,1.5 0 0,1 16.5,13.5A1.5,1.5 0 0,1 15,12A1.5,1.5 0 0,1 16.5,10.5M4.22,2H19.78C21,2 22,3 22,4.22V19.78A2.22,2.22 0 0,1 19.78,22H4.22C3,22 2,21 2,19.78V4.22A2.22,2.22 0 0,1 4.22,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z",
  switch: "M18.4 1.6C18 1.2 17.5 1 17 1H7C6.5 1 6 1.2 5.6 1.6C5.2 2 5 2.5 5 3V21C5 21.5 5.2 22 5.6 22.4C6 22.8 6.5 23 7 23H17C17.5 23 18 22.8 18.4 22.4C18.8 22 19 21.5 19 21V3C19 2.5 18.8 2 18.4 1.6M16 7C16 7.6 15.6 8 15 8H9C8.4 8 8 7.6 8 7V5C8 4.4 8.4 4 9 4H15C15.6 4 16 4.4 16 5V7Z",
  lock: "M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z",
  door: "M16,11H18V13H16V11M12,3H19C20.11,3 21,3.89 21,5V19H22V21H2V19H10V5C10,3.89 10.89,3 12,3M12,5V19H19V5H12Z",
  window: "M21 20V2H3V20H1V23H23V20M19 4V11H13V4M5 4H11V11H5M5 20V13H11V20M13 20V13H19V20Z",
  motion: "M10,0.2C9,0.2 8.2,1 8.2,2C8.2,3 9,3.8 10,3.8C11,3.8 11.8,3 11.8,2C11.8,1 11,0.2 10,0.2M15.67,1A7.33,7.33 0 0,0 23,8.33V7A6,6 0 0,1 17,1H15.67M18.33,1C18.33,3.58 20.42,5.67 23,5.67V4.33C21.16,4.33 19.67,2.84 19.67,1H18.33M21,1A2,2 0 0,0 23,3V1H21M7.92,4.03C7.75,4.03 7.58,4.06 7.42,4.11L2,5.8V11H3.8V7.33L5.91,6.67L2,22H3.8L6.67,13.89L9,17V22H10.8V15.59L8.31,11.05L9.04,8.18L10.12,10H15V8.2H11.38L9.38,4.87C9.08,4.37 8.54,4.03 7.92,4.03Z",
  moisture: "M10 3.25C10 3.25 16 10 16 14C16 17.31 13.31 20 10 20S4 17.31 4 14C4 10 10 3.25 10 3.25M20 7V13H18V7H20M18 17H20V15H18V17Z",
  temperature: "M15 13V5A3 3 0 0 0 9 5V13A5 5 0 1 0 15 13M12 4A1 1 0 0 1 13 5V8H11V5A1 1 0 0 1 12 4Z",
  humidity: "M12,3.25C12,3.25 6,10 6,14C6,17.32 8.69,20 12,20A6,6 0 0,0 18,14C18,10 12,3.25 12,3.25M14.47,9.97L15.53,11.03L9.53,17.03L8.47,15.97M9.75,10A1.25,1.25 0 0,1 11,11.25A1.25,1.25 0 0,1 9.75,12.5A1.25,1.25 0 0,1 8.5,11.25A1.25,1.25 0 0,1 9.75,10M14.25,14.5A1.25,1.25 0 0,1 15.5,15.75A1.25,1.25 0 0,1 14.25,17A1.25,1.25 0 0,1 13,15.75A1.25,1.25 0 0,1 14.25,14.5Z",
  blinds: "M3,2H21A1,1 0 0,1 22,3V5A1,1 0 0,1 21,6H20V13A1,1 0 0,1 19,14H13V16.17C14.17,16.58 15,17.69 15,19A3,3 0 0,1 12,22A3,3 0 0,1 9,19C9,17.69 9.83,16.58 11,16.17V14H5A1,1 0 0,1 4,13V6H3A1,1 0 0,1 2,5V3A1,1 0 0,1 3,2M12,18A1,1 0 0,0 11,19A1,1 0 0,0 12,20A1,1 0 0,0 13,19A1,1 0 0,0 12,18Z",
  // The scene's blind (mdi blinds-horizontal).
  blinds_h:
    "M20 19V3H4V19H2V21H22V19H20M16 9H18V11H16V9M14 11H6V9H14V11M18 7H16V5H18V7M14 5V7H6V5H14M6 19V13H14V14.82C13.55 15.14 13.25 15.66 13.25 16.25C13.25 17.22 14.03 18 15 18S16.75 17.22 16.75 16.25C16.75 15.66 16.45 15.13 16 14.82V13H18V19H6Z",
  shutter: "M3 4H21V8H19V20H17V8H7V20H5V8H3V4M8 9H16V11H8V9M8 12H16V14H8V12M8 15H16V17H8V15M8 18H16V20H8V18Z",
  curtains: "M23 3H1V1H23V3M2 22H6C6 19 4 17 4 17C10 13 11 4 11 4H2V22M22 4H13C13 4 14 13 20 17C20 17 18 19 18 22H22V4Z",
  garage: "M19,20H17V11H7V20H5V9L12,5L19,9V20M8,12H16V14H8V12M8,15H16V17H8V15M16,18V20H8V18H16Z",
  thermostat: "M16.95,16.95L14.83,14.83C15.55,14.1 16,13.1 16,12C16,11.26 15.79,10.57 15.43,10L17.6,7.81C18.5,9 19,10.43 19,12C19,13.93 18.22,15.68 16.95,16.95M12,5C13.57,5 15,5.5 16.19,6.4L14,8.56C13.43,8.21 12.74,8 12,8A4,4 0 0,0 8,12C8,13.1 8.45,14.1 9.17,14.83L7.05,16.95C5.78,15.68 5,13.93 5,12A7,7 0 0,1 12,5M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,6.47 17.5,2 12,2Z",
  fan: "M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.68 9.22,10.87C9.41,10.39 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z",
  air: "M19,18.31V20A2,2 0 0,1 17,22H7A2,2 0 0,1 5,20V16.3C4.54,16.12 3.95,16 3,16A1,1 0 0,1 2,15A1,1 0 0,1 3,14C3.82,14 4.47,14.08 5,14.21V12.3C4.54,12.12 3.95,12 3,12A1,1 0 0,1 2,11A1,1 0 0,1 3,10C3.82,10 4.47,10.08 5,10.21V8.3C4.54,8.12 3.95,8 3,8A1,1 0 0,1 2,7A1,1 0 0,1 3,6C3.82,6 4.47,6.08 5,6.21V4A2,2 0 0,1 7,2H17A2,2 0 0,1 19,4V6.16C20.78,6.47 21.54,7.13 21.71,7.29C22.1,7.68 22.1,8.32 21.71,8.71C21.32,9.1 20.8,9.09 20.29,8.71V8.71C20.29,8.71 19.25,8 17,8C15.74,8 14.91,8.41 13.95,8.9C12.91,9.41 11.74,10 10,10C9.64,10 9.31,10 9,9.96V7.95C9.3,8 9.63,8 10,8C11.26,8 12.09,7.59 13.05,7.11C14.09,6.59 15.27,6 17,6V4H7V20H17V18C18.5,18 18.97,18.29 19,18.31M17,10C15.27,10 14.09,10.59 13.05,11.11C12.09,11.59 11.26,12 10,12C9.63,12 9.3,12 9,11.95V13.96C9.31,14 9.64,14 10,14C11.74,14 12.91,13.41 13.95,12.9C14.91,12.42 15.74,12 17,12C19.25,12 20.29,12.71 20.29,12.71V12.71C20.8,13.1 21.32,13.1 21.71,12.71C22.1,12.32 22.1,11.69 21.71,11.29C21.5,11.08 20.25,10 17,10M17,14C15.27,14 14.09,14.59 13.05,15.11C12.09,15.59 11.26,16 10,16C9.63,16 9.3,16 9,15.95V17.96C9.31,18 9.64,18 10,18C11.74,18 12.91,17.41 13.95,16.9C14.91,16.42 15.74,16 17,16C19.25,16 20.29,16.71 20.29,16.71V16.71C20.8,17.1 21.32,17.1 21.71,16.71C22.1,16.32 22.1,15.69 21.71,15.29C21.5,15.08 20.25,14 17,14Z",
  humidifier: "M11 9C8.79 9 7 10.79 7 13S8.79 17 11 17 15 15.21 15 13 13.21 9 11 9M11 15C9.9 15 9 14.11 9 13S9.9 11 11 11 13 11.9 13 13 12.11 15 11 15M7 4H14C16.21 4 18 5.79 18 8V9H16V8C16 6.9 15.11 6 14 6H7C5.9 6 5 6.9 5 8V20H16V18H18V22H3V8C3 5.79 4.79 4 7 4M19 10.5C19 10.5 21 12.67 21 14C21 15.1 20.1 16 19 16S17 15.1 17 14C17 12.67 19 10.5 19 10.5",
  button: "M13 5C15.21 5 17 6.79 17 9C17 10.5 16.2 11.77 15 12.46V11.24C15.61 10.69 16 9.89 16 9C16 7.34 14.66 6 13 6S10 7.34 10 9C10 9.89 10.39 10.69 11 11.24V12.46C9.8 11.77 9 10.5 9 9C9 6.79 10.79 5 13 5M20 20.5C19.97 21.32 19.32 21.97 18.5 22H13C12.62 22 12.26 21.85 12 21.57L8 17.37L8.74 16.6C8.93 16.39 9.2 16.28 9.5 16.28H9.7L12 18V9C12 8.45 12.45 8 13 8S14 8.45 14 9V13.47L15.21 13.6L19.15 15.79C19.68 16.03 20 16.56 20 17.14V20.5M20 2H4C2.9 2 2 2.9 2 4V12C2 13.11 2.9 14 4 14H8V12L4 12L4 4H20L20 12H18V14H20V13.96L20.04 14C21.13 14 22 13.09 22 12V4C22 2.9 21.11 2 20 2Z",
  expand: "M10,21V19H6.41L10.91,14.5L9.5,13.09L5,17.59V14H3V21H10M14.5,10.91L19,6.41V10H21V3H14V5H17.59L13.09,9.5L14.5,10.91Z",
  collapse: "M19.5,3.09L15,7.59V4H13V11H20V9H16.41L20.91,4.5L19.5,3.09M4,13V15H7.59L3.09,19.5L4.5,20.91L9,16.41V20H11V13H4Z",
  close: "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z",
  chip: "M6,4H18V5H21V7H18V9H21V11H18V13H21V15H18V17H21V19H18V20H6V19H3V17H6V15H3V13H6V11H3V9H6V7H3V5H6V4M11,15V18H12V15H11M13,15V18H14V15H13M15,15V18H16V15H15Z",
  speaker: "M12,12A3,3 0 0,0 9,15A3,3 0 0,0 12,18A3,3 0 0,0 15,15A3,3 0 0,0 12,12M12,20A5,5 0 0,1 7,15A5,5 0 0,1 12,10A5,5 0 0,1 17,15A5,5 0 0,1 12,20M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8C10.89,8 10,7.1 10,6C10,4.89 10.89,4 12,4M17,2H7C5.89,2 5,2.89 5,4V20A2,2 0 0,0 7,22H17A2,2 0 0,0 19,20V4C19,2.89 18.1,2 17,2Z",
  vacuum: "M12,2C14.65,2 17.19,3.06 19.07,4.93L17.65,6.35C16.15,4.85 14.12,4 12,4C9.88,4 7.84,4.84 6.35,6.35L4.93,4.93C6.81,3.06 9.35,2 12,2M3.66,6.5L5.11,7.94C4.39,9.17 4,10.57 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,10.57 19.61,9.17 18.88,7.94L20.34,6.5C21.42,8.12 22,10.04 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12C2,10.04 2.58,8.12 3.66,6.5M12,6A6,6 0 0,1 18,12C18,13.59 17.37,15.12 16.24,16.24L14.83,14.83C14.08,15.58 13.06,16 12,16C10.94,16 9.92,15.58 9.17,14.83L7.76,16.24C6.63,15.12 6,13.59 6,12A6,6 0 0,1 12,6M12,8A1,1 0 0,0 11,9A1,1 0 0,0 12,10A1,1 0 0,0 13,9A1,1 0 0,0 12,8Z",
  smoke: "M12 4C16.41 4 20 7.59 20 12S16.41 20 12 20 4 16.41 4 12 7.59 4 12 4M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 11C11.45 11 11 11.45 11 12S11.45 13 12 13 13 12.55 13 12 12.55 11 12 11M10.72 9.3C11.11 9.11 11.54 9 12 9S12.89 9.11 13.29 9.3L14 8.57C13.43 8.22 12.74 8 12 8S10.58 8.22 10 8.57L10.72 9.3M15 12C15 12.46 14.89 12.89 14.7 13.29L15.43 14C15.79 13.43 16 12.74 16 12S15.79 10.58 15.43 10L14.7 10.72C14.89 11.11 15 11.54 15 12M9 12C9 11.54 9.11 11.11 9.3 10.72L8.57 10C8.22 10.58 8 11.26 8 12S8.22 13.43 8.57 14L9.3 13.29C9.11 12.89 9 12.46 9 12M13.29 14.7C12.89 14.89 12.46 15 12 15S11.11 14.89 10.72 14.7L10 15.43C10.58 15.79 11.26 16 12 16S13.43 15.79 14 15.43L13.29 14.7M16.89 8.53L16.17 9.25C16.69 10.04 17 11 17 12S16.69 13.96 16.17 14.75L16.89 15.47C17.59 14.5 18 13.3 18 12S17.59 9.5 16.89 8.53M9.25 7.83C10.04 7.31 11 7 12 7S13.96 7.31 14.75 7.83L15.47 7.11C14.5 6.42 13.3 6 12 6S9.5 6.42 8.53 7.11L9.25 7.83M14.75 16.17C13.96 16.69 13 17 12 17S10.04 16.69 9.25 16.17L8.53 16.89C9.5 17.59 10.7 18 12 18S14.5 17.59 15.47 16.89L14.75 16.17M7.83 14.75C7.31 13.96 7 13 7 12S7.31 10.04 7.83 9.25L7.11 8.53C6.42 9.5 6 10.7 6 12S6.42 14.5 7.11 15.47L7.83 14.75Z",
  open: "M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z",
  plus: "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z",
  valve: "M4 22H2V2H4M22 2H20V22H22M17.24 5.34L13.24 9.34A3 3 0 0 0 9.24 13.34L5.24 17.34L6.66 18.76L10.66 14.76A3 3 0 0 0 14.66 10.76L18.66 6.76Z",
  boiler: "M8 2C6.89 2 6 2.89 6 4V16C6 17.11 6.89 18 8 18H9V20H6V22H9C10.11 22 11 21.11 11 20V18H13V20C13 21.11 13.89 22 15 22H18V20H15V18H16C17.11 18 18 17.11 18 16V4C18 2.89 17.11 2 16 2H8M12 4.97A2 2 0 0 1 14 6.97A2 2 0 0 1 12 8.97A2 2 0 0 1 10 6.97A2 2 0 0 1 12 4.97M10 14.5H14V16H10V14.5Z",
  ev: "M19.77,7.23L19.78,7.22L16.06,3.5L15,4.56L17.11,6.67C16.17,7.03 15.5,7.93 15.5,9A2.5,2.5 0 0,0 18,11.5C18.36,11.5 18.69,11.42 19,11.29V18.5A1,1 0 0,1 18,19.5A1,1 0 0,1 17,18.5V14A2,2 0 0,0 15,12H14V5A2,2 0 0,0 12,3H6A2,2 0 0,0 4,5V21H14V13.5H15.5V18.5A2.5,2.5 0 0,0 18,21A2.5,2.5 0 0,0 20.5,18.5V9C20.5,8.31 20.22,7.68 19.77,7.23M18,10A1,1 0 0,1 17,9A1,1 0 0,1 18,8A1,1 0 0,1 19,9A1,1 0 0,1 18,10M8,18V13.5H6L10,6V11H12L8,18Z",
  power: "M7,2V13H10V22L17,10H13L17,2H7Z",
  // The battery, the unavailable cross, the sleeping "z", the controller stick, the security shield and the settings cog.
  battery:
    "M16,20H8V6H16M16.67,4H15V2H9V4H7.33A1.33,1.33 0 0,0 6,5.33V20.67C6,21.4 6.6,22 7.33,22H16.67A1.33,1.33 0 0,0 18,20.67V5.33C18,4.6 17.4,4 16.67,4M15,16H9V19H15V16Z",
  offline:
    "M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z",
  sleep: "M23,12H17V10L20.39,6H17V4H23V6L19.62,10H23V12M15,16H9V14L12.39,10H9V8H15V10L11.62,14H15V16M7,20H1V18L4.39,14H1V12H7V14L3.62,18H7V20Z",
  stick:
    "M8 15C8.55 15 9 15.45 9 16C9 16.55 8.55 17 8 17C7.45 17 7 16.55 7 16C7 15.45 7.45 15 8 15M15.07 4.69L16.5 6.1L15.07 7.5L13.66 6.1L15.07 4.69M17.9 7.5L19.31 8.93L17.9 10.34L16.5 8.93L17.9 7.5M8 13C6.34 13 5 14.34 5 16C5 17.66 6.34 19 8 19C9.66 19 11 17.66 11 16C11 14.34 9.66 13 8 13M9.77 4.33L10.5 5.08L14.29 1.29C14.47 1.11 14.72 1 15 1C15.28 1 15.53 1.11 15.71 1.29L22.78 8.36L22.78 8.37C22.92 8.54 23 8.76 23 9C23 9.3 22.87 9.57 22.66 9.76L22.66 9.76L18.93 13.5L19.67 14.23L12.95 20.95C11.68 22.22 9.93 23 8 23C4.13 23 1 19.87 1 16C1 14.07 1.78 12.32 3.05 11.05L9.77 4.33M20.59 9L15 3.41L11.93 6.5L17.5 12.08L20.59 9Z",
  cog: "M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z",
  refresh: "M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z",
  stop: "M18,18H6V6H18V18Z",
  zwave: ZWAVE,
};

const STRINGS = {
  en: {
    zwave: "Z-Wave",
    title: "Z-Wave network",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} node",
    nodes_other: "{n} nodes",
    low_battery_one: "{n} low battery",
    low_battery_other: "{n} low battery",
    issues_one: "{n} issue",
    issues_other: "{n} issues",
    alive_count: "{n} / {total} alive",
    dead_one: "{n} dead",
    dead_other: "{n} dead",
    asleep_one: "{n} asleep",
    asleep_other: "{n} asleep",
    state_dead: "Dead",
    state_asleep: "Asleep",
    state_awake: "Awake",
    state_alive: "Alive",
    status: "Status",
    controller: "Controller",
    disconnected: "Driver disconnected",
    rebuilding: "Rebuilding routes · {pct}",
    security: "Security",
    sec_none: "Not secure",
    protocol: "Protocol",
    manage: "Z-Wave JS settings",
    rebuild: "Rebuild routes",
    stop_rebuild: "Stop rebuilding",
    rebuild_title: "Rebuild the network routes?",
    rebuild_text: "Every node gets new routes to the controller. It can take several minutes; battery devices are updated when they next wake up.",
    stop_title: "Stop rebuilding the routes?",
    stop_text: "The routes already rebuilt are kept.",
    start: "Start",
    stop: "Stop",
    cancel: "Cancel",
    command_failed: "The command failed. Try again.",
    show_rebuild: "Rebuild routes button",
    no_devices: "No Z-Wave device found. Is the Z-Wave JS integration set up?",
    healthy: "Healthy",
    no_nodes: "No devices",
    unknown: "Unknown",
    battery: "Battery {pct}",
    dur_min: "{n} min",
    dur_h: "{n} h",
    dur_d: "{n} d",
    open_device: "Open device",
    close: "Close",
    node_id: "Node ID",
    vendor: "Vendor",
    product: "Product",
    firmware: "Firmware",
    rssi: "Signal",
    last_seen: "Last seen",
    zoom_in: "Show the full card",
    zoom_out: "Back to the compact view",
    ed_title: "Title",
    sort: "Sort",
    sort_name: "By name",
    sort_status: "Issues first",
    columns: "Columns",
    battery_threshold: "Low battery below (%)",
    show_title: "Show title",
    show_subtitle: "Show subtitle",
    illustration: "Illustration",
    illustration_theme: "Illustration theme",
    theme_auto: "Automatic (follows the theme)",
    theme_day: "Day",
    theme_night: "Night",
    zoom: "Detail button",
    language: "Language",
    lang_auto: "Automatic",
    show_controller: "Controller",
    show_manage: "Settings button",
  },
  fr: {
    title: "Réseau Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} nœud",
    nodes_other: "{n} nœuds",
    low_battery_one: "{n} batterie faible",
    low_battery_other: "{n} batteries faibles",
    issues_one: "{n} problème",
    issues_other: "{n} problèmes",
    alive_count: "{n} / {total} actifs",
    dead_one: "{n} mort",
    dead_other: "{n} morts",
    asleep_one: "{n} endormi",
    asleep_other: "{n} endormis",
    state_dead: "Mort",
    state_asleep: "Endormi",
    state_awake: "Éveillé",
    state_alive: "Actif",
    status: "Statut",
    controller: "Contrôleur",
    disconnected: "Pilote déconnecté",
    rebuilding: "Reconstruction des routes · {pct}",
    security: "Sécurité",
    sec_none: "Non sécurisé",
    protocol: "Protocole",
    manage: "Paramètres Z-Wave JS",
    rebuild: "Reconstruire les routes",
    stop_rebuild: "Arrêter la reconstruction",
    rebuild_title: "Reconstruire les routes du réseau ?",
    rebuild_text: "Chaque nœud reçoit de nouvelles routes vers le contrôleur. Cela peut prendre plusieurs minutes ; les appareils sur batterie sont mis à jour à leur prochain réveil.",
    stop_title: "Arrêter la reconstruction des routes ?",
    stop_text: "Les routes déjà reconstruites sont conservées.",
    start: "Lancer",
    stop: "Arrêter",
    cancel: "Annuler",
    command_failed: "La commande a échoué. Réessayez.",
    show_rebuild: "Bouton reconstruire les routes",
    no_devices: "Aucun appareil Z-Wave trouvé. L'intégration Z-Wave JS est-elle configurée ?",
    healthy: "Tout va bien",
    no_nodes: "Aucun appareil",
    unknown: "Inconnu",
    battery: "Batterie {pct}",
    dur_min: "{n} min",
    dur_h: "{n} h",
    dur_d: "{n} j",
    open_device: "Ouvrir l'appareil",
    close: "Fermer",
    node_id: "ID du nœud",
    vendor: "Fabricant",
    product: "Produit",
    firmware: "Firmware",
    rssi: "Signal",
    last_seen: "Vu pour la dernière fois",
    zoom_in: "Afficher la carte complète",
    zoom_out: "Revenir à la vue compacte",
    ed_title: "Titre",
    sort: "Tri",
    sort_name: "Par nom",
    sort_status: "Problèmes d'abord",
    columns: "Colonnes",
    battery_threshold: "Batterie faible sous (%)",
    show_title: "Afficher le titre",
    show_subtitle: "Afficher le sous-titre",
    illustration: "Illustration",
    illustration_theme: "Thème de l'illustration",
    theme_auto: "Automatique (suit le thème)",
    theme_day: "Jour",
    theme_night: "Nuit",
    zoom: "Bouton de détail",
    language: "Langue",
    lang_auto: "Automatique",
    show_controller: "Contrôleur",
    show_manage: "Bouton paramètres",
  },
  de: {
    title: "Z-Wave-Netzwerk",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} Knoten",
    nodes_other: "{n} Knoten",
    low_battery_one: "{n} Batterie schwach",
    low_battery_other: "{n} Batterien schwach",
    issues_one: "{n} Problem",
    issues_other: "{n} Probleme",
    alive_count: "{n} / {total} aktiv",
    dead_one: "{n} tot",
    dead_other: "{n} tot",
    asleep_one: "{n} schlafend",
    asleep_other: "{n} schlafend",
    state_dead: "Tot",
    state_asleep: "Schlafend",
    state_awake: "Wach",
    state_alive: "Aktiv",
    status: "Status",
    controller: "Controller",
    disconnected: "Treiber getrennt",
    rebuilding: "Routen werden neu aufgebaut · {pct}",
    security: "Sicherheit",
    sec_none: "Nicht gesichert",
    protocol: "Protokoll",
    manage: "Z-Wave-JS-Einstellungen",
    rebuild: "Routen neu aufbauen",
    stop_rebuild: "Neuaufbau stoppen",
    rebuild_title: "Netzwerkrouten neu aufbauen?",
    rebuild_text: "Jeder Knoten erhält neue Routen zum Controller. Das kann mehrere Minuten dauern; batteriebetriebene Geräte werden beim nächsten Aufwachen aktualisiert.",
    stop_title: "Neuaufbau der Routen stoppen?",
    stop_text: "Bereits neu aufgebaute Routen bleiben erhalten.",
    start: "Starten",
    stop: "Stoppen",
    cancel: "Abbrechen",
    command_failed: "Der Befehl ist fehlgeschlagen. Versuche es erneut.",
    show_rebuild: "Schaltfläche Routen neu aufbauen",
    no_devices: "Kein Z-Wave-Gerät gefunden. Ist die Z-Wave JS-Integration eingerichtet?",
    healthy: "Alles in Ordnung",
    no_nodes: "Keine Geräte",
    unknown: "Unbekannt",
    battery: "Batterie {pct}",
    dur_min: "{n} Min.",
    dur_h: "{n} Std.",
    dur_d: "{n} T.",
    open_device: "Gerät öffnen",
    close: "Schließen",
    node_id: "Knoten-ID",
    vendor: "Hersteller",
    product: "Produkt",
    firmware: "Firmware",
    rssi: "Signal",
    last_seen: "Zuletzt gesehen",
    zoom_in: "Vollständige Karte anzeigen",
    zoom_out: "Zurück zur kompakten Ansicht",
    ed_title: "Titel",
    sort: "Sortierung",
    sort_name: "Nach Name",
    sort_status: "Probleme zuerst",
    columns: "Spalten",
    battery_threshold: "Batterie schwach unter (%)",
    show_title: "Titel anzeigen",
    show_subtitle: "Untertitel anzeigen",
    illustration: "Illustration",
    illustration_theme: "Illustrationsthema",
    theme_auto: "Automatisch (folgt dem Thema)",
    theme_day: "Tag",
    theme_night: "Nacht",
    zoom: "Detail-Schaltfläche",
    language: "Sprache",
    lang_auto: "Automatisch",
    show_controller: "Controller",
    show_manage: "Schaltfläche Einstellungen",
  },
  es: {
    title: "Red Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} nodo",
    nodes_other: "{n} nodos",
    low_battery_one: "{n} batería baja",
    low_battery_other: "{n} baterías bajas",
    issues_one: "{n} problema",
    issues_other: "{n} problemas",
    alive_count: "{n} / {total} activos",
    dead_one: "{n} muerto",
    dead_other: "{n} muertos",
    asleep_one: "{n} dormido",
    asleep_other: "{n} dormidos",
    state_dead: "Muerto",
    state_asleep: "Dormido",
    state_awake: "Despierto",
    state_alive: "Activo",
    status: "Estado",
    controller: "Controlador",
    disconnected: "Driver desconectado",
    rebuilding: "Reconstruyendo rutas · {pct}",
    security: "Seguridad",
    sec_none: "No seguro",
    protocol: "Protocolo",
    manage: "Ajustes de Z-Wave JS",
    rebuild: "Reconstruir rutas",
    stop_rebuild: "Detener la reconstrucción",
    rebuild_title: "¿Reconstruir las rutas de la red?",
    rebuild_text: "Cada nodo recibe nuevas rutas hacia el controlador. Puede tardar varios minutos; los dispositivos a batería se actualizan cuando vuelven a despertar.",
    stop_title: "¿Detener la reconstrucción de rutas?",
    stop_text: "Las rutas ya reconstruidas se conservan.",
    start: "Iniciar",
    stop: "Detener",
    cancel: "Cancelar",
    command_failed: "El comando ha fallado. Inténtalo de nuevo.",
    show_rebuild: "Botón de reconstruir rutas",
    no_devices: "No se encontró ningún dispositivo Z-Wave. ¿Está configurada la integración Z-Wave JS?",
    healthy: "Todo bien",
    no_nodes: "Sin dispositivos",
    unknown: "Desconocido",
    battery: "Batería {pct}",
    dur_min: "{n} min",
    dur_h: "{n} h",
    dur_d: "{n} d",
    open_device: "Abrir dispositivo",
    close: "Cerrar",
    node_id: "ID del nodo",
    vendor: "Fabricante",
    product: "Producto",
    firmware: "Firmware",
    rssi: "Señal",
    last_seen: "Visto por última vez",
    zoom_in: "Mostrar la tarjeta completa",
    zoom_out: "Volver a la vista compacta",
    ed_title: "Título",
    sort: "Orden",
    sort_name: "Por nombre",
    sort_status: "Problemas primero",
    columns: "Columnas",
    battery_threshold: "Batería baja por debajo de (%)",
    show_title: "Mostrar el título",
    show_subtitle: "Mostrar el subtítulo",
    illustration: "Ilustración",
    illustration_theme: "Tema de la ilustración",
    theme_auto: "Automático (sigue el tema)",
    theme_day: "Día",
    theme_night: "Noche",
    zoom: "Botón de detalle",
    language: "Idioma",
    lang_auto: "Automático",
    show_controller: "Controlador",
    show_manage: "Botón de ajustes",
  },
  sr: {
    title: "Z-Wave мрежа",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} чвор",
    nodes_few: "{n} чвора",
    nodes_other: "{n} чворова",
    low_battery_one: "Слаба батерија: {n}",
    low_battery_other: "Слаба батерија: {n}",
    issues_one: "{n} проблем",
    issues_few: "{n} проблема",
    issues_other: "{n} проблема",
    alive_count: "Активни: {n} / {total}",
    dead_other: "Мртви: {n}",
    asleep_other: "Успавани: {n}",
    state_dead: "Мртав",
    state_asleep: "Спава",
    state_awake: "Будан",
    state_alive: "Активан",
    status: "Стање",
    controller: "Контролер",
    disconnected: "Драјвер прекинут",
    rebuilding: "Обнова рута · {pct}",
    security: "Безбедност",
    sec_none: "Незаштићено",
    protocol: "Протокол",
    manage: "Подешавања Z-Wave JS",
    rebuild: "Обнови руте",
    stop_rebuild: "Заустави обнову",
    rebuild_title: "Обновити руте мреже?",
    rebuild_text: "Сваки чвор добија нове руте до контролера. То може трајати неколико минута; уређаји на батерије се ажурирају при следећем буђењу.",
    stop_title: "Зауставити обнову рута?",
    stop_text: "Већ обновљене руте се задржавају.",
    start: "Покрени",
    stop: "Заустави",
    cancel: "Откажи",
    command_failed: "Команда није успела. Покушајте поново.",
    show_rebuild: "Дугме за обнову рута",
    no_devices: "Није пронађен ниједан Z-Wave уређај. Да ли је Z-Wave JS интеграција подешена?",
    healthy: "Све је у реду",
    no_nodes: "Нема уређаја",
    unknown: "Непознато",
    battery: "Батерија {pct}",
    dur_min: "{n} мин",
    dur_h: "{n} ч",
    dur_d: "{n} д",
    open_device: "Отвори уређај",
    close: "Затвори",
    node_id: "ID чвора",
    vendor: "Произвођач",
    product: "Производ",
    firmware: "Фирмвер",
    rssi: "Сигнал",
    last_seen: "Последњи пут виђен",
    zoom_in: "Прикажи целу картицу",
    zoom_out: "Назад на сажети приказ",
    ed_title: "Наслов",
    sort: "Редослед",
    sort_name: "По имену",
    sort_status: "Прво проблеми",
    columns: "Колоне",
    battery_threshold: "Слаба батерија испод (%)",
    show_title: "Прикажи наслов",
    show_subtitle: "Прикажи поднаслов",
    illustration: "Илустрација",
    illustration_theme: "Тема илустрације",
    theme_auto: "Аутоматски (прати тему)",
    theme_day: "Дан",
    theme_night: "Ноћ",
    zoom: "Дугме за детаље",
    language: "Језик",
    lang_auto: "Аутоматски",
    show_controller: "Контролер",
    show_manage: "Дугме за подешавања",
  },
  "sr-Latn": {
    title: "Z-Wave mreža",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} čvor",
    nodes_few: "{n} čvora",
    nodes_other: "{n} čvorova",
    low_battery_one: "Slaba baterija: {n}",
    low_battery_other: "Slaba baterija: {n}",
    issues_one: "{n} problem",
    issues_few: "{n} problema",
    issues_other: "{n} problema",
    alive_count: "Aktivni: {n} / {total}",
    dead_other: "Mrtvi: {n}",
    asleep_other: "Uspavani: {n}",
    state_dead: "Mrtav",
    state_asleep: "Spava",
    state_awake: "Budan",
    state_alive: "Aktivan",
    status: "Stanje",
    controller: "Kontroler",
    disconnected: "Drajver prekinut",
    rebuilding: "Obnova ruta · {pct}",
    security: "Bezbednost",
    sec_none: "Nezaštićeno",
    protocol: "Protokol",
    manage: "Podešavanja Z-Wave JS",
    rebuild: "Obnovi rute",
    stop_rebuild: "Zaustavi obnovu",
    rebuild_title: "Obnoviti rute mreže?",
    rebuild_text: "Svaki čvor dobija nove rute do kontrolera. To može trajati nekoliko minuta; uređaji na baterije se ažuriraju pri sledećem buđenju.",
    stop_title: "Zaustaviti obnovu ruta?",
    stop_text: "Već obnovljene rute se zadržavaju.",
    start: "Pokreni",
    stop: "Zaustavi",
    cancel: "Otkaži",
    command_failed: "Komanda nije uspela. Pokušajte ponovo.",
    show_rebuild: "Dugme za obnovu ruta",
    no_devices: "Nije pronađen nijedan Z-Wave uređaj. Da li je Z-Wave JS integracija podešena?",
    healthy: "Sve je u redu",
    no_nodes: "Nema uređaja",
    unknown: "Nepoznato",
    battery: "Baterija {pct}",
    dur_min: "{n} min",
    dur_h: "{n} č",
    dur_d: "{n} d",
    open_device: "Otvori uređaj",
    close: "Zatvori",
    node_id: "ID čvora",
    vendor: "Proizvođač",
    product: "Proizvod",
    firmware: "Firmver",
    rssi: "Signal",
    last_seen: "Poslednji put viđen",
    zoom_in: "Prikaži celu karticu",
    zoom_out: "Nazad na sažeti prikaz",
    ed_title: "Naslov",
    sort: "Redosled",
    sort_name: "Po imenu",
    sort_status: "Prvo problemi",
    columns: "Kolone",
    battery_threshold: "Slaba baterija ispod (%)",
    show_title: "Prikaži naslov",
    show_subtitle: "Prikaži podnaslov",
    illustration: "Ilustracija",
    illustration_theme: "Tema ilustracije",
    theme_auto: "Automatski (prati temu)",
    theme_day: "Dan",
    theme_night: "Noć",
    zoom: "Dugme za detalje",
    language: "Jezik",
    lang_auto: "Automatski",
    show_controller: "Kontroler",
    show_manage: "Dugme za podešavanja",
  },
  it: {
    title: "Rete Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} nodo",
    nodes_other: "{n} nodi",
    low_battery_one: "{n} batteria scarica",
    low_battery_other: "{n} batterie scariche",
    issues_one: "{n} problema",
    issues_other: "{n} problemi",
    alive_count: "{n} / {total} attivi",
    dead_one: "{n} morto",
    dead_other: "{n} morti",
    asleep_one: "{n} addormentato",
    asleep_other: "{n} addormentati",
    state_dead: "Morto",
    state_asleep: "Addormentato",
    state_awake: "Sveglio",
    state_alive: "Attivo",
    status: "Stato",
    controller: "Controller",
    disconnected: "Driver disconnesso",
    rebuilding: "Ricostruzione dei percorsi · {pct}",
    security: "Sicurezza",
    sec_none: "Non protetto",
    protocol: "Protocollo",
    manage: "Impostazioni Z-Wave JS",
    rebuild: "Ricostruisci percorsi",
    stop_rebuild: "Interrompi la ricostruzione",
    rebuild_title: "Ricostruire i percorsi della rete?",
    rebuild_text: "Ogni nodo riceve nuovi percorsi verso il controller. Può richiedere diversi minuti; i dispositivi a batteria vengono aggiornati al loro prossimo risveglio.",
    stop_title: "Interrompere la ricostruzione dei percorsi?",
    stop_text: "I percorsi già ricostruiti vengono mantenuti.",
    start: "Avvia",
    stop: "Interrompi",
    cancel: "Annulla",
    command_failed: "Il comando non è riuscito. Riprova.",
    show_rebuild: "Pulsante ricostruisci percorsi",
    no_devices: "Nessun dispositivo Z-Wave trovato. L'integrazione Z-Wave JS è configurata?",
    healthy: "Tutto ok",
    no_nodes: "Nessun dispositivo",
    unknown: "Sconosciuto",
    battery: "Batteria {pct}",
    dur_min: "{n} min",
    dur_h: "{n} h",
    dur_d: "{n} g",
    open_device: "Apri dispositivo",
    close: "Chiudi",
    node_id: "ID nodo",
    vendor: "Produttore",
    product: "Prodotto",
    firmware: "Firmware",
    rssi: "Segnale",
    last_seen: "Visto l'ultima volta",
    zoom_in: "Mostra la scheda completa",
    zoom_out: "Torna alla vista compatta",
    ed_title: "Titolo",
    sort: "Ordinamento",
    sort_name: "Per nome",
    sort_status: "Prima i problemi",
    columns: "Colonne",
    battery_threshold: "Batteria scarica sotto (%)",
    show_title: "Mostra il titolo",
    show_subtitle: "Mostra il sottotitolo",
    illustration: "Illustrazione",
    illustration_theme: "Tema dell'illustrazione",
    theme_auto: "Automatico (segue il tema)",
    theme_day: "Giorno",
    theme_night: "Notte",
    zoom: "Pulsante dettagli",
    language: "Lingua",
    lang_auto: "Automatica",
    show_controller: "Controller",
    show_manage: "Pulsante impostazioni",
  },
  nl: {
    title: "Z-Wave-netwerk",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} node",
    nodes_other: "{n} nodes",
    low_battery_one: "{n} batterij bijna leeg",
    low_battery_other: "{n} batterijen bijna leeg",
    issues_one: "{n} probleem",
    issues_other: "{n} problemen",
    alive_count: "{n} / {total} actief",
    dead_one: "{n} dood",
    dead_other: "{n} dood",
    asleep_one: "{n} slapend",
    asleep_other: "{n} slapend",
    state_dead: "Dood",
    state_asleep: "Slapend",
    state_awake: "Wakker",
    state_alive: "Actief",
    status: "Status",
    controller: "Controller",
    disconnected: "Driver verbroken",
    rebuilding: "Routes opnieuw opbouwen · {pct}",
    security: "Beveiliging",
    sec_none: "Niet beveiligd",
    protocol: "Protocol",
    manage: "Z-Wave JS-instellingen",
    rebuild: "Routes opnieuw opbouwen",
    stop_rebuild: "Opbouwen stoppen",
    rebuild_title: "Netwerkroutes opnieuw opbouwen?",
    rebuild_text: "Elk knooppunt krijgt nieuwe routes naar de controller. Dit kan enkele minuten duren; apparaten op batterij worden bijgewerkt wanneer ze weer ontwaken.",
    stop_title: "Opnieuw opbouwen van routes stoppen?",
    stop_text: "Routes die al opnieuw zijn opgebouwd blijven behouden.",
    start: "Starten",
    stop: "Stoppen",
    cancel: "Annuleren",
    command_failed: "De opdracht is mislukt. Probeer het opnieuw.",
    show_rebuild: "Knop routes opnieuw opbouwen",
    no_devices: "Geen Z-Wave-apparaat gevonden. Is de Z-Wave JS-integratie ingesteld?",
    healthy: "Alles in orde",
    no_nodes: "Geen apparaten",
    unknown: "Onbekend",
    battery: "Batterij {pct}",
    dur_min: "{n} min",
    dur_h: "{n} u",
    dur_d: "{n} d",
    open_device: "Apparaat openen",
    close: "Sluiten",
    node_id: "Node-ID",
    vendor: "Fabrikant",
    product: "Product",
    firmware: "Firmware",
    rssi: "Signaal",
    last_seen: "Laatst gezien",
    zoom_in: "Volledige kaart tonen",
    zoom_out: "Terug naar de compacte weergave",
    ed_title: "Titel",
    sort: "Sortering",
    sort_name: "Op naam",
    sort_status: "Problemen eerst",
    columns: "Kolommen",
    battery_threshold: "Batterij bijna leeg onder (%)",
    show_title: "Titel tonen",
    show_subtitle: "Ondertitel tonen",
    illustration: "Illustratie",
    illustration_theme: "Thema van de illustratie",
    theme_auto: "Automatisch (volgt het thema)",
    theme_day: "Dag",
    theme_night: "Nacht",
    zoom: "Detailknop",
    language: "Taal",
    lang_auto: "Automatisch",
    show_controller: "Controller",
    show_manage: "Knop instellingen",
  },
  pt: {
    title: "Rede Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} nó",
    nodes_other: "{n} nós",
    low_battery_one: "{n} bateria fraca",
    low_battery_other: "{n} baterias fracas",
    issues_one: "{n} problema",
    issues_other: "{n} problemas",
    alive_count: "{n} / {total} ativos",
    dead_one: "{n} morto",
    dead_other: "{n} mortos",
    asleep_one: "{n} adormecido",
    asleep_other: "{n} adormecidos",
    state_dead: "Morto",
    state_asleep: "Adormecido",
    state_awake: "Acordado",
    state_alive: "Ativo",
    status: "Estado",
    controller: "Controlador",
    disconnected: "Driver desligado",
    rebuilding: "A reconstruir rotas · {pct}",
    security: "Segurança",
    sec_none: "Não seguro",
    protocol: "Protocolo",
    manage: "Definições do Z-Wave JS",
    rebuild: "Reconstruir rotas",
    stop_rebuild: "Parar a reconstrução",
    rebuild_title: "Reconstruir as rotas da rede?",
    rebuild_text: "Cada nó recebe novas rotas para o controlador. Pode demorar vários minutos; os dispositivos a bateria são atualizados quando voltarem a acordar.",
    stop_title: "Parar a reconstrução das rotas?",
    stop_text: "As rotas já reconstruídas são mantidas.",
    start: "Iniciar",
    stop: "Parar",
    cancel: "Cancelar",
    command_failed: "O comando falhou. Tente novamente.",
    show_rebuild: "Botão de reconstruir rotas",
    no_devices: "Nenhum dispositivo Z-Wave encontrado. A integração Z-Wave JS está configurada?",
    healthy: "Tudo bem",
    no_nodes: "Sem dispositivos",
    unknown: "Desconhecido",
    battery: "Bateria {pct}",
    dur_min: "{n} min",
    dur_h: "{n} h",
    dur_d: "{n} d",
    open_device: "Abrir dispositivo",
    close: "Fechar",
    node_id: "ID do nó",
    vendor: "Fabricante",
    product: "Produto",
    firmware: "Firmware",
    rssi: "Sinal",
    last_seen: "Visto pela última vez",
    zoom_in: "Mostrar o cartão completo",
    zoom_out: "Voltar à vista compacta",
    ed_title: "Título",
    sort: "Ordenação",
    sort_name: "Por nome",
    sort_status: "Problemas primeiro",
    columns: "Colunas",
    battery_threshold: "Bateria fraca abaixo de (%)",
    show_title: "Mostrar o título",
    show_subtitle: "Mostrar o subtítulo",
    illustration: "Ilustração",
    illustration_theme: "Tema da ilustração",
    theme_auto: "Automático (segue o tema)",
    theme_day: "Dia",
    theme_night: "Noite",
    zoom: "Botão de detalhe",
    language: "Idioma",
    lang_auto: "Automático",
    show_controller: "Controlador",
    show_manage: "Botão de definições",
  },
  pl: {
    title: "Sieć Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} węzeł",
    nodes_few: "{n} węzły",
    nodes_many: "{n} węzłów",
    nodes_other: "{n} węzła",
    low_battery_one: "Słaba bateria: {n}",
    low_battery_other: "Słaba bateria: {n}",
    issues_one: "{n} problem",
    issues_few: "{n} problemy",
    issues_many: "{n} problemów",
    issues_other: "{n} problemu",
    alive_count: "Aktywne: {n} / {total}",
    dead_other: "Martwe: {n}",
    asleep_other: "Uśpione: {n}",
    state_dead: "Martwy",
    state_asleep: "Uśpiony",
    state_awake: "Wybudzony",
    state_alive: "Aktywny",
    status: "Status",
    controller: "Kontroler",
    disconnected: "Sterownik rozłączony",
    rebuilding: "Odbudowa tras · {pct}",
    security: "Zabezpieczenia",
    sec_none: "Niezabezpieczone",
    protocol: "Protokół",
    manage: "Ustawienia Z-Wave JS",
    rebuild: "Odbuduj trasy",
    stop_rebuild: "Zatrzymaj odbudowę",
    rebuild_title: "Odbudować trasy sieci?",
    rebuild_text: "Każdy węzeł otrzymuje nowe trasy do kontrolera. Może to potrwać kilka minut; urządzenia bateryjne zostaną zaktualizowane przy najbliższym wybudzeniu.",
    stop_title: "Zatrzymać odbudowę tras?",
    stop_text: "Już odbudowane trasy zostaną zachowane.",
    start: "Rozpocznij",
    stop: "Zatrzymaj",
    cancel: "Anuluj",
    command_failed: "Polecenie nie powiodło się. Spróbuj ponownie.",
    show_rebuild: "Przycisk odbudowy tras",
    no_devices: "Nie znaleziono urządzeń Z-Wave. Czy integracja Z-Wave JS jest skonfigurowana?",
    healthy: "Wszystko w porządku",
    no_nodes: "Brak urządzeń",
    unknown: "Nieznany",
    battery: "Bateria {pct}",
    dur_min: "{n} min",
    dur_h: "{n} godz.",
    dur_d: "{n} d",
    open_device: "Otwórz urządzenie",
    close: "Zamknij",
    node_id: "ID węzła",
    vendor: "Producent",
    product: "Produkt",
    firmware: "Oprogramowanie",
    rssi: "Sygnał",
    last_seen: "Ostatnio widziany",
    zoom_in: "Pokaż pełną kartę",
    zoom_out: "Wróć do widoku kompaktowego",
    ed_title: "Tytuł",
    sort: "Sortowanie",
    sort_name: "Według nazwy",
    sort_status: "Najpierw problemy",
    columns: "Kolumny",
    battery_threshold: "Słaba bateria poniżej (%)",
    show_title: "Pokaż tytuł",
    show_subtitle: "Pokaż podtytuł",
    illustration: "Ilustracja",
    illustration_theme: "Motyw ilustracji",
    theme_auto: "Automatycznie (według motywu)",
    theme_day: "Dzień",
    theme_night: "Noc",
    zoom: "Przycisk szczegółów",
    language: "Język",
    lang_auto: "Automatyczny",
    show_controller: "Kontroler",
    show_manage: "Przycisk ustawień",
  },
  ro: {
    title: "Rețea Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} nod",
    nodes_few: "{n} noduri",
    nodes_other: "{n} de noduri",
    low_battery_one: "{n} baterie descărcată",
    low_battery_few: "{n} baterii descărcate",
    low_battery_other: "{n} de baterii descărcate",
    issues_one: "{n} problemă",
    issues_few: "{n} probleme",
    issues_other: "{n} de probleme",
    alive_count: "Active: {n} / {total}",
    dead_other: "Moarte: {n}",
    asleep_other: "În repaus: {n}",
    state_dead: "Mort",
    state_asleep: "În repaus",
    state_awake: "Treaz",
    state_alive: "Activ",
    status: "Stare",
    controller: "Controler",
    disconnected: "Driver deconectat",
    rebuilding: "Reconstruire rute · {pct}",
    security: "Securitate",
    sec_none: "Nesecurizat",
    protocol: "Protocol",
    manage: "Setări Z-Wave JS",
    rebuild: "Reconstruiește rutele",
    stop_rebuild: "Oprește reconstruirea",
    rebuild_title: "Reconstruiești rutele rețelei?",
    rebuild_text: "Fiecare nod primește rute noi către controler. Poate dura câteva minute; dispozitivele pe baterie sunt actualizate la următoarea trezire.",
    stop_title: "Oprești reconstruirea rutelor?",
    stop_text: "Rutele deja reconstruite se păstrează.",
    start: "Pornește",
    stop: "Oprește",
    cancel: "Anulează",
    command_failed: "Comanda a eșuat. Încearcă din nou.",
    show_rebuild: "Buton reconstruire rute",
    no_devices: "Niciun dispozitiv Z-Wave găsit. Este configurată integrarea Z-Wave JS?",
    healthy: "Totul e în regulă",
    no_nodes: "Niciun dispozitiv",
    unknown: "Necunoscut",
    battery: "Baterie {pct}",
    dur_min: "{n} min",
    dur_h: "{n} h",
    dur_d: "{n} z",
    open_device: "Deschide dispozitivul",
    close: "Închide",
    node_id: "ID nod",
    vendor: "Producător",
    product: "Produs",
    firmware: "Firmware",
    rssi: "Semnal",
    last_seen: "Văzut ultima dată",
    zoom_in: "Afișează cardul complet",
    zoom_out: "Înapoi la vizualizarea compactă",
    ed_title: "Titlu",
    sort: "Sortare",
    sort_name: "După nume",
    sort_status: "Întâi problemele",
    columns: "Coloane",
    battery_threshold: "Baterie descărcată sub (%)",
    show_title: "Afișează titlul",
    show_subtitle: "Afișează subtitlul",
    illustration: "Ilustrație",
    illustration_theme: "Tema ilustrației",
    theme_auto: "Automat (urmează tema)",
    theme_day: "Zi",
    theme_night: "Noapte",
    zoom: "Buton de detalii",
    language: "Limbă",
    lang_auto: "Automat",
    show_controller: "Controler",
    show_manage: "Buton setări",
  },
  da: {
    title: "Z-Wave-netværk",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} node",
    nodes_other: "{n} noder",
    low_battery_one: "{n} lavt batteri",
    low_battery_other: "{n} lave batterier",
    issues_one: "{n} problem",
    issues_other: "{n} problemer",
    alive_count: "{n} / {total} aktive",
    dead_one: "{n} død",
    dead_other: "{n} døde",
    asleep_one: "{n} sovende",
    asleep_other: "{n} sovende",
    state_dead: "Død",
    state_asleep: "Sover",
    state_awake: "Vågen",
    state_alive: "Aktiv",
    status: "Status",
    controller: "Controller",
    disconnected: "Driver afbrudt",
    rebuilding: "Genopbygger ruter · {pct}",
    security: "Sikkerhed",
    sec_none: "Ikke sikret",
    protocol: "Protokol",
    manage: "Z-Wave JS-indstillinger",
    rebuild: "Genopbyg ruter",
    stop_rebuild: "Stop genopbygning",
    rebuild_title: "Genopbyg netværkets ruter?",
    rebuild_text: "Hver node får nye ruter til controlleren. Det kan tage flere minutter; batteridrevne enheder opdateres, når de vågner næste gang.",
    stop_title: "Stop genopbygningen af ruter?",
    stop_text: "Ruter, der allerede er genopbygget, bevares.",
    start: "Start",
    stop: "Stop",
    cancel: "Annuller",
    command_failed: "Kommandoen mislykkedes. Prøv igen.",
    show_rebuild: "Knap til genopbygning af ruter",
    no_devices: "Ingen Z-Wave-enhed fundet. Er Z-Wave JS-integrationen sat op?",
    healthy: "Alt i orden",
    no_nodes: "Ingen enheder",
    unknown: "Ukendt",
    battery: "Batteri {pct}",
    dur_min: "{n} min",
    dur_h: "{n} t",
    dur_d: "{n} d",
    open_device: "Åbn enhed",
    close: "Luk",
    node_id: "Node-ID",
    vendor: "Producent",
    product: "Produkt",
    firmware: "Firmware",
    rssi: "Signal",
    last_seen: "Sidst set",
    zoom_in: "Vis hele kortet",
    zoom_out: "Tilbage til den kompakte visning",
    ed_title: "Titel",
    sort: "Sortering",
    sort_name: "Efter navn",
    sort_status: "Problemer først",
    columns: "Kolonner",
    battery_threshold: "Lavt batteri under (%)",
    show_title: "Vis titel",
    show_subtitle: "Vis undertitel",
    illustration: "Illustration",
    illustration_theme: "Illustrationstema",
    theme_auto: "Automatisk (følger temaet)",
    theme_day: "Dag",
    theme_night: "Nat",
    zoom: "Detaljeknap",
    language: "Sprog",
    lang_auto: "Automatisk",
    show_controller: "Controller",
    show_manage: "Knap til indstillinger",
  },
  sv: {
    title: "Z-Wave-nätverk",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} nod",
    nodes_other: "{n} noder",
    low_battery_one: "{n} lågt batteri",
    low_battery_other: "{n} låga batterier",
    issues_one: "{n} problem",
    issues_other: "{n} problem",
    alive_count: "{n} / {total} aktiva",
    dead_one: "{n} död",
    dead_other: "{n} döda",
    asleep_one: "{n} sovande",
    asleep_other: "{n} sovande",
    state_dead: "Död",
    state_asleep: "Sover",
    state_awake: "Vaken",
    state_alive: "Aktiv",
    status: "Status",
    controller: "Styrenhet",
    disconnected: "Drivrutin frånkopplad",
    rebuilding: "Bygger om rutter · {pct}",
    security: "Säkerhet",
    sec_none: "Osäkrad",
    protocol: "Protokoll",
    manage: "Z-Wave JS-inställningar",
    rebuild: "Bygg om rutter",
    stop_rebuild: "Stoppa ombyggnaden",
    rebuild_title: "Bygga om nätverkets rutter?",
    rebuild_text: "Varje nod får nya rutter till styrenheten. Det kan ta flera minuter; batteridrivna enheter uppdateras när de vaknar nästa gång.",
    stop_title: "Stoppa ombyggnaden av rutter?",
    stop_text: "Rutter som redan byggts om behålls.",
    start: "Starta",
    stop: "Stoppa",
    cancel: "Avbryt",
    command_failed: "Kommandot misslyckades. Försök igen.",
    show_rebuild: "Knapp för att bygga om rutter",
    no_devices: "Ingen Z-Wave-enhet hittades. Är Z-Wave JS-integrationen konfigurerad?",
    healthy: "Allt i ordning",
    no_nodes: "Inga enheter",
    unknown: "Okänd",
    battery: "Batteri {pct}",
    dur_min: "{n} min",
    dur_h: "{n} h",
    dur_d: "{n} d",
    open_device: "Öppna enhet",
    close: "Stäng",
    node_id: "Nod-ID",
    vendor: "Tillverkare",
    product: "Produkt",
    firmware: "Firmware",
    rssi: "Signal",
    last_seen: "Senast sedd",
    zoom_in: "Visa hela kortet",
    zoom_out: "Tillbaka till kompakt vy",
    ed_title: "Titel",
    sort: "Sortering",
    sort_name: "Efter namn",
    sort_status: "Problem först",
    columns: "Kolumner",
    battery_threshold: "Lågt batteri under (%)",
    show_title: "Visa titel",
    show_subtitle: "Visa undertitel",
    illustration: "Illustration",
    illustration_theme: "Illustrationstema",
    theme_auto: "Automatiskt (följer temat)",
    theme_day: "Dag",
    theme_night: "Natt",
    zoom: "Detaljknapp",
    language: "Språk",
    lang_auto: "Automatiskt",
    show_controller: "Styrenhet",
    show_manage: "Knapp för inställningar",
  },
  bg: {
    title: "Мрежа Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} възел",
    nodes_other: "{n} възела",
    low_battery_one: "{n} слаба батерия",
    low_battery_other: "{n} слаби батерии",
    issues_one: "{n} проблем",
    issues_other: "{n} проблема",
    alive_count: "Активни: {n} / {total}",
    dead_other: "Мъртви: {n}",
    asleep_other: "Спящи: {n}",
    state_dead: "Мъртъв",
    state_asleep: "Спящ",
    state_awake: "Буден",
    state_alive: "Активен",
    status: "Състояние",
    controller: "Контролер",
    disconnected: "Драйверът е прекъснат",
    rebuilding: "Възстановяване на маршрутите · {pct}",
    security: "Сигурност",
    sec_none: "Незащитено",
    protocol: "Протокол",
    manage: "Настройки на Z-Wave JS",
    rebuild: "Възстанови маршрутите",
    stop_rebuild: "Спри възстановяването",
    rebuild_title: "Да се възстановят ли маршрутите на мрежата?",
    rebuild_text: "Всеки възел получава нови маршрути до контролера. Това може да отнеме няколко минути; устройствата на батерии се обновяват при следващото им събуждане.",
    stop_title: "Да се спре ли възстановяването на маршрутите?",
    stop_text: "Вече възстановените маршрути се запазват.",
    start: "Старт",
    stop: "Спри",
    cancel: "Отказ",
    command_failed: "Командата не бе изпълнена. Опитайте отново.",
    show_rebuild: "Бутон за възстановяване на маршрутите",
    no_devices: "Не е намерено Z-Wave устройство. Настроена ли е интеграцията Z-Wave JS?",
    healthy: "Всичко е наред",
    no_nodes: "Няма устройства",
    unknown: "Неизвестно",
    battery: "Батерия {pct}",
    dur_min: "{n} мин",
    dur_h: "{n} ч",
    dur_d: "{n} д",
    open_device: "Отваряне на устройството",
    close: "Затваряне",
    node_id: "ID на възела",
    vendor: "Производител",
    product: "Продукт",
    firmware: "Фърмуер",
    rssi: "Сигнал",
    last_seen: "Последно видян",
    zoom_in: "Показване на цялата карта",
    zoom_out: "Обратно към компактния изглед",
    ed_title: "Заглавие",
    sort: "Подреждане",
    sort_name: "По име",
    sort_status: "Първо проблемите",
    columns: "Колони",
    battery_threshold: "Слаба батерия под (%)",
    show_title: "Покажи заглавието",
    show_subtitle: "Покажи подзаглавието",
    illustration: "Илюстрация",
    illustration_theme: "Тема на илюстрацията",
    theme_auto: "Автоматично (следва темата)",
    theme_day: "Ден",
    theme_night: "Нощ",
    zoom: "Бутон за детайли",
    language: "Език",
    lang_auto: "Автоматично",
    show_controller: "Контролер",
    show_manage: "Бутон за настройки",
  },
  ru: {
    title: "Сеть Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} узел",
    nodes_few: "{n} узла",
    nodes_many: "{n} узлов",
    nodes_other: "{n} узла",
    low_battery_one: "Низкий заряд: {n}",
    low_battery_other: "Низкий заряд: {n}",
    issues_one: "{n} проблема",
    issues_few: "{n} проблемы",
    issues_many: "{n} проблем",
    issues_other: "{n} проблемы",
    alive_count: "Активны: {n} / {total}",
    dead_other: "Мёртвые: {n}",
    asleep_other: "Спящие: {n}",
    state_dead: "Мёртв",
    state_asleep: "Спит",
    state_awake: "Бодрствует",
    state_alive: "Активен",
    status: "Состояние",
    controller: "Контроллер",
    disconnected: "Драйвер отключён",
    rebuilding: "Перестроение маршрутов · {pct}",
    security: "Безопасность",
    sec_none: "Без защиты",
    protocol: "Протокол",
    manage: "Настройки Z-Wave JS",
    rebuild: "Перестроить маршруты",
    stop_rebuild: "Остановить перестроение",
    rebuild_title: "Перестроить маршруты сети?",
    rebuild_text: "Каждый узел получит новые маршруты к контроллеру. Это может занять несколько минут; устройства на батарейках обновятся при следующем пробуждении.",
    stop_title: "Остановить перестроение маршрутов?",
    stop_text: "Уже перестроенные маршруты сохранятся.",
    start: "Запустить",
    stop: "Остановить",
    cancel: "Отмена",
    command_failed: "Команда не выполнена. Повторите попытку.",
    show_rebuild: "Кнопка перестроения маршрутов",
    no_devices: "Устройства Z-Wave не найдены. Настроена ли интеграция Z-Wave JS?",
    healthy: "Всё в порядке",
    no_nodes: "Нет устройств",
    unknown: "Неизвестно",
    battery: "Батарея {pct}",
    dur_min: "{n} мин",
    dur_h: "{n} ч",
    dur_d: "{n} д",
    open_device: "Открыть устройство",
    close: "Закрыть",
    node_id: "ID узла",
    vendor: "Производитель",
    product: "Продукт",
    firmware: "Прошивка",
    rssi: "Сигнал",
    last_seen: "Последняя активность",
    zoom_in: "Показать полную карточку",
    zoom_out: "Вернуться к компактному виду",
    ed_title: "Заголовок",
    sort: "Сортировка",
    sort_name: "По имени",
    sort_status: "Сначала проблемы",
    columns: "Столбцы",
    battery_threshold: "Низкий заряд ниже (%)",
    show_title: "Показывать заголовок",
    show_subtitle: "Показывать подзаголовок",
    illustration: "Иллюстрация",
    illustration_theme: "Тема иллюстрации",
    theme_auto: "Автоматически (по теме)",
    theme_day: "День",
    theme_night: "Ночь",
    zoom: "Кнопка подробностей",
    language: "Язык",
    lang_auto: "Автоматически",
    show_controller: "Контроллер",
    show_manage: "Кнопка настроек",
  },
  uk: {
    title: "Мережа Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} вузол",
    nodes_few: "{n} вузли",
    nodes_many: "{n} вузлів",
    nodes_other: "{n} вузла",
    low_battery_one: "Низький заряд: {n}",
    low_battery_other: "Низький заряд: {n}",
    issues_one: "{n} проблема",
    issues_few: "{n} проблеми",
    issues_many: "{n} проблем",
    issues_other: "{n} проблеми",
    alive_count: "Активні: {n} / {total}",
    dead_other: "Мертві: {n}",
    asleep_other: "Сплячі: {n}",
    state_dead: "Мертвий",
    state_asleep: "Спить",
    state_awake: "Не спить",
    state_alive: "Активний",
    status: "Стан",
    controller: "Контролер",
    disconnected: "Драйвер відключено",
    rebuilding: "Перебудова маршрутів · {pct}",
    security: "Безпека",
    sec_none: "Без захисту",
    protocol: "Протокол",
    manage: "Налаштування Z-Wave JS",
    rebuild: "Перебудувати маршрути",
    stop_rebuild: "Зупинити перебудову",
    rebuild_title: "Перебудувати маршрути мережі?",
    rebuild_text: "Кожен вузол отримає нові маршрути до контролера. Це може тривати кілька хвилин; пристрої на батареях оновляться під час наступного пробудження.",
    stop_title: "Зупинити перебудову маршрутів?",
    stop_text: "Уже перебудовані маршрути збережуться.",
    start: "Запустити",
    stop: "Зупинити",
    cancel: "Скасувати",
    command_failed: "Команду не виконано. Спробуйте ще раз.",
    show_rebuild: "Кнопка перебудови маршрутів",
    no_devices: "Пристроїв Z-Wave не знайдено. Чи налаштовано інтеграцію Z-Wave JS?",
    healthy: "Усе гаразд",
    no_nodes: "Немає пристроїв",
    unknown: "Невідомо",
    battery: "Батарея {pct}",
    dur_min: "{n} хв",
    dur_h: "{n} год",
    dur_d: "{n} д",
    open_device: "Відкрити пристрій",
    close: "Закрити",
    node_id: "ID вузла",
    vendor: "Виробник",
    product: "Продукт",
    firmware: "Прошивка",
    rssi: "Сигнал",
    last_seen: "Остання активність",
    zoom_in: "Показати повну картку",
    zoom_out: "Повернутися до компактного вигляду",
    ed_title: "Заголовок",
    sort: "Сортування",
    sort_name: "За назвою",
    sort_status: "Спершу проблеми",
    columns: "Стовпці",
    battery_threshold: "Низький заряд нижче (%)",
    show_title: "Показувати заголовок",
    show_subtitle: "Показувати підзаголовок",
    illustration: "Ілюстрація",
    illustration_theme: "Тема ілюстрації",
    theme_auto: "Автоматично (за темою)",
    theme_day: "День",
    theme_night: "Ніч",
    zoom: "Кнопка деталей",
    language: "Мова",
    lang_auto: "Автоматично",
    show_controller: "Контролер",
    show_manage: "Кнопка налаштувань",
  },
  hu: {
    title: "Z-Wave-hálózat",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} csomópont",
    nodes_other: "{n} csomópont",
    low_battery_one: "{n} alacsony akkumulátor",
    low_battery_other: "{n} alacsony akkumulátor",
    issues_one: "{n} probléma",
    issues_other: "{n} probléma",
    alive_count: "{n} / {total} aktív",
    dead_one: "{n} halott",
    dead_other: "{n} halott",
    asleep_one: "{n} alvó",
    asleep_other: "{n} alvó",
    state_dead: "Halott",
    state_asleep: "Alszik",
    state_awake: "Ébren",
    state_alive: "Aktív",
    status: "Állapot",
    controller: "Vezérlő",
    disconnected: "Illesztő leválasztva",
    rebuilding: "Útvonalak újraépítése · {pct}",
    security: "Biztonság",
    sec_none: "Nem biztonságos",
    protocol: "Protokoll",
    manage: "Z-Wave JS beállítások",
    rebuild: "Útvonalak újraépítése",
    stop_rebuild: "Újraépítés leállítása",
    rebuild_title: "Újraépíti a hálózat útvonalait?",
    rebuild_text: "Minden csomópont új útvonalat kap a vezérlőhöz. Ez több percig is tarthat; az elemes eszközök a következő ébredésükkor frissülnek.",
    stop_title: "Leállítja az útvonalak újraépítését?",
    stop_text: "A már újraépített útvonalak megmaradnak.",
    start: "Indítás",
    stop: "Leállítás",
    cancel: "Mégse",
    command_failed: "A parancs nem sikerült. Próbálja újra.",
    show_rebuild: "Útvonal-újraépítés gomb",
    no_devices: "Nem található Z-Wave-eszköz. Be van állítva a Z-Wave JS-integráció?",
    healthy: "Minden rendben",
    no_nodes: "Nincs eszköz",
    unknown: "Ismeretlen",
    battery: "Akkumulátor {pct}",
    dur_min: "{n} perc",
    dur_h: "{n} óra",
    dur_d: "{n} nap",
    open_device: "Eszköz megnyitása",
    close: "Bezárás",
    node_id: "Csomópont-azonosító",
    vendor: "Gyártó",
    product: "Termék",
    firmware: "Firmware",
    rssi: "Jel",
    last_seen: "Utoljára látva",
    zoom_in: "Teljes kártya megjelenítése",
    zoom_out: "Vissza a kompakt nézethez",
    ed_title: "Cím",
    sort: "Rendezés",
    sort_name: "Név szerint",
    sort_status: "Problémák elöl",
    columns: "Oszlopok",
    battery_threshold: "Alacsony akkumulátor ez alatt (%)",
    show_title: "Cím megjelenítése",
    show_subtitle: "Alcím megjelenítése",
    illustration: "Illusztráció",
    illustration_theme: "Illusztráció témája",
    theme_auto: "Automatikus (a témát követi)",
    theme_day: "Nappal",
    theme_night: "Éjszaka",
    zoom: "Részletek gomb",
    language: "Nyelv",
    lang_auto: "Automatikus",
    show_controller: "Vezérlő",
    show_manage: "Beállítások gomb",
  },
  sk: {
    title: "Sieť Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} uzol",
    nodes_few: "{n} uzly",
    nodes_many: "{n} uzla",
    nodes_other: "{n} uzlov",
    low_battery_one: "Slabá batéria: {n}",
    low_battery_other: "Slabá batéria: {n}",
    issues_one: "{n} problém",
    issues_few: "{n} problémy",
    issues_many: "{n} problému",
    issues_other: "{n} problémov",
    alive_count: "Aktívne: {n} / {total}",
    dead_other: "Mŕtve: {n}",
    asleep_other: "Spiace: {n}",
    state_dead: "Mŕtvy",
    state_asleep: "Spí",
    state_awake: "Prebudený",
    state_alive: "Aktívny",
    status: "Stav",
    controller: "Ovládač",
    disconnected: "Driver odpojený",
    rebuilding: "Obnova trás · {pct}",
    security: "Zabezpečenie",
    sec_none: "Nezabezpečené",
    protocol: "Protokol",
    manage: "Nastavenia Z-Wave JS",
    rebuild: "Obnoviť trasy",
    stop_rebuild: "Zastaviť obnovu",
    rebuild_title: "Obnoviť trasy siete?",
    rebuild_text: "Každý uzol dostane nové trasy k ovládaču. Môže to trvať niekoľko minút; batériové zariadenia sa aktualizujú pri najbližšom prebudení.",
    stop_title: "Zastaviť obnovu trás?",
    stop_text: "Už obnovené trasy sa zachovajú.",
    start: "Spustiť",
    stop: "Zastaviť",
    cancel: "Zrušiť",
    command_failed: "Príkaz zlyhal. Skúste to znova.",
    show_rebuild: "Tlačidlo obnovy trás",
    no_devices: "Nenašlo sa žiadne zariadenie Z-Wave. Je integrácia Z-Wave JS nastavená?",
    healthy: "Všetko v poriadku",
    no_nodes: "Žiadne zariadenia",
    unknown: "Neznáme",
    battery: "Batéria {pct}",
    dur_min: "{n} min",
    dur_h: "{n} h",
    dur_d: "{n} d",
    open_device: "Otvoriť zariadenie",
    close: "Zavrieť",
    node_id: "ID uzla",
    vendor: "Výrobca",
    product: "Produkt",
    firmware: "Firmvér",
    rssi: "Signál",
    last_seen: "Naposledy videné",
    zoom_in: "Zobraziť celú kartu",
    zoom_out: "Späť na kompaktné zobrazenie",
    ed_title: "Názov",
    sort: "Zoradenie",
    sort_name: "Podľa názvu",
    sort_status: "Najprv problémy",
    columns: "Stĺpce",
    battery_threshold: "Slabá batéria pod (%)",
    show_title: "Zobraziť názov",
    show_subtitle: "Zobraziť podnadpis",
    illustration: "Ilustrácia",
    illustration_theme: "Téma ilustrácie",
    theme_auto: "Automaticky (podľa témy)",
    theme_day: "Deň",
    theme_night: "Noc",
    zoom: "Tlačidlo podrobností",
    language: "Jazyk",
    lang_auto: "Automaticky",
    show_controller: "Ovládač",
    show_manage: "Tlačidlo nastavení",
  },
  cs: {
    title: "Síť Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} uzel",
    nodes_few: "{n} uzly",
    nodes_many: "{n} uzlu",
    nodes_other: "{n} uzlů",
    low_battery_one: "Slabá baterie: {n}",
    low_battery_other: "Slabá baterie: {n}",
    issues_one: "{n} problém",
    issues_few: "{n} problémy",
    issues_many: "{n} problému",
    issues_other: "{n} problémů",
    alive_count: "Aktivní: {n} / {total}",
    dead_other: "Mrtvé: {n}",
    asleep_other: "Spící: {n}",
    state_dead: "Mrtvý",
    state_asleep: "Spí",
    state_awake: "Probuzený",
    state_alive: "Aktivní",
    status: "Stav",
    controller: "Řadič",
    disconnected: "Ovladač odpojen",
    rebuilding: "Obnova tras · {pct}",
    security: "Zabezpečení",
    sec_none: "Nezabezpečeno",
    protocol: "Protokol",
    manage: "Nastavení Z-Wave JS",
    rebuild: "Obnovit trasy",
    stop_rebuild: "Zastavit obnovu",
    rebuild_title: "Obnovit trasy sítě?",
    rebuild_text: "Každý uzel dostane nové trasy k řadiči. Může to trvat několik minut; bateriová zařízení se aktualizují při příštím probuzení.",
    stop_title: "Zastavit obnovu tras?",
    stop_text: "Již obnovené trasy zůstanou zachovány.",
    start: "Spustit",
    stop: "Zastavit",
    cancel: "Zrušit",
    command_failed: "Příkaz se nezdařil. Zkuste to znovu.",
    show_rebuild: "Tlačítko obnovy tras",
    no_devices: "Nenalezeno žádné zařízení Z-Wave. Je integrace Z-Wave JS nastavena?",
    healthy: "Vše v pořádku",
    no_nodes: "Žádná zařízení",
    unknown: "Neznámé",
    battery: "Baterie {pct}",
    dur_min: "{n} min",
    dur_h: "{n} h",
    dur_d: "{n} d",
    open_device: "Otevřít zařízení",
    close: "Zavřít",
    node_id: "ID uzlu",
    vendor: "Výrobce",
    product: "Produkt",
    firmware: "Firmware",
    rssi: "Signál",
    last_seen: "Naposledy viděno",
    zoom_in: "Zobrazit celou kartu",
    zoom_out: "Zpět na kompaktní zobrazení",
    ed_title: "Název",
    sort: "Řazení",
    sort_name: "Podle názvu",
    sort_status: "Nejdřív problémy",
    columns: "Sloupce",
    battery_threshold: "Slabá baterie pod (%)",
    show_title: "Zobrazit název",
    show_subtitle: "Zobrazit podnadpis",
    illustration: "Ilustrace",
    illustration_theme: "Motiv ilustrace",
    theme_auto: "Automaticky (podle motivu)",
    theme_day: "Den",
    theme_night: "Noc",
    zoom: "Tlačítko podrobností",
    language: "Jazyk",
    lang_auto: "Automaticky",
    show_controller: "Řadič",
    show_manage: "Tlačítko nastavení",
  },
  sl: {
    title: "Omrežje Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} vozlišče",
    nodes_two: "{n} vozlišči",
    nodes_few: "{n} vozlišča",
    nodes_other: "{n} vozlišč",
    low_battery_one: "Šibka baterija: {n}",
    low_battery_other: "Šibka baterija: {n}",
    issues_one: "{n} težava",
    issues_two: "{n} težavi",
    issues_few: "{n} težave",
    issues_other: "{n} težav",
    alive_count: "Aktivne: {n} / {total}",
    dead_other: "Mrtve: {n}",
    asleep_other: "Speče: {n}",
    state_dead: "Mrtva",
    state_asleep: "Spi",
    state_awake: "Budna",
    state_alive: "Aktivna",
    status: "Stanje",
    controller: "Krmilnik",
    disconnected: "Gonilnik prekinjen",
    rebuilding: "Obnova poti · {pct}",
    security: "Varnost",
    sec_none: "Ni zaščiteno",
    protocol: "Protokol",
    manage: "Nastavitve Z-Wave JS",
    rebuild: "Obnovi poti",
    stop_rebuild: "Ustavi obnovo",
    rebuild_title: "Obnovim poti omrežja?",
    rebuild_text: "Vsako vozlišče dobi nove poti do krmilnika. To lahko traja več minut; naprave na baterije se posodobijo ob naslednjem prebujenju.",
    stop_title: "Ustavim obnovo poti?",
    stop_text: "Že obnovljene poti se ohranijo.",
    start: "Začni",
    stop: "Ustavi",
    cancel: "Prekliči",
    command_failed: "Ukaz ni uspel. Poskusite znova.",
    show_rebuild: "Gumb za obnovo poti",
    no_devices: "Ni najdenih naprav Z-Wave. Ali je integracija Z-Wave JS nastavljena?",
    healthy: "Vse v redu",
    no_nodes: "Ni naprav",
    unknown: "Neznano",
    battery: "Baterija {pct}",
    dur_min: "{n} min",
    dur_h: "{n} h",
    dur_d: "{n} d",
    open_device: "Odpri napravo",
    close: "Zapri",
    node_id: "ID vozlišča",
    vendor: "Proizvajalec",
    product: "Izdelek",
    firmware: "Vdelana programska oprema",
    rssi: "Signal",
    last_seen: "Nazadnje videno",
    zoom_in: "Pokaži celotno kartico",
    zoom_out: "Nazaj na strnjen pogled",
    ed_title: "Naslov",
    sort: "Razvrščanje",
    sort_name: "Po imenu",
    sort_status: "Najprej težave",
    columns: "Stolpci",
    battery_threshold: "Šibka baterija pod (%)",
    show_title: "Prikaži naslov",
    show_subtitle: "Prikaži podnaslov",
    illustration: "Ilustracija",
    illustration_theme: "Tema ilustracije",
    theme_auto: "Samodejno (sledi temi)",
    theme_day: "Dan",
    theme_night: "Noč",
    zoom: "Gumb za podrobnosti",
    language: "Jezik",
    lang_auto: "Samodejno",
    show_controller: "Krmilnik",
    show_manage: "Gumb za nastavitve",
  },
  lv: {
    title: "Z-Wave tīkls",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_zero: "{n} mezglu",
    nodes_one: "{n} mezgls",
    nodes_other: "{n} mezgli",
    low_battery_one: "Zems akumulators: {n}",
    low_battery_other: "Zems akumulators: {n}",
    issues_zero: "{n} problēmu",
    issues_one: "{n} problēma",
    issues_other: "{n} problēmas",
    alive_count: "Aktīvi: {n} / {total}",
    dead_other: "Nedzīvi: {n}",
    asleep_other: "Miega režīmā: {n}",
    state_dead: "Nedzīvs",
    state_asleep: "Guļ",
    state_awake: "Nomodā",
    state_alive: "Aktīvs",
    status: "Statuss",
    controller: "Kontrolleris",
    disconnected: "Draiveris atvienots",
    rebuilding: "Maršrutu atjaunošana · {pct}",
    security: "Drošība",
    sec_none: "Nav aizsargāts",
    protocol: "Protokols",
    manage: "Z-Wave JS iestatījumi",
    rebuild: "Atjaunot maršrutus",
    stop_rebuild: "Apturēt atjaunošanu",
    rebuild_title: "Atjaunot tīkla maršrutus?",
    rebuild_text: "Katrs mezgls saņem jaunus maršrutus uz kontrolleri. Tas var ilgt vairākas minūtes; ierīces ar baterijām tiek atjauninātas nākamajā pamošanās reizē.",
    stop_title: "Apturēt maršrutu atjaunošanu?",
    stop_text: "Jau atjaunotie maršruti tiek saglabāti.",
    start: "Sākt",
    stop: "Apturēt",
    cancel: "Atcelt",
    command_failed: "Komanda neizdevās. Mēģiniet vēlreiz.",
    show_rebuild: "Maršrutu atjaunošanas poga",
    no_devices: "Nav atrasta neviena Z-Wave ierīce. Vai Z-Wave JS integrācija ir iestatīta?",
    healthy: "Viss kārtībā",
    no_nodes: "Nav ierīču",
    unknown: "Nezināms",
    battery: "Akumulators {pct}",
    dur_min: "{n} min",
    dur_h: "{n} h",
    dur_d: "{n} d",
    open_device: "Atvērt ierīci",
    close: "Aizvērt",
    node_id: "Mezgla ID",
    vendor: "Ražotājs",
    product: "Produkts",
    firmware: "Aparātprogrammatūra",
    rssi: "Signāls",
    last_seen: "Pēdējo reizi redzēts",
    zoom_in: "Rādīt pilno karti",
    zoom_out: "Atpakaļ uz kompakto skatu",
    ed_title: "Virsraksts",
    sort: "Kārtošana",
    sort_name: "Pēc nosaukuma",
    sort_status: "Vispirms problēmas",
    columns: "Kolonnas",
    battery_threshold: "Zems akumulators zem (%)",
    show_title: "Rādīt nosaukumu",
    show_subtitle: "Rādīt apakšnosaukumu",
    illustration: "Ilustrācija",
    illustration_theme: "Ilustrācijas tēma",
    theme_auto: "Automātiski (seko tēmai)",
    theme_day: "Diena",
    theme_night: "Nakts",
    zoom: "Detaļu poga",
    language: "Valoda",
    lang_auto: "Automātiski",
    show_controller: "Kontrolleris",
    show_manage: "Iestatījumu poga",
  },
  el: {
    title: "Δίκτυο Z-Wave",
    zwave: "Z-Wave",
    driver: "Z-Wave JS {version}",
    sdk: "SDK {v}",
    home_id: "Home ID {id}",
    long_range: "Long Range",
    count_lr: "{n} LR",
    nodes_one: "{n} κόμβος",
    nodes_other: "{n} κόμβοι",
    low_battery_one: "{n} χαμηλή μπαταρία",
    low_battery_other: "{n} χαμηλές μπαταρίες",
    issues_one: "{n} πρόβλημα",
    issues_other: "{n} προβλήματα",
    alive_count: "{n} / {total} ενεργοί",
    dead_one: "{n} νεκρός",
    dead_other: "{n} νεκροί",
    asleep_one: "{n} σε ύπνο",
    asleep_other: "{n} σε ύπνο",
    state_dead: "Νεκρός",
    state_asleep: "Σε ύπνο",
    state_awake: "Ξύπνιος",
    state_alive: "Ενεργός",
    status: "Κατάσταση",
    controller: "Ελεγκτής",
    disconnected: "Ο οδηγός αποσυνδέθηκε",
    rebuilding: "Ανακατασκευή διαδρομών · {pct}",
    security: "Ασφάλεια",
    sec_none: "Μη ασφαλές",
    protocol: "Πρωτόκολλο",
    manage: "Ρυθμίσεις Z-Wave JS",
    rebuild: "Ανακατασκευή διαδρομών",
    stop_rebuild: "Διακοπή ανακατασκευής",
    rebuild_title: "Ανακατασκευή των διαδρομών του δικτύου;",
    rebuild_text: "Κάθε κόμβος παίρνει νέες διαδρομές προς τον ελεγκτή. Μπορεί να διαρκέσει αρκετά λεπτά· οι συσκευές μπαταρίας ενημερώνονται στο επόμενο ξύπνημά τους.",
    stop_title: "Διακοπή της ανακατασκευής διαδρομών;",
    stop_text: "Οι διαδρομές που έχουν ήδη ανακατασκευαστεί διατηρούνται.",
    start: "Έναρξη",
    stop: "Διακοπή",
    cancel: "Ακύρωση",
    command_failed: "Η εντολή απέτυχε. Δοκιμάστε ξανά.",
    show_rebuild: "Κουμπί ανακατασκευής διαδρομών",
    no_devices: "Δεν βρέθηκε συσκευή Z-Wave. Έχει ρυθμιστεί η ενσωμάτωση Z-Wave JS;",
    healthy: "Όλα εντάξει",
    no_nodes: "Καμία συσκευή",
    unknown: "Άγνωστο",
    battery: "Μπαταρία {pct}",
    dur_min: "{n} λεπ.",
    dur_h: "{n} ώρ.",
    dur_d: "{n} ημ.",
    open_device: "Άνοιγμα συσκευής",
    close: "Κλείσιμο",
    node_id: "ID κόμβου",
    vendor: "Κατασκευαστής",
    product: "Προϊόν",
    firmware: "Υλικολογισμικό",
    rssi: "Σήμα",
    last_seen: "Τελευταία εμφάνιση",
    zoom_in: "Εμφάνιση πλήρους κάρτας",
    zoom_out: "Επιστροφή στη συμπαγή προβολή",
    ed_title: "Τίτλος",
    sort: "Ταξινόμηση",
    sort_name: "Κατά όνομα",
    sort_status: "Πρώτα τα προβλήματα",
    columns: "Στήλες",
    battery_threshold: "Χαμηλή μπαταρία κάτω από (%)",
    show_title: "Εμφάνιση τίτλου",
    show_subtitle: "Εμφάνιση υπότιτλου",
    illustration: "Εικονογράφηση",
    illustration_theme: "Θέμα εικονογράφησης",
    theme_auto: "Αυτόματο (ακολουθεί το θέμα)",
    theme_day: "Ημέρα",
    theme_night: "Νύχτα",
    zoom: "Κουμπί λεπτομερειών",
    language: "Γλώσσα",
    lang_auto: "Αυτόματα",
    show_controller: "Ελεγκτής",
    show_manage: "Κουμπί ρυθμίσεων",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const lang = (hass, config) => {
  const l = config?.language || (hass && (hass.locale?.language || hass.language)) || "en";
  return STRINGS[l] ? l : STRINGS[l.split("-")[0]] ? l.split("-")[0] : "en";
};

// Locale for Intl: Home Assistant's full locale when its base matches the card's resolved language (keeps the
// region, e.g. pt-BR or de-CH), otherwise the resolved language. Home Assistant's "pt" is European Portuguese,
// which Intl would format as Brazilian, so bare "pt" becomes "pt-PT".
const fmtLang = (hass, config) => {
  const l = lang(hass, config);
  const ha = hass && (hass.locale?.language || hass.language);
  const loc = ha && ha.split("-")[0] === l.split("-")[0] && l !== "sr-Latn" ? ha : l;
  return loc === "pt" ? "pt-PT" : loc;
};

// A text of the card's language, English when missing, with its {placeholders} filled.
const t = (hass, config, key, vars = {}) => {
  const s = STRINGS[lang(hass, config)][key] ?? STRINGS.en[key] ?? key;
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
};

// "12 nodes": the plural form of the card's language (Intl.PluralRules), the `_other` form when the language has
// no text for that form.
const plural = (hass, config, key, n) => {
  let cat = "other";
  try {
    cat = new Intl.PluralRules(fmtLang(hass, config)).select(n);
  } catch (_e) {
    /* default form */
  }
  const table = STRINGS[lang(hass, config)];
  const k = `${key}_${cat}` in table ? `${key}_${cat}` : `${key}_other`;
  return t(hass, config, k, { n });
};

const svgIcon = (path, cls = "") => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const zwaveLogo = (cls = "") => `<svg class="icon logo ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ZWAVE}"/></svg>`;
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const unavailableState = (st) => !st || st.state === "unavailable";

const navigate = (path) => {
  history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
};

// ---------------------------------------------------------------------------
// Z-Wave nodes, from the device and entity registries
// ---------------------------------------------------------------------------

const DOMAIN = "zwave_js";

// Node status of Z-Wave JS (NodeStatus): the websocket gives a number, the node status sensor a word.
const STATUS_NAMES = ["unknown", "asleep", "awake", "dead", "alive"];
const statusName = (v) => {
  if (typeof v === "number") return STATUS_NAMES[v] ?? "unknown";
  const s = String(v ?? "").toLowerCase();
  return STATUS_NAMES.includes(s) ? s : null;
};

// Security classes of Z-Wave JS (SecurityClass): the highest one a node was included with.
const SECURITY = { 2: "s2_access", 1: "s2_auth", 0: "s2_unauth", 7: "s0" };
const SECURITY_TAGS = { s2_access: "S2 Access", s2_auth: "S2 Auth", s2_unauth: "S2", s0: "S0" };
const securityOf = (n) => {
  if (!n) return null;
  const v = n.highest_security_class ?? n.highestSecurityClass;
  if (v !== null && v !== undefined && SECURITY[v]) return SECURITY[v];
  if (n.is_secure === false || v === -1) return "none";
  return null;
};

// RF regions of Z-Wave JS (RFRegion), shown by their usual short names.
const REGIONS = { 0: "EU", 1: "US", 2: "ANZ", 3: "HK", 5: "IN", 6: "IL", 7: "RU", 8: "CN", 9: "US LR", 10: "US LR", 11: "EU LR", 32: "JP", 33: "KR" };

// The home id and node id of a Z-Wave device, from its device registry identifier: `<home id>-<node id>`, or
// `<home id>-<node id>-<manufacturer>:<type>:<product>` (homeassistant/components/zwave_js/helpers.py, get_device_id
// and get_device_id_ext). Null when the device has no such identifier.
const zwaveId = (device) => {
  for (const ident of device?.identifiers || []) {
    if (!Array.isArray(ident) || ident[0] !== DOMAIN) continue;
    const m = /^(\d+)-(\d+)(?:-.*)?$/.exec(String(ident[1]));
    if (m) return { home: Number(m[1]), node: Number(m[2]) };
  }
  return null;
};

const isZwaveDevice = (d) => !!d && !d.disabled_by && (d.identifiers || []).some((i) => Array.isArray(i) && i[0] === DOMAIN);

// Node ids from 256 up are Z-Wave Long Range nodes.
const isLongRange = (node) => node !== null && node !== undefined && node >= 256;

// The entities of each device, memoized on the registry objects (Home Assistant replaces them on every change).
let _byDevice = { entities: null, map: new Map() };
const entitiesByDevice = (hass) => {
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
const _zwaveDevices = new WeakMap();
const zwaveDevices = (hass, config = {}, own = null) => {
  const reg = hass?.devices;
  const key = JSON.stringify([Array.isArray(config.exclude) ? config.exclude : [], own ? [...own] : null]);
  const hit = reg && _zwaveDevices.get(reg);
  if (hit && hit.key === key) return hit.value;
  const value = scanZwaveDevices(hass, config, own);
  if (reg) _zwaveDevices.set(reg, { key, value });
  return value;
};
const scanZwaveDevices = (hass, config, own) => {
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
const MAIN_DOMAINS = [
  "lock", "light", "cover", "climate", "fan", "valve", "vacuum", "water_heater", "humidifier", "media_player", "switch",
  "binary_sensor", "sensor", "event", "button", "number", "select",
];

// What the card reads among a device's entities: its main entity, its battery, its power, its signal (the node
// statistics' RSSI), its node status sensor and its last seen sensor.
const deviceEntities = (hass, deviceId) => {
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
const BINARY_ICONS = { door: "door", garage_door: "garage", window: "window", opening: "door", motion: "motion", occupancy: "motion", presence: "motion", moisture: "moisture", smoke: "smoke", carbon_monoxide: "smoke", battery: "battery" };
const SENSOR_ICONS = { temperature: "temperature", humidity: "humidity", power: "power", energy: "power", battery: "battery", pm25: "air", pm10: "air", aqi: "air", volatile_organic_compounds: "air", carbon_dioxide: "air" };
const COVER_ICONS = { blind: "blinds", shade: "blinds", shutter: "shutter", curtain: "curtains", garage: "garage", gate: "garage", door: "door", window: "window" };
const DOMAIN_ICONS = { light: "light", lock: "lock", climate: "thermostat", fan: "fan", valve: "valve", vacuum: "vacuum", water_heater: "boiler", humidifier: "humidifier", media_player: "speaker", button: "button", event: "button", cover: "blinds" };
const iconOf = (hass, entityId) => {
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
const nodeInfo = (hass, device, { ws = null, threshold = 20 } = {}) => {
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
const summaryOf = (infos) => {
  const dead = infos.filter((i) => !i.available).length;
  const asleep = infos.filter((i) => i.asleep).length;
  const lowBattery = infos.filter((i) => i.lowBattery).length;
  const longRange = infos.filter((i) => i.longRange).length;
  return { total: infos.length, alive: infos.length - dead, dead, asleep, lowBattery, longRange, issues: dead + lowBattery };
};

// A controller as the card shows it: its device, and the network status of its config entry when there is one.
const controllerOf = (device, net) => {
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

const NET_TTL = 60 * 1000;
const store = {
  rev: 0,
  net: new Map(), // controller device id → { at, data, pending, failed }
  cards: new Set(),
};
const bump = () => {
  store.rev++;
  for (const c of store.cards) c._dataChanged();
};

const isAdmin = (hass) => !!hass?.user?.is_admin;

// Asks the network status of each controller every minute (every 10 minutes after a failure), by the device id of
// its controller.
const refreshNetwork = (hass, controllers) => {
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
const rebuildRoutes = (hass, controller, stop = false) =>
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
const networkNodes = () => {
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
const _updateIds = new WeakMap();
const driverVersion = (hass, controllers) => {
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

// ---------------------------------------------------------------------------
// Shadow DOM patching (kept nodes keep their focus, hover and running animations)
// ---------------------------------------------------------------------------

const patchAttrs = (cur, next) => {
  for (const { name } of [...cur.attributes]) if (!next.hasAttribute(name)) cur.removeAttribute(name);
  for (const { name, value } of next.attributes) if (cur.getAttribute(name) !== value) cur.setAttribute(name, value);
};
const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute("data-key") : null);
const sameNode = (a, b) => !!a && a.nodeType === b.nodeType && a.nodeName === b.nodeName;
const patchChildren = (cur, next) => {
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
const morph = (root, html) => {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  patchChildren(root, tpl.content);
};

// A click inside a dialog (more-info opened from the card) is not a click outside the card.
const inDialog = (ev) => ev.composedPath().some((n) => ["ha-more-info-dialog", "ha-dialog", "dialog"].includes(n.localName));

// "A click elsewhere" is caught on the pointer, not only on the click event: on iOS (Safari and the companion app)
// a tap on something that is not clickable sends no click to the page. The handler runs when the press and the
// release are both outside the card; keyboard clicks (no click count) still go through the click event.
const watchOutside = (card, handler) => {
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
const SCENE_HUB = [148, 44];
const SCENE_DEVICES = [
  [112, 22, "light"],
  [140, 14, "outlet"],
  [168, 31, "temperature"],
  [110, 58, "motion"],
  [186, 58, "lock"],
  [160, 66, "blinds_h"],
];
const SCENE_DOWN = 4;
const SCENE_SLEEP = 2;
const SCENE_SPEEDS = [1.5, 2, 3, 1.5, 2, 3];
const sceneSvg = (down, asleep) => {
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const COMMON_STYLE = `
  :host([hide-title]) .titles .name, :host([hide-title]) .mhead > .title, :host([hide-subtitle]) .titles > .stats { display: none; }
  :host { --zw-accent: #1e6fd9; --zw-ok: var(--success-color, #43a047); --zw-warn: var(--warning-color, #ffa600);
          --zw-alert: var(--error-color, #db4437); --zw-idle: var(--secondary-text-color, #9e9e9e); --zw-na: var(--disabled-color, #9e9e9e);
          --zw-secure: #00897b; --zw-s0: #c77c02; --zw-lr: #7e57c2; display: block; min-width: 0; }
  ha-card { overflow: hidden; position: relative; container-type: inline-size; }
  /* A size container has no width of its own content: in a parent sized by its content the card would fall to a
     few pixels. This empty grid gives it a natural width of 400 px without any minimum. */
  :host::before { content: ""; display: grid; grid-template-columns: minmax(0, 400px); height: 0; }
  .icon { width: 18px; height: 18px; fill: currentColor; flex: none; }
  [role="button"] { cursor: pointer; }
  [role="button"]:focus-visible, button:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
  .ok { --c: var(--zw-ok); } .warn { --c: var(--zw-warn); } .alert { --c: var(--zw-alert); } .na { --c: var(--zw-na); }
  .warning { padding: 16px; color: color-mix(in srgb, var(--zw-warn) 40%, var(--primary-text-color, #212121)); }
`;

// The width of an element's whole text in its own font, in fractional pixels (scrollWidth is rounded).
let textCtx;
const textWidth = (el) => {
  const cs = getComputedStyle(el);
  textCtx ??= document.createElement("canvas").getContext?.("2d");
  if (!textCtx) return el.scrollWidth;
  textCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  return Math.max(el.scrollWidth, textCtx.measureText(el.textContent.trim()).width + pad);
};

// The status pill (a dot and its label in the badge's colour), on the banner, the classic header and the mini card.
const PILL_STYLE = `
  .s-ok { --c: var(--zw-accent); } .s-warn { --c: var(--zw-warn); } .s-alert { --c: var(--zw-alert); } .s-na { --c: var(--zw-idle); }
  .night .bst.s-ok { --c: #9cc7ff; }
  .bst { flex: none; display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: 12px; font-size: 11px; font-weight: 500;
         line-height: 16px; white-space: nowrap; box-sizing: border-box; max-width: 100%; overflow: hidden;
         background: color-mix(in srgb, var(--c) 15%, transparent); color: color-mix(in srgb, var(--c) 40%, var(--primary-text-color, #212121)); }
  .banner .bst { background: color-mix(in srgb, var(--c) 18%, rgba(255,255,255,.78)); color: color-mix(in srgb, var(--c) 45%, #0d2a45); }
  .banner.night .bst { background: color-mix(in srgb, var(--c) 30%, rgba(8,18,38,.55)); color: color-mix(in srgb, var(--c) 35%, #ffffff); }
  .bst .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: none; }
  .bst .txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  @container (max-width: 200px) { .bst { padding: 4px; } .bst .txt { display: none; } }
`;

// The illustrated header, the same on both cards: 90 px, the title on the light blue sky at its left, the scene at its
// right, a 10 px ground strip edge to edge at its bottom (a network line with nodes, packets sliding along it).
const BANNER_STYLE = `
  .banner { position: relative; height: 90px; overflow: hidden; --strip-h: 10px; --scene-w: 108px;
            --sky-text: #0f2a4d; --sky-muted: #3e5f86; --mesh: #2f80ed; --line: #1f6fd1; --dev-bg: #f4f8ff; --dev-st: #bcd3f3; --wall: #d8cfc1;
            background: linear-gradient(90deg, #f5f9ff 0%, #e6f0fd 34%, #cfe2fb 70%, #bcd6f8 100%); }
  .banner.night { --sky-text: #ffffff; --sky-muted: rgba(255,255,255,.78); --line: #8ab8ff; --dev-bg: #13233c; --dev-st: #2e4c78; --wall: #3a4456;
                  background: linear-gradient(90deg, #172a46 0%, #13243d 36%, #0f1f35 72%, #0c192c 100%); }
  /* With the detail button in its top-right corner, the scene stands left of it. */
  .banner:has(> .zoom) { --btn-w: 30px; }
  .banner .scene { position: absolute; right: var(--btn-w, 0px); bottom: var(--strip-h); height: calc(100% - var(--strip-h)); width: var(--scene-w); overflow: hidden; }
  /* Ground strip: the Z-Wave network line, its nodes every 24 px. */
  .strip { position: absolute; left: 0; right: 0; bottom: 0; height: var(--strip-h);
           background-color: color-mix(in srgb, var(--mesh) 18%, #e9eef5);
           background-image: radial-gradient(circle, var(--mesh) 2px, transparent 2.5px), linear-gradient(var(--mesh), var(--mesh));
           background-size: 24px 100%, 100% 1px; background-repeat: repeat-x, no-repeat; background-position: 0 50%, 0 50%;
           box-shadow: inset 0 2px 0 color-mix(in srgb, var(--mesh) 50%, #fff); animation: zw-slide 2s linear infinite; }
  .night .strip { background-color: color-mix(in srgb, var(--mesh) 20%, #1a202c); box-shadow: inset 0 2px 0 color-mix(in srgb, var(--mesh) 55%, #1a202c); }
  .head { position: absolute; z-index: 1; left: 0; top: 0; bottom: var(--strip-h); box-sizing: border-box; right: calc(var(--scene-w) + var(--btn-w, 0px) + 4px);
          display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 12px; min-width: 0; color: var(--sky-text); }
  /* The Z-Wave badge: its colour is the network's status (healthy accent, a low battery amber, a dead node red, no node
     grey). */
  .badge { position: relative; width: 40px; height: 40px; flex: none; border-radius: 50%; display: grid; place-items: center; color: var(--bc);
           --bc: var(--zw-accent); background: rgba(255,255,255,.62); box-shadow: inset 0 0 0 1px rgba(30,111,217,.2); }
  .night .badge { --bc: #9cc7ff; background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }
  .badge.s-warn, .night .badge.s-warn { --bc: var(--zw-warn); } .badge.s-alert, .night .badge.s-alert { --bc: var(--zw-alert); }
  .badge.s-na, .night .badge.s-na { --bc: var(--zw-idle); }
  .badge .icon { width: 24px; height: 24px; }
  .titles { flex: 1 1 0; min-width: 0; overflow: hidden; display: flex; flex-direction: column; }
  /* The title row: the name, then the status pill right after it, when the whole name and the pill's whole label
     fit there (measured, see _fitPill); otherwise the pill takes a line of its own under the subtitle, which keeps
     one line, and when that does not fit above the strip (or on the narrowest cards) only its dot stays. */
  .trow { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .trow > .name { flex: 0 1 auto; min-width: 4.5ch; }
${PILL_STYLE}  .titles.below .trow { display: contents; }
  .titles.below .bst { order: 2; align-self: flex-start; margin-top: 2px; }
  .titles.below .stats { order: 1; max-height: 16px; }
  .titles.dot-only .bst { padding: 4px; } .titles.dot-only .bst .txt { display: none; }
  .name { font-size: 16px; font-weight: 500; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* The statistics on two lines at most: a part that does not fit goes to a third line, clipped away; the "·" that
     starts a line sits in the negative margin, clipped too. */
  .stats { display: flex; flex-wrap: wrap; max-height: 32px; overflow: hidden; margin-left: -10px; font-size: 12px; line-height: 16px; color: var(--sky-muted); }
  .stats span { white-space: nowrap; }
  .stats span::before { content: "·"; display: inline-block; width: 10px; text-align: center; }
  /* Scene colours, day and night. */
  .scene .house { fill: rgba(255,255,255,.55); stroke: var(--wall); stroke-width: 1.6; }
  .night .scene .house { fill: rgba(255,255,255,.03); }
  .scene .floor { stroke: var(--wall); stroke-width: 1; stroke-dasharray: 3 3; }
  .scene .links line { stroke: var(--line); stroke-width: 1.2; stroke-opacity: .55; }
  .scene .links line.down { stroke: var(--zw-alert); stroke-opacity: .8; stroke-dasharray: 2 3; }
  .scene .links line.sleep { stroke-opacity: .35; stroke-dasharray: 1.5 2.5; }
  .scene .pkt { fill: var(--line); animation: zw-pkt 2s linear infinite; }
  .scene .dev circle { fill: var(--dev-bg); stroke: var(--dev-st); stroke-width: 1.4; }
  .scene .dev path { fill: var(--line); }
  .scene .dev.down circle { stroke: var(--zw-alert); } .scene .dev.down path { fill: var(--zw-alert); }
  .scene .dev .alarm { fill: var(--zw-alert); stroke: none; }
  .scene .dev.sleep circle { stroke-dasharray: 2 2; } .scene .dev.sleep > path:not(.zz) { opacity: .5; }
  .scene .zz { fill: var(--line); transform-box: fill-box; animation: zw-doze 3s ease-in-out infinite; }
  .scene .hub { fill: var(--line); } .scene .hub-logo { fill: #ffffff; }
  /* The driver disconnected from its controller: the controller pulses red, its links go grey and dashed, no packet. */
  .drv-off .scene .hub { fill: var(--zw-alert); } .drv-off .scene .ping { stroke: var(--zw-alert); animation-duration: 1.5s; }
  .drv-off .scene .links line { stroke: var(--zw-idle); stroke-dasharray: 2 3; } .drv-off .scene .pkt { display: none; }
  .drv-off .scene .dev path { fill: var(--zw-idle); }
  .scene .ping { fill: none; stroke: var(--line); stroke-width: 1; transform-box: fill-box; transform-origin: center; animation: zw-ping 2s ease-out infinite; }
  /* ── Animations (each one a divisor of 6 s) ── */
  .scene .blink { animation: zw-blink 1.5s ease-in-out infinite; }
  @keyframes zw-pkt { from { offset-distance: 0%; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } to { offset-distance: 100%; opacity: 0; } }
  @keyframes zw-ping { from { transform: scale(1); opacity: .9; } to { transform: scale(2.6); opacity: 0; } }
  @keyframes zw-blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  @keyframes zw-doze { from { transform: translateY(2px); opacity: 0; } 30% { opacity: 1; } 80% { opacity: 1; } to { transform: translateY(-3px); opacity: 0; } }
  @keyframes zw-slide { to { background-position: 24px 50%, 0 50%; } }
  @media (prefers-reduced-motion: reduce) {
    .scene *, .strip { animation: none !important; }
    .scene .pkt, .scene .ping { display: none; }
  }
  /* A narrow card keeps the sky and the strip for its texts: no scene. */
  @container (max-width: 300px) {
    .banner .scene { display: none; }
    .head { right: var(--btn-w, 0px); }
  }

  /* ── Classic header (illustration: false) ── */
  .header { display: flex; align-items: center; gap: 10px; padding: 12px 14px 0; }
  .header .badge { background: color-mix(in srgb, var(--bc) 16%, transparent); box-shadow: none; }
  .header .stats { color: var(--secondary-text-color); }
`;

const FULL_STYLE = `
  /* Status pill: the state colour on a tint, the text mixed with the text colour to stay readable. */
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 12px; font-size: 11px; font-weight: 500;
          line-height: 16px; white-space: nowrap; min-width: 0; max-width: 100%; box-sizing: border-box; overflow: hidden; flex: 0 1 auto;
          background: color-mix(in srgb, var(--c) 15%, transparent); color: color-mix(in srgb, var(--c) 40%, var(--primary-text-color, #212121)); }
  .chip .txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); flex: none; }

  /* ── Status chips, the routes rebuild on the right ── */
  .status { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; padding: 10px 12px 0; min-width: 0; }
  .aside { margin-left: auto; min-width: 0; max-width: 100%; font-size: 12px; line-height: 16px; color: var(--secondary-text-color);
             white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }

  /* ── Controller and nodes: 56 px tiles, the size of Home Assistant's Tile card ── */
  .content { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
  .grid { display: grid; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); gap: 8px; }
  /* Under 390 px (a phone, a narrow column) two tiles leave the name a few letters: one node per row. */
  @container (max-width: 389px) { .grid { grid-template-columns: minmax(0, 1fr); } }
  .tile { all: unset; position: relative; box-sizing: border-box; cursor: pointer; min-width: 0; min-height: 56px;
          display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 8px; border-radius: 12px; --t: var(--zw-ok);
          background: var(--secondary-background-color, #f1f1f1); transition: background .2s; }
  .tile.lvl-warn { --t: var(--zw-warn); } .tile.lvl-alert { --t: var(--zw-alert); }
  /* A sleeping node is healthy: its status dot is grey, the rest neutral. */
  .tile.lvl-ok.asleep { --t: var(--zw-idle); }
  /* The tile's background stays neutral: its state shows on its icon, its state line and its status dot. */
  .tile:hover { background: color-mix(in srgb, var(--t) 13%, var(--secondary-background-color, #f1f1f1)); }
  .tile:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
  .ic { position: relative; flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
        color: var(--t); background: color-mix(in srgb, var(--t) 16%, transparent); }
  .ic .icon { width: 24px; height: 24px; }
  .ic ha-icon { --mdc-icon-size: 24px; }
  .sdot { position: absolute; right: -1px; bottom: -1px; width: 10px; height: 10px; border-radius: 50%; background: var(--t);
          box-shadow: 0 0 0 2px var(--secondary-background-color, #f1f1f1); }
  .txt { flex: 1 1 auto; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  /* The name has the tile's width (the security and protocol tags are on the line under it) and goes on to a second line rather than
     be cut; only a name longer than two lines ends with "…". */
  .tname { font-size: 14px; font-weight: 600; line-height: 1.25; color: var(--primary-text-color); overflow: hidden; overflow-wrap: break-word;
           display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
  /* The state line, then the tags after it, or under it when they do not fit on the line. */
  .tsub { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 6px; min-width: 0; }
  .tsub > .tstate { flex: 0 1 auto; min-width: 0; }
  /* A reading is never cut short: on a narrow tile it goes on to a second line, between its words only (a word too
     long for its line ends with "…"); the name, a label, keeps its ellipsis. */
  .tstate { font-size: 12px; line-height: 1.25; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis;
            font-variant-numeric: tabular-nums; }
  /* The ha-* tile look: the state line and the icon pastille in the tile's state colour (green OK, grey asleep, amber
     low battery, red dead). */
  .tile .tstate { color: var(--t); }
  /* Security tag (S2 green, S0 amber, none grey) and Long Range tag (purple). */
  .tag { flex: none; padding: 0 6px; border-radius: 10px; font-size: 11px; font-weight: 500; line-height: 15px; white-space: nowrap;
         background: color-mix(in srgb, var(--c) 15%, transparent); color: color-mix(in srgb, var(--c) 40%, var(--primary-text-color, #212121)); }
  .tag.s2_access, .tag.s2_auth, .tag.s2_unauth { --c: var(--zw-secure); } .tag.s0 { --c: var(--zw-s0); } .tag.lr { --c: var(--zw-lr); }
  .tag.none { --c: var(--zw-idle); background: color-mix(in srgb, var(--c) 18%, transparent); color: color-mix(in srgb, var(--c) 25%, var(--primary-text-color, #212121)); }
  .tags { display: inline-flex; flex-wrap: wrap; gap: 4px; }
  .tile .chip { flex: none; }
  /* The controller tile of a card this narrow keeps its line for the network: its node count is in the banner. */
  @container (max-width: 300px) { .controller .chip { display: none; } }
  .empty { padding: 4px 2px; font-size: 13px; color: var(--secondary-text-color); }

  /* ── Settings button: tinted, never filled ── */
  .actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 2px; }
  .btn.quiet { background: none; box-shadow: inset 0 0 0 1px var(--divider-color, rgba(127,127,127,.3)); color: var(--primary-text-color); }
  .btn.quiet:hover { background: color-mix(in srgb, var(--secondary-text-color) 12%, transparent); }
  .btn[aria-busy="true"] { opacity: .6; cursor: progress; }
  .modal .msg { margin: 0; font-size: 13px; line-height: 1.45; color: var(--secondary-text-color); }
  .modal .err { margin: 0; font-size: 13px; color: var(--zw-alert); }
  .btn { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; padding: 8px 14px;
         font-size: 13px; font-weight: 500; line-height: 16px; box-sizing: border-box; max-width: 100%;
         background: color-mix(in srgb, var(--zw-accent) 14%, transparent); color: color-mix(in srgb, var(--zw-accent) 70%, var(--primary-text-color, #212121)); }
  .btn:hover { background: color-mix(in srgb, var(--zw-accent) 22%, transparent); }
  .btn:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
  .btn .icon { width: 16px; height: 16px; }

  /* ── Node popup, at the top of the card ── */
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: flex-start; justify-content: center;
              padding-top: 10px; box-sizing: border-box; z-index: 9; border-radius: inherit; }
  .modal { background: var(--card-background-color, #fff); color: var(--primary-text-color); width: min(94%, 380px); max-height: calc(100% - 20px);
           overflow: auto; box-sizing: border-box; border-radius: 14px; padding: 14px; box-shadow: 0 8px 30px rgba(0,0,0,.35);
           display: flex; flex-direction: column; gap: 10px; }
  .mhead { display: flex; align-items: flex-start; gap: 10px; }
  .mhead .ic { width: 36px; height: 36px; }
  .mhead .ic .icon { width: 20px; height: 20px; }
  .mhead .ic ha-icon { --mdc-icon-size: 20px; }
  .mhead h3 { margin: 0; font-size: 16px; font-weight: 500; line-height: 1.3; overflow-wrap: anywhere; }
  .mhead .sub { font-size: 12px; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  .mhead > div { flex: 1 1 auto; min-width: 0; }
  .close { all: unset; flex: none; cursor: pointer; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
           color: var(--secondary-text-color); box-shadow: inset 0 0 0 1px var(--divider-color, rgba(127,127,127,.3)); }
  .close:hover { color: var(--primary-text-color); background: color-mix(in srgb, var(--secondary-text-color) 12%, transparent); }
  .close .icon { width: 16px; height: 16px; }
  .mchips { display: flex; flex-wrap: wrap; gap: 6px; } .mchips .tag { align-self: stretch; display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 12px; }
  .facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 5px 12px; margin: 0; font-size: 13px; }
  .facts dt { color: var(--secondary-text-color); }
  .facts dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .modal .actions { margin-top: 0; }
`;

// The mini cards' chips row.
const MINI_CHIPS_STYLE = `
  .rs { display: flex; flex-wrap: wrap; gap: 2px 4px; margin-left: -4px; }
  .rs:empty { display: none; }
  /* A chip is plain (icon and text) until it needs a look: then a tinted pill. It never runs past the card. */
  .r { display: inline-flex; align-items: center; gap: 1px; padding: 0 5px 0 4px; box-sizing: border-box; min-width: 0; max-width: 100%;
       overflow: hidden; border-radius: 999px; font-size: 12px; font-weight: 500; line-height: 18px; white-space: nowrap; --t: var(--zw-ok);
       color: var(--primary-text-color); }
  .r .icon { width: 13px; height: 13px; color: var(--t); margin-right: 2px; }
  .r > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .r.pill { color: var(--t); background: color-mix(in srgb, var(--t) 14%, transparent); }
  .r.alert { --t: var(--zw-alert); } .r.warn { --t: var(--zw-warn); }
`;

// The mini card: a 40 px badge beside the title, the status and the chips, like the other ha-* mini cards.
const MINI_STYLE = `
  ha-card { padding: 12px; }
  .mini { display: flex; align-items: flex-start; gap: 10px; }
  .badge { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; --bc: var(--zw-accent);
           background: color-mix(in srgb, var(--bc) 16%, transparent); color: var(--bc); }
  .badge.s-warn { --bc: var(--zw-warn); } .badge.s-alert { --bc: var(--zw-alert); } .badge.s-na { --bc: var(--zw-idle); }
  .badge .icon { width: 24px; height: 24px; }
  /* The badge keeps the full card's size (40 px, icon 24 px): the body is at least as tall, a lone title line centred
     beside it. */
  .body { flex: 1; min-width: 0; min-height: 40px; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
  .mhead { display: flex; align-items: center; gap: 8px; }
  .title { flex: 0 1 auto; min-width: 4.5ch; font-size: 16px; font-weight: 500; line-height: 1.25; color: var(--primary-text-color);
           white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mhead > .bst { flex: none; }
  .mhead > .zoom { margin-left: auto; }
  /* The whole title and the pill's whole label do not fit on one row (measured, see _fitPill): the pill on a line of
     its own under the title. */
  .mhead.below { flex-wrap: wrap; row-gap: 4px; }
  .mhead.below > .title { flex: 1 1 calc(100% - 32px); }
  .mhead.below:not(:has(> .zoom)) > .title { flex-basis: 100%; }
  .mhead.below > .bst { order: 3; }
  .mhead.dot-only > .bst { padding: 4px; } .mhead.dot-only > .bst .txt { display: none; }
${MINI_CHIPS_STYLE}  .zoom { all: unset; flex: none; cursor: pointer; width: 24px; height: 24px; margin: -4px -4px -4px 0; border-radius: 50%;
          display: grid; place-items: center; color: var(--secondary-text-color); }
  .zoom .icon { width: 16px; height: 16px; }
  .zoom:hover { background: color-mix(in srgb, var(--zw-idle) 16%, transparent); color: var(--primary-text-color); }
  .zoom:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 1px; }
  /* Under 200 px the status pill is only its coloured dot (PILL_STYLE), its text kept in its title and aria-label. */
  @container (max-width: 200px) {
    /* The title keeps a few letters beside the dot and the detail button (6 columns on a phone). */
    .mhead { gap: 4px; }
    .title { min-width: 2ch; }
  }
`;

// The illustrated mini card: the banner, the status (a dot of its colour) under the title, the chips row below.
const MINI_BANNER_STYLE = `
${MINI_CHIPS_STYLE}  .rs { padding: 8px 10px 10px 8px; margin-left: 0; }
`;

// The zoomed mini card: the full card, with the detail button over its banner.
const ZOOM_STYLE = `
  .zoom { all: unset; position: absolute; z-index: 2; top: 5px; right: 5px; cursor: pointer; width: 24px; height: 24px; border-radius: 50%;
          display: grid; place-items: center; color: #33506b; background: rgba(255,255,255,.55); box-shadow: inset 0 0 0 1px rgba(255,255,255,.7);
          backdrop-filter: blur(4px); }
  .zoom:hover { background: rgba(255,255,255,.75); }
  .zoom.on-night { color: #ffffff; background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.2); }
  .zoom.on-night:hover { background: rgba(255,255,255,.22); }
  .zoom.plain { color: var(--secondary-text-color); background: none; box-shadow: inset 0 0 0 1px var(--divider-color, rgba(127,127,127,.3)); top: 18px; right: 12px; }
  .zoom .icon { width: 16px; height: 16px; }
  .zoom:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 1px; }
  .header { position: relative; padding-right: 48px; }
`;

// ---------------------------------------------------------------------------
// The full card
// ---------------------------------------------------------------------------

// The popup key of the rebuild's confirmation (node popups are keyed by device id).
const REBUILD = "@rebuild";

class ZWaveCard extends HTMLElement {
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
    const { controllers, nodes } = zwaveDevices(h, this._config, networkNodes().own);
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
    refreshNetwork(this._hass, this._controllers.map((c) => c.device));
    const html = this._render();
    if (html !== this._html) {
      this._html = html;
      morph(this.shadowRoot, html);
    }
    this._fitPill();
  }

  // The controllers and the nodes, sorted (by name, or issues first), and their summary.
  _collect() {
    const h = this._hass;
    const c = this._config;
    const net = networkNodes();
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
    this._controllers = controllers.map((d) => controllerOf(d, store.net.get(d.id)?.data ?? null));
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
    return this._controllers.find((x) => x.entry && x.connected) || null;
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
    rebuildRoutes(this._hass, c, c.rebuilding)
      .then(
        () => {
          this._busy = false;
          this._closeDetail(true);
          refreshNetwork(this._hass, this._controllers.map((x) => x.device));
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

// ---------------------------------------------------------------------------
// The mini card: the status of the network beside the Z-Wave badge; its detail button unfolds the full card
// ---------------------------------------------------------------------------

class ZWaveMiniCard extends ZWaveCard {
  constructor() {
    super();
    this._zoomed = false;
    this._onFold = (ev) => {
      // The click that closed the node popup only closes the popup.
      if (this._detailClosedBy === ev) return;
      if (this._zoomed && !inDialog(ev)) this._setZoom(false);
    };
  }

  static getConfigElement() {
    return document.createElement("zwave-mini-card-editor");
  }

  connectedCallback() {
    super.connectedCallback();
    (this._foldWatch ??= watchOutside(this, (ev) => this._onFold(ev))).on();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._foldWatch?.off();
    this._zoomed = false;
  }

  getCardSize() {
    return this._zoomed ? super.getCardSize() : this._config?.illustration === false ? 2 : 3;
  }

  getGridOptions() {
    return this._zoomed ? super.getGridOptions() : { columns: 6, min_columns: 6 };
  }

  _setZoom(zoomed) {
    this._zoomed = zoomed;
    if (!zoomed) {
      this._detail = null;
      window.removeEventListener("keydown", this._onKey);
    }
    this._update(this._sig);
  }

  _click(ev) {
    if (!this._detail && ev.composedPath().some((n) => n.classList?.contains("zoom"))) {
      ev.stopPropagation();
      this._setZoom(!this._zoomed);
      if (ev.detail === 0) this.shadowRoot.querySelector(".zoom")?.focus({ preventScroll: true });
      return;
    }
    super._click(ev);
  }

  _extraStyle() {
    return this._zoomed ? ZOOM_STYLE : "";
  }

  _zoomButton(cls = "") {
    if (this._config.zoom === false) return "";
    const z = this._zoomed;
    const label = esc(this._t(z ? "zoom_out" : "zoom_in"));
    return `<button class="zoom ${cls}" title="${label}" aria-label="${label}" aria-expanded="${z}">${svgIcon(z ? ICONS.collapse : ICONS.expand)}</button>`;
  }

  _miniChip(icon, text, cls = "") {
    return `<span class="r${cls ? ` pill ${cls}` : ""}">${svgIcon(icon)}<span>${esc(text)}</span></span>`;
  }

  _render() {
    if (this._zoomed) return super._render();
    if (!this._infos.length && !Object.values(this._hass?.devices || {}).some(isZwaveDevice)) return this._noDevices();
    const s = this._summary;
    const chips = [this._miniChip(ICONS.zwave, this._p("nodes", s.total))];
    if (s.asleep) chips.push(this._miniChip(ICONS.sleep, this._p("asleep", s.asleep)));
    if (s.longRange) chips.push(this._miniChip(ICONS.zwave, this._t("count_lr", { n: this._num(s.longRange) })));
    if (this._disconnected()) chips.push(this._miniChip(ICONS.offline, this._t("disconnected"), "alert"));
    if (s.dead) chips.push(this._miniChip(ICONS.offline, this._p("dead", s.dead), "alert"));
    if (s.lowBattery) chips.push(this._miniChip(ICONS.battery, this._p("low_battery", s.lowBattery), "warn"));
    const title = esc(this._config.title || this._t("zwave"));
    if (this._config.illustration === false)
      return `<style>${COMMON_STYLE}${PILL_STYLE}${MINI_STYLE}</style>
      <ha-card>
        <div class="mini s-${this._level()}">
          ${this._badgeHtml()}
          <div class="body">
            <div class="mhead${this._fitCls("mini")}">
              <span class="title">${title}</span>${this._pill()}
              ${this._zoomButton()}
            </div>
            <div class="rs">${chips.join("")}</div>
          </div>
        </div>
      </ha-card>`;
    // The illustrated mini card: the full card's banner, its status pill after the title, the chips below.
    return `<style>${COMMON_STYLE}${BANNER_STYLE}${MINI_BANNER_STYLE}${ZOOM_STYLE}</style>
      <ha-card>
        <div class="mini">
          ${this._bannerOpen()}
            <div class="head">${this._badgeHtml()}<div class="titles${this._fitCls("banner")}"><div class="trow"><div class="name">${title}</div>${this._pill()}</div></div></div>
            ${this._zoomButton(this._night() ? "on-night" : "")}
          </div>
          <div class="rs">${chips.join("")}</div>
        </div>
      </ha-card>`;
  }
}

// ---------------------------------------------------------------------------
// Visual editors (ha-form)
// ---------------------------------------------------------------------------

// Options on by default (left out of the YAML while on), and off by default (left out while off).
const ON_BY_DEFAULT = ["show_title", "show_subtitle", "show_controller", "show_rebuild", "show_manage", "illustration", "zoom"];
const OFF_BY_DEFAULT = [];
const DEFAULTS = { sort: "name", columns: 2, battery_threshold: 20, illustration_theme: "auto" };
const LANGUAGES = [
  ["en", "English"], ["fr", "Français"], ["de", "Deutsch"], ["es", "Español"], ["sr", "Српски"], ["sr-Latn", "Srpski (latinica)"],
  ["it", "Italiano"], ["nl", "Nederlands"], ["pt", "Português (Portugal)"], ["pl", "Polski"], ["ro", "Română"], ["da", "Dansk"],
  ["sv", "Svenska"], ["bg", "Български"], ["ru", "Русский"], ["uk", "Українська"], ["hu", "Magyar"], ["sk", "Slovenčina"],
  ["cs", "Čeština"], ["sl", "Slovenščina"], ["lv", "Latviešu"], ["el", "Ελληνικά"],
];

class ZWaveCardEditor extends HTMLElement {
  static get mini() {
    return false;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _schema() {
    const tr = (k) => t(this._hass, this._config, k);
    const toggles = ["show_title", "show_subtitle", "show_controller", "show_rebuild", "show_manage", "illustration"];
    if (this.constructor.mini) toggles.push("zoom");
    return [
      { name: "title", selector: { text: {} } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "sort", selector: { select: { mode: "dropdown", options: ["name", "status"].map((v) => ({ value: v, label: tr(`sort_${v}`) })) } } },
          { name: "columns", selector: { number: { min: 1, max: 4, step: 1, mode: "box" } } },
          { name: "battery_threshold", selector: { number: { min: 1, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
          {
            name: "illustration_theme",
            selector: { select: { mode: "dropdown", options: ["auto", "day", "night"].map((v) => ({ value: v, label: tr(`theme_${v}`) })) } },
          },
        ],
      },
      { type: "grid", name: "", schema: toggles.map((name) => ({ name, selector: { boolean: {} } })) },
      {
        name: "language",
        selector: { select: { mode: "dropdown", options: [{ value: "", label: tr("lang_auto") }, ...LANGUAGES.map(([value, label]) => ({ value, label }))] } },
      },
    ];
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => t(this._hass, this._config, s.name === "title" ? "ed_title" : s.name);
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const config = { ...ev.detail.value };
        for (const [k, v] of Object.entries(config)) {
          // A minimal YAML: no empty values, no options left at their default.
          if (
            v === "" ||
            v === undefined ||
            v === null ||
            (ON_BY_DEFAULT.includes(k) && v === true) ||
            (OFF_BY_DEFAULT.includes(k) && v === false) ||
            (k in DEFAULTS && DEFAULTS[k] === v)
          )
            delete config[k];
        }
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    const data = { ...DEFAULTS, ...this._config };
    for (const k of ON_BY_DEFAULT) if (data[k] === undefined) data[k] = true;
    for (const k of OFF_BY_DEFAULT) if (data[k] === undefined) data[k] = false;
    this._form.hass = this._hass;
    // hass is pushed on every state change while the editor is open: data and schema are set again only when they
    // changed, so that the form does not redraw each time.
    const dataKey = JSON.stringify(data);
    if (dataKey !== this._dataKey) {
      this._dataKey = dataKey;
      this._form.data = data;
    }
    const schemaKey = lang(this._hass, this._config);
    if (schemaKey !== this._schemaKey) {
      this._schemaKey = schemaKey;
      this._form.schema = this._schema();
    }
  }
}

class ZWaveMiniCardEditor extends ZWaveCardEditor {
  static get mini() {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const define = (name, cls) => {
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
