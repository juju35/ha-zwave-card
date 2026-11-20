// Records the illustration's animations into screenshots/*.gif, light and dark (needs ffmpeg).
// Usage: npm install && npm run build && node scripts/screenshots/animations.mjs
// The CSS animations are paused and stepped frame by frame over the banner's 6 s cycle (every animation of the cards
// lasts a divisor of it), so every GIF loops cleanly at its real speed whatever the machine's speed.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cardClip, freeze, launch, mountCard, openPage, PERIOD, root } from "./harness.mjs";
import { GIFS } from "./list.mjs";

const FPS = 15;
const frameName = (i) => `f${String(i).padStart(3, "0")}.png`;

// Every decoded frame (RGBA) and its timing, as ffmpeg's per-frame MD5 list: equal lists, same animation.
const decodedFrames = (file) =>
  execFileSync("ffmpeg", ["-loglevel", "error", "-i", file, "-pix_fmt", "rgba", "-f", "framemd5", "-"], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .join("\n");

// A deterministic GIF: the palette computed from the frames only, ordered (Bayer) dithering, bit-exact muxing. The file
// in place is only replaced when its decoded frames differ.
const encode = (dir, out, width) => {
  const gif = join(dir, "out.gif");
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(dir, "f%03d.png"),
    "-vf", `scale=${width + 32}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
    "-fflags", "+bitexact", "-flags", "+bitexact", "-loop", "0", gif,
  ]);
  const target = `${root}${out}`;
  const same = existsSync(target) && decodedFrames(target) === decodedFrames(gif);
  if (!same) copyFileSync(gif, target);
  console.log(`${out}${same ? " (unchanged)" : ""}`);
};

const browser = await launch();
for (const g of GIFS) {
  for (const theme of ["light", "dark"]) {
    const suffix = theme === "dark" ? "-dark" : "";
    const page = await openPage(browser, { theme, width: g.width, label: `${g.name}${suffix}` });
    await mountCard(page, { tag: g.tag, config: g.config, dark: theme === "dark", hass: g.hass });
    await page.waitForTimeout(300);
    const clip = await cardClip(page, g.width, { banner: g.banner });
    const dir = mkdtempSync(join(tmpdir(), "mc-frames-"));
    const frames = Math.round((FPS * PERIOD) / 1000);
    for (let i = 0; i < frames; i++) {
      await freeze(page, i / frames);
      await page.screenshot({ path: join(dir, frameName(i)), clip, animations: "allow" });
    }
    encode(dir, `screenshots/${g.name}${suffix}.gif`, g.width);
    rmSync(dir, { recursive: true });
    await page.close();
  }
}
await browser.close();
