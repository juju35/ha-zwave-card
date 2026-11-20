// Renders the cards with the mock network (scripts/screenshots/mock.mjs) into screenshots/*.png, light and dark.
// Usage: npm install && npm run build && node scripts/screenshots/stills.mjs
// The animations are paused at a chosen moment of the banner's 6 s cycle (`at`).
import { cardClip, freeze, launch, mountCard, openPage, root, writeIfChanged } from "./harness.mjs";
import { FULL, SHOTS } from "./list.mjs";

const browser = await launch();
for (const s of SHOTS) {
  const width = s.width ?? FULL;
  const page = await openPage(browser, { theme: s.theme, width, label: s.file });
  await mountCard(page, { tag: s.tag, config: s.config, dark: s.theme === "dark", hass: s.hass, clicks: s.clicks });
  await page.waitForTimeout(300);
  await freeze(page, s.at ?? 0.25);
  const out = `screenshots/${s.file}.png`;
  const png = await page.screenshot({ clip: await cardClip(page, width), animations: "allow" });
  console.log(`${out}${(await writeIfChanged(page, `${root}${out}`, png)) ? "" : " (unchanged)"}`);
  await page.close();
}
await browser.close();
