// The screenshots are rendered by the CI (Screenshots workflow) and committed to the pull request: this test does not
// compare them, it only flags a file of screenshots/ that no script produces any more (an orphan), and one the README
// does not show. It also checks that the scripts only rewrite a capture when its decoded pixels differ (PNG bytes vary
// from one run or machine to the next), on every channel; that part needs Chromium (`npx playwright install chromium`).
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GIFS, SHOTS } from "../scripts/screenshots/list.mjs";

const dir = new URL("../screenshots/", import.meta.url);
const produced = new Set([
  ...SHOTS.map((s) => `${s.file}.png`),
  ...GIFS.flatMap((g) => [`${g.name}.gif`, `${g.name}-dark.gif`]),
]);

test("every file of screenshots/ is produced by the scripts (no orphan)", () => {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith(".")) : [];
  assert.deepEqual(files.filter((f) => !produced.has(f)), []);
});

test("every capture the scripts produce is shown in the README, with its dark twin", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  for (const f of produced) assert.ok(readme.includes(`screenshots/${f}`), f);
});

let harness;
try {
  harness = await import("../scripts/screenshots/harness.mjs");
} catch {}
const browser = await harness?.launch().catch(() => null);

test("writeIfChanged compares every channel of the decoded pixels", { skip: !browser && "no Chromium" }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), "mc-shots-"));
  const page = await browser.newPage({ viewport: { width: 40, height: 20 } });
  try {
    // Opaque captures: same alpha everywhere, only red, green or blue differs.
    const shot = async (color) => {
      await page.setContent(`<body style="margin:0;background:${color}"></body>`);
      return page.screenshot();
    };
    const [red, green, blue, blue2] = [await shot("#ff0000"), await shot("#00ff00"), await shot("#0000ff"), await shot("#0000fe")];
    const path = join(tmp, "shot.png");
    writeFileSync(path, red);
    assert.equal(await harness.writeIfChanged(page, path, green), true, "red → green: rewritten");
    assert.deepEqual(readFileSync(path), green);
    assert.equal(await harness.writeIfChanged(page, path, blue), true, "green → blue: rewritten");
    assert.equal(await harness.writeIfChanged(page, path, blue2), true, "one step of blue: rewritten");
    assert.deepEqual(readFileSync(path), blue2);
    // The same pixels encoded again (other bytes): the file in place is kept.
    assert.equal(await harness.writeIfChanged(page, path, await shot("#0000fe")), false, "same pixels: kept");
    assert.deepEqual(readFileSync(path), blue2);
  } finally {
    await page.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test.after(() => browser?.close());
