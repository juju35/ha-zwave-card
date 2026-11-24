// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export const COMMON_STYLE = `
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
export let textCtx;
export const textWidth = (el) => {
  const cs = getComputedStyle(el);
  textCtx ??= document.createElement("canvas").getContext?.("2d");
  if (!textCtx) return el.scrollWidth;
  textCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  return Math.max(el.scrollWidth, textCtx.measureText(el.textContent.trim()).width + pad);
};

// The status pill (a dot and its label in the badge's colour), on the banner, the classic header and the mini card.
export const PILL_STYLE = `
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
export const BANNER_STYLE = `
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

export const FULL_STYLE = `
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
export const MINI_CHIPS_STYLE = `
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
export const MINI_STYLE = `
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
export const MINI_BANNER_STYLE = `
${MINI_CHIPS_STYLE}  .rs { padding: 8px 10px 10px 8px; margin-left: 0; }
`;

// The zoomed mini card: the full card, with the detail button over its banner.
export const ZOOM_STYLE = `
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
