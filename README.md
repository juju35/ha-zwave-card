# ha-zwave-card

[![Marketplace](https://img.shields.io/badge/Marketplace-Custom-41BDF5.svg)](https://www.home-assistant.io/integrations/marketplace/)
[![HACS Validation](https://github.com/juju35/ha-zwave-card/actions/workflows/hacs.yml/badge.svg)](https://github.com/juju35/ha-zwave-card/actions/workflows/hacs.yml)
[![Validate](https://github.com/juju35/ha-zwave-card/actions/workflows/validate.yml/badge.svg)](https://github.com/juju35/ha-zwave-card/actions/workflows/validate.yml)
[![Lint](https://github.com/juju35/ha-zwave-card/actions/workflows/lint.yml/badge.svg)](https://github.com/juju35/ha-zwave-card/actions/workflows/lint.yml)
[![Release](https://img.shields.io/github/v/release/juju35/ha-zwave-card)](https://github.com/juju35/ha-zwave-card/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/juju35/ha-zwave-card/blob/main/LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/julienstep9)

<p align="center"><img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/images/icon.svg" alt="Z-Wave Card" width="120"></p>

<p align="center">
  <a href="https://z-wavealliance.org/"><img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/images/zwave.png" alt="Z-Wave" width="48"></a>
</p>

Your **Z-Wave network** at a glance in Home Assistant: every Z-Wave node with its status (alive, asleep, dead), its security class and its protocol (Z-Wave or Long Range), the controller it hangs on, under an animated banner where the Z-Wave controller talks to its devices.

The cards are built on top of Home Assistant's [Z-Wave integration](https://www.home-assistant.io/integrations/zwave_js/) (Z-Wave JS): add the card, and your Z-Wave devices are **found automatically** in the device registry, whatever their names.

[![Open your Home Assistant instance and open a repository inside the Marketplace.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=juju35&repository=ha-zwave-card&category=plugin)

| Z-Wave Card | Z-Wave Mini Card |
|---|---|
| <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-dark.png"><img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card.png" alt="Z-Wave card" width="400"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/mini-card-dark.png"><img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/mini-card.png" alt="Z-Wave mini card" width="380"></picture> |

## Features

- Two cards: a full **Z-Wave Card** and a compact **Z-Wave Mini Card**, of type `custom:zwave-card` and `custom:zwave-mini-card`
- An animated 90 px banner, in the style of the other network cards: a house section with the Z-Wave controller at its centre linked to six devices (light, plug, thermometer, motion sensor, lock, blind), packets travelling along the links, on a blue network ground strip; a sleeping battery device dozes (its link dashed, a « z » floating up), when a node is dead, a device and its link turn red and the device blinks, and when the Z-Wave JS driver is disconnected the controller pulses red, its links turn grey and dashed and no packet travels
- The Z-Wave badge takes the colour of the network's status: blue when healthy, amber for a low battery, red for a dead node or a disconnected driver, grey without any node
- The banner's statistics: the Z-Wave JS version, the number of nodes and the RF region of the controller (« EU LR »)
- Status chips under the banner: **8 / 9 alive**, **1 dead** (red), **2 asleep** (grey), **1 low battery** (amber), and the progress of a routes rebuild on the right (« Rebuilding routes · 44% »)
- A **controller** tile: manufacturer and model, home ID, SDK version and RF region, with its node count; « Driver disconnected » in red when Z-Wave JS lost its controller; a click opens the Z-Wave JS page (administrators)
- One 56 px tile per Z-Wave node, two per row: the icon of its main entity, its name, a state line and its tags — the **security class** (**S2 Access**, **S2 Auth**, **S2** in green, **S0** in amber) and **LR** (purple) for a Long Range node — with a status dot. The state line shows the main entity's state with one reading: the power of a plug, the signal (« −67 dBm »), or the battery; a sleeping node says « Asleep · 88% »
- The tiles share the look of the other ha-* cards: a neutral background, the icon pastille and the state line in the node's state colour — green when healthy, grey asleep, amber for a low battery (« Battery 17% »), red when dead (« Dead · 3 h »)
- Click a node for its detail, in a popup at the top of the card: node ID, status, manufacturer and product, firmware, protocol, security class, Z-Wave Plus version, signal, battery, last seen, and a button to the device page; it closes with its button, a click anywhere else, Escape, or when the card leaves the page
- A **Rebuild routes** button (administrators): after a confirmation in a popup at the top of the card, it starts a routes rebuild on the controller (`zwave_js/begin_rebuilding_routes`); while a rebuild runs it becomes **Stop rebuilding** (`zwave_js/stop_rebuilding_routes`), and its progress shows on the right of the status chips
- A **Z-Wave JS settings** button (administrators) opening the Z-Wave JS page, where devices are added
- Mini card: the same 90 px banner with the Z-Wave badge, the status of the network (« Healthy », « 2 issues »), the node, asleep and Long Range counts and the issues as chips, and a detail button at the top right that unfolds the full card; a click anywhere outside the card folds it back
- Night banner with the dark theme of Home Assistant (a light theme keeps the day banner after sunset), or forced with `illustration_theme`; `illustration: false` for a classic header with a round icon
- Visual editor for both cards; options left at their default are kept out of the YAML
- Light and dark themes, `prefers-reduced-motion` honoured (everything stays still)
- English, French, German, Spanish, Serbian (Cyrillic and Latin), Italian, Dutch, European Portuguese, Polish, Romanian, Danish, Swedish, Bulgarian, Russian, Ukrainian, Hungarian, Slovak, Czech, Slovenian, Latvian and Greek
- Single file, no external dependency: the banner and the icons are drawn in SVG

## Supported integrations

| Integration | What the cards show |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/images/zwave.png" alt="" width="20"> [Z-Wave](https://www.home-assistant.io/integrations/zwave_js/) (Z-Wave JS) | The Z-Wave devices of the device registry and their entities (state, battery, power, signal strength, node status, last seen), and the integration's `zwave_js/network_status` websocket command (administrators): the controller (home ID, SDK, RF region, driver state, routes rebuild) and every node's status, security class and Z-Wave Plus version; the **Rebuild routes** button calls `zwave_js/begin_rebuilding_routes` and `zwave_js/stop_rebuilding_routes` |

## Prerequisites

- Home Assistant 2024.8 or later
- The [Z-Wave integration](https://www.home-assistant.io/integrations/zwave_js/), connected to a Z-Wave JS server (the Z-Wave JS add-on or app, or Z-Wave JS UI), with at least one device
- The network status (controller details, security classes), the rebuild and the settings buttons need an administrator account; for other users the statuses come from the nodes' **Node status** sensors, else from their entities (a dead node's entities are unavailable)

## Installation

### Via the Marketplace (recommended)

Click the button below to add the repository directly:

[![Add to the Marketplace](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=juju35&repository=ha-zwave-card&category=plugin)

Then click **Install**, and reload your browser when the Marketplace asks you to.

Or manually:

1. Open **Settings → Marketplace → Add from link** (top right; this needs a GitHub account connected)
2. Add `https://github.com/juju35/ha-zwave-card` — Category: **Dashboard** (Lovelace)
3. Open **Z-Wave Card** and click **Install**
4. Clear your browser cache and refresh

The Marketplace registers the dashboard resource for you (`/local/community/ha-zwave-card/zwave-card.js`); the single file provides both cards.

### Manual

1. Download `zwave-card.js` and the `zwave-card.i18n.*.js` translation files from the [latest release](https://github.com/juju35/ha-zwave-card/releases/latest)
2. Copy them all to `/config/www/` (without the translation files, the cards show in English)
3. Go to **Settings → Dashboards → ⋮ → Resources** → Add resource:
   - URL: `/local/zwave-card.js`
   - Type: **JavaScript Module**
4. Clear your browser cache and refresh

## Configuration

### Visual editor

Edit a dashboard, click **Add card** and search for **Z-Wave Card** or **Z-Wave Mini Card**. The Z-Wave devices are found by themselves; set the title, the sort order, the columns, the low battery threshold, the banner theme, the parts to show and the language. The preview updates live, and options left at their default are kept out of the generated YAML. The mini card's editor also has the full card's options, used by its unfolded view. Only `exclude`, a list, is set in YAML.

### Minimal

```yaml
type: custom:zwave-card
```

```yaml
type: custom:zwave-mini-card
```

### Full options

```yaml
type: custom:zwave-card
title: Z-Wave network
show_title: true
show_subtitle: true
sort: status
columns: 2
battery_threshold: 20
show_controller: true
show_rebuild: true
show_manage: true
illustration: true
illustration_theme: auto
exclude:
  - Test plug
language: en
```

```yaml
type: custom:zwave-mini-card
title: Z-Wave
sort: status
zoom: true
```

### Options reference

| Option | Card | Default | Description |
|---|---|---|---|
| `title` | both | `Z-Wave network` / `Z-Wave` | Card title (the banner's name; the mini card's title) |
| `show_title` | both | `true` | Show the title in the header (e.g. `false` under a section heading of your own); the status pill stays |
| `show_subtitle` | both | `true` | Show the stats line under the title (Z-Wave JS version, nodes, RF region) |
| `sort` | both | `name` | Order of the node tiles: `name`, or `status` for the issues first (dead, then low battery) |
| `columns` | both | `2` | Node tiles per row (1 to 4); a card narrower than 390 px shows one per row |
| `battery_threshold` | both | `20` | A battery below this percentage is a low battery (a battery binary sensor that is on is one too) |
| `show_controller` | both | `true` | The controller tile |
| `show_rebuild` | both | `true` | The **Rebuild routes** / **Stop rebuilding** button, with its confirmation (shown to administrators only, while the driver is connected) |
| `show_manage` | both | `true` | The **Z-Wave JS settings** button (shown to administrators only) |
| `illustration` | both | `true` | The animated banner as header (both cards); `false` for a classic header with a round icon |
| `illustration_theme` | both | `auto` | `auto` (follows the Home Assistant theme: night with a dark theme, day with a light theme), `day` or `night` |
| `exclude` | both | — | **YAML only.** Devices left out of the cards: a list of device ids or device names |
| `zoom` | mini | `true` | Detail button at the top right: unfolds the full card and back (`false` removes it). The full card's options above apply to the unfolded view and are also set in the mini card's visual editor |
| `language` | both | Auto | Force language: `en`, `fr`, `de`, `es`, `sr`, `sr-Latn`, `it`, `nl`, `pt`, `pl`, `ro`, `da`, `sv`, `bg`, `ru`, `uk`, `hu`, `sk`, `cs`, `sl`, `lv` or `el` (auto-detects from HA settings) |

## Screenshots

### Animations

The links from the Z-Wave controller to its devices carry packets, the sleeping device dozes, and the packets slide along the strip, in a 6-second loop. With `prefers-reduced-motion`, everything stays still.

A healthy network (a battery device asleep):

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/banner.gif" alt="banner animation" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/banner-dark.gif" alt="banner animation, dark theme" width="400"> |

A dead node — its device and its link turn red, the device blinks:

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/banner-dead.gif" alt="banner animation with a dead node" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/banner-dead-dark.gif" alt="banner animation with a dead node, dark theme" width="400"> |

The Z-Wave JS driver disconnected from its controller — the controller pulses red, its links turn grey and dashed, no packet travels:

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/banner-disconnected.gif" alt="banner animation with the driver disconnected" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/banner-disconnected-dark.gif" alt="banner animation with the driver disconnected, dark theme" width="400"> |

### Z-Wave Card

One node dead, two asleep, one low battery:

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card.png" alt="Z-Wave card" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-dark.png" alt="Z-Wave card, dark theme" width="400"> |

Every node alive or asleep:

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-healthy.png" alt="healthy network" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-healthy-dark.png" alt="healthy network, dark theme" width="400"> |

Detail of a node, at the top of the card:

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-detail.png" alt="node detail" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-detail-dark.png" alt="node detail, dark theme" width="400"> |

Confirmation of a routes rebuild, at the top of the card:

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-rebuild.png" alt="routes rebuild confirmation" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-rebuild-dark.png" alt="routes rebuild confirmation, dark theme" width="400"> |

A routes rebuild in progress (its progress on the right of the status chips, **Stop rebuilding**):

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-rebuilding.png" alt="routes rebuild in progress" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-rebuilding-dark.png" alt="routes rebuild in progress, dark theme" width="400"> |

The Z-Wave JS driver disconnected from its controller:

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-disconnected.png" alt="driver disconnected" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-disconnected-dark.png" alt="driver disconnected, dark theme" width="400"> |

Classic header (`illustration: false`, here with `sort: status`):

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-classic.png" alt="classic header" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/card-classic-dark.png" alt="classic header, dark theme" width="400"> |

### Z-Wave Mini Card

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/mini-card.png" alt="mini card with issues" width="380"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/mini-card-dark.png" alt="mini card with issues, dark theme" width="380"> |
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/mini-card-healthy.png" alt="healthy mini card" width="380"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/mini-card-healthy-dark.png" alt="healthy mini card, dark theme" width="380"> |

Classic header (`illustration: false`):

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/mini-card-classic.png" alt="mini card, classic header" width="380"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/mini-card-classic-dark.png" alt="mini card, classic header, dark theme" width="380"> |

Unfolded with its detail button (top right; click it again or anywhere outside the card to go back):

| Light | Dark |
|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/mini-card-zoom.png" alt="mini card unfolded" width="400"> | <img src="https://raw.githubusercontent.com/juju35/ha-zwave-card/main/screenshots/mini-card-zoom-dark.png" alt="mini card unfolded, dark theme" width="400"> |

## How it works

### Nodes

The cards read the device registry: a Z-Wave device carries a `zwave_js` identifier, `<home id>-<node id>`. The controller is the network's own node (node 1, or the controller's node id given by the network status); every other device is a node tile. A node's main entity is the first of its entities that is not a diagnostic or configuration entity, a lock, light, cover or climate before a switch, a binary sensor before a sensor; its battery, power and signal strength come from its other entities. Node ids from 256 up are Long Range nodes.

### Status and security

For an administrator, the cards ask the integration's `zwave_js/network_status` websocket command for each controller, then every minute: the controller's home ID, SDK, RF region, driver state and routes rebuild, and the status (alive, awake, asleep, dead), security class and Z-Wave Plus version of every node. The answers are shared by every card of the page. For other users, a node's status is its **Node status** sensor, else « dead » when Home Assistant marks all its entities unavailable (Z-Wave JS does for a dead node); the security tags need the network status.

A dead node is an issue (red), with the time since it died; a battery under the threshold too (amber). A sleeping node is healthy: battery devices sleep most of the time and wake up at their wake-up interval.

### Narrow cards

The full card fits down to 8 columns of a sections view (about 208 px on a phone), the mini card down to 6 columns (about 156 px). Under 390 px the node tiles go one per row; under 300 px the banner keeps its sky and ground strip for its texts, without the scene. In a container sized by its content, the cards take a width of 400 px instead of collapsing.

## Development

```bash
npm install
npm run build        # bundles src/zwave-card.js into dist/zwave-card.js and stamps the version of package.json
npm run check        # builds and checks the bundle (run in CI)
npm test             # unit tests, and the browser layout tests (Chromium through Playwright)
npm run screenshots  # renders the cards with mock data (scripts/screenshots/mock.mjs) into screenshots/, and the animation GIFs (needs ffmpeg)
```

`dist/` is not committed: `npm run build` creates it locally, CI builds it on every push, and the release workflow attaches the built file to the release, which is where the Marketplace installs it from. The **Screenshots** workflow renders the captures again on every pull request that changes the sources and commits them to its branch.

### Releasing

1. Bump `version` in `package.json` (and `package-lock.json`)
2. Add a `## <version>` section at the top of [CHANGELOG.md](https://github.com/juju35/ha-zwave-card/blob/main/CHANGELOG.md)
3. Merge to `main`: the **Release** workflow builds the card, creates the tag and the GitHub release with the changelog section as notes, and attaches `zwave-card.js` and its translation files

## Translations

The cards auto-detect the language from your Home Assistant settings. Currently supported:

| Language | Code |
|---|---|
| English | `en` |
| Français | `fr` |
| Deutsch | `de` |
| Español | `es` |
| Српски (Serbian, Cyrillic) | `sr` |
| Srpski (Serbian, Latin) | `sr-Latn` |
| Italiano | `it` |
| Nederlands | `nl` |
| Português (Portugal) | `pt` |
| Polski | `pl` |
| Română | `ro` |
| Dansk | `da` |
| Svenska | `sv` |
| Български | `bg` |
| Русский | `ru` |
| Українська | `uk` |
| Magyar | `hu` |
| Slovenčina | `sk` |
| Čeština | `cs` |
| Slovenščina | `sl` |
| Latviešu | `lv` |
| Ελληνικά | `el` |

Contributions for additional languages are welcome!

## Contributing

Issues and pull requests are welcome: bug reports with your card configuration and a browser console extract, ideas, and translation fixes. Before opening a pull request, run `npm test` and `npm run check`; the screenshots are rendered by the CI on the pull request.

## Credits

Node data from Home Assistant's [Z-Wave integration](https://www.home-assistant.io/integrations/zwave_js/) and [Z-Wave JS](https://github.com/zwave-js/node-zwave-js). Z-Wave and the Z-Wave logo are trademarks of Silicon Labs and the Z-Wave Alliance; this project is not affiliated with either. The devices, vendors and networks of the screenshots are fictional.

## License

[MIT](https://github.com/juju35/ha-zwave-card/blob/main/LICENSE)

## Support

If you find this project useful, you can support its development:

<a href="https://buymeacoffee.com/julienstep9"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="50"></a>
