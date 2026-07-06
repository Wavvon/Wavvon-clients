import { test, expect } from "@playwright/test";
import { expectInHub, uniqueName } from "./helpers/live";

// P7 — soundboard admin UI (soundboard.md): upload a clip, see it listed,
// delete it. The hub validates the OGG Opus container (OggS magic +
// OpusHead + ≥2 pages), so we build a minimal valid clip rather than
// asserting playback (not observable under fake audio).

// One Ogg page: 27-byte header + 1-byte segment table + payload (<255B).
function oggPage(granule: number, headerType: number, seq: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(28);
  header.write("OggS", 0, "ascii");
  header[4] = 0; // stream structure version
  header[5] = headerType;
  header.writeBigInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(1, 14); // serial
  header.writeUInt32LE(seq, 18); // page sequence
  header.writeUInt32LE(0, 22); // CRC (hub doesn't verify)
  header[26] = 1; // one lacing segment
  header[27] = payload.length; // segment length (<255)
  return Buffer.concat([header, payload]);
}

function minimalOggOpus(): Buffer {
  // OpusHead: magic + version(1) channels(1) preskip(2) rate(48000 LE) gain(2) mapping(0)
  const opusHead = Buffer.concat([
    Buffer.from("OpusHead"),
    Buffer.from([1, 1, 0, 0, 0x80, 0xbb, 0x00, 0x00, 0, 0, 0]),
  ]);
  // granule 48000 @ 48kHz ⇒ 1000ms duration (well under the 10s cap).
  const head = oggPage(0, 0x02, 0, opusHead);
  const audio = oggPage(48000, 0x04, 1, Buffer.from([0xfc, 0x00, 0x00, 0x00]));
  return Buffer.concat([head, audio]);
}

test("upload, list, and delete a soundboard clip", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: "Soundboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Soundboard" })).toBeVisible();

  const clipName = uniqueName("horn");
  // The admin page renders over the main app; scope to the soundboard
  // <section> (the Name label isn't tied to its input via htmlFor).
  const section = page.locator("section", {
    has: page.getByRole("heading", { name: "Soundboard" }),
  });
  await section.getByRole("textbox").fill(clipName);
  await section.locator('input[type="file"]').setInputFiles({
    name: "horn.ogg",
    mimeType: "audio/ogg",
    buffer: minimalOggOpus(),
  });
  await page.getByRole("button", { name: "Upload clip" }).click();

  // Clip appears in the table with its computed 1.0s duration.
  const row = page.locator("tr", { hasText: clipName });
  await expect(row).toBeVisible({ timeout: 10000 });
  await expect(row).toContainText("1.0s");

  // Delete it (native confirm → accept).
  page.on("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(row).toBeHidden({ timeout: 10000 });
});
