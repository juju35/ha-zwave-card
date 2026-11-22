# Changelog

## 1.1.2 - 2026-11-22

### Performance
- Card picker: the previews are back (`preview: true`), and light. Each card's preview is drawn only once it scrolls into view of Home Assistant's card picker, which otherwise builds the preview of every card at once: until then it holds Home Assistant's state (no render, no history request, no animation). On a dashboard or in the card editor the card is drawn as before.

## 1.1.1 - 2026-11-22

### Performance
- Card picker: the cards no longer ask Home Assistant for a live preview (`preview: false` in `window.customCards`). The picker drew every card at once (history requests, animations), which made the list slow to open; it now shows each card's description instead.

## 1.1.0 - 2026-11-21

### Features
- Tiles in the look of the other ha-* cards (room-overview-card): the icon pastille and the state line in the node's state colour — green when healthy, grey asleep, amber for a low battery, red when dead — and the name in bold; the controller tile too. The background stays neutral.
- Banner: a Z-Wave JS driver disconnected from its controller now shows in the scene — the controller pulses red, its links turn grey and dashed, no packet travels (on both cards; the scene stays hidden at 300 px and below). A GIF of it, light and dark, in the README.

### Fixes
- No more page jumps on state updates: an update of an entity the card does not use changes nothing in it, and an update of a node only patches that tile's text in place. The header's status pill is no longer measured again (its classes removed and set back) after every render: its fit is kept with what it depends on — width, title, label — and redrawn as it was.
- Readings (power, signal, battery, the rebuild's progress) use tabular figures, so they keep their width as their digits change.
- Compact mini card (`illustration: false`): the status pill stays beside a short title, left of the detail button, instead of always going under it (the button's auto margin was counted as width taken).
- A failed `zwave_js/network_status` answer (integration unloaded, server gone) drops the last one: the node statuses and the « connected » driver no longer stay shown as they were; the statuses come from the nodes' entities meanwhile.

### Maintenance
- Two unused translations removed (`zwave_plus`, `region`), in every language.
- README: screenshots of a routes rebuild in progress, of a disconnected driver and of the compact mini card.
- Tests: a browser test of state updates (no DOM change for other entities, one tile patched in place, a steady height) and of the compact mini card's pill; the card's source now counts in the coverage report.

## 1.0.0 - 2026-11-21

### Features
- **Z-Wave Card** (`custom:zwave-card`): every node of Home Assistant's [Z-Wave integration](https://www.home-assistant.io/integrations/zwave_js/) (Z-Wave JS), found in the device registry, as a 56 px tile: the icon of its main entity, its name, a state line (its state with its power, signal or battery; « Asleep · 88% » for a sleeping node), its security tag (S2 Access, S2 Auth, S2, S0) and an LR tag for a Long Range node, and a status dot. Healthy tiles stay neutral; only issues are coloured: a low battery in amber, a dead node in red (« Dead · 3 h »).
- Animated 90 px banner in the style of the other network cards: a house section with the Z-Wave controller at its centre linked to six devices, packets travelling along the links and a pulsing ping around the controller, on a blue Z-Wave network ground strip; a sleeping battery device dozes (dashed link, a « z » floating up), a dead node turns its device and link red, the device blinking. Night banner with the dark theme, or forced with `illustration_theme: day | night`; `illustration: false` gives a classic header; `prefers-reduced-motion` is honoured.
- The Z-Wave badge and a status pill (*Healthy*, *2 issues*, *No devices*) in the colour of the network's status: blue when healthy, amber for a low battery, red for a dead node or a disconnected driver.
- Banner statistics: Z-Wave JS version, node count and RF region; status chips under the banner (alive, dead, asleep, low battery) with the progress of a routes rebuild on the right.
- Controller tile: manufacturer and model, home ID, SDK and RF region, its node count, « Driver disconnected » in red; a click opens the Z-Wave JS page (administrators). The data comes from the integration's `zwave_js/network_status` command, asked once a minute and shared by every card of the page; for other users, the statuses come from the nodes' Node status sensors.
- Node popup at the top of the card: node ID, status, manufacturer and product, firmware, protocol (Z-Wave or Long Range), security class, Z-Wave Plus version, signal, battery, last seen, and a button to the device page; closed by a click elsewhere, Escape, or when the card leaves the page.
- « Rebuild routes » button (administrators, driver connected): a confirmation popup at the top of the card, then `zwave_js/begin_rebuilding_routes` on the controller's config entry; « Stop rebuilding » while a rebuild runs (`zwave_js/stop_rebuilding_routes`); the network status is asked again at once, and a failure is said in the popup.
- « Z-Wave JS settings » button (administrators), opening the Z-Wave JS page where devices are added.
- **Z-Wave Mini Card** (`custom:zwave-mini-card`): the full card's banner with the Z-Wave badge and the network status, the node, asleep and Long Range counts and the issues as chips, with a detail button that unfolds the full card and folds back on a click elsewhere.
- Options: `title`, `show_title`, `show_subtitle`, `sort` (name, issues first), `columns`, `battery_threshold`, `show_controller`, `show_rebuild`, `show_manage`, `illustration`, `illustration_theme`, `exclude` (YAML only), `zoom` (mini card) and `language`; visual editor for both cards, options left at their default kept out of the YAML.
- English, French, German, Spanish, Serbian (Cyrillic and Latin), Italian, Dutch, European Portuguese, Polish, Romanian, Danish, Swedish, Bulgarian, Russian, Ukrainian, Hungarian, Slovak, Czech, Slovenian, Latvian and Greek; English in the bundle, each other language loaded on demand.
