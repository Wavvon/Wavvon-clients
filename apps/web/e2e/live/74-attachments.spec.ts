import { test, expect, type Page } from "@playwright/test";
import { expectInHub, createChannel, hubApi, uniqueName } from "./helpers/live";

// P74 -- attachments stored on the hub. A decoded image (naturalWidth > 0)
// is the only thing that proves the bytes were served and re-encoded; a
// rendered <img> tag passes with a broken URL.

async function imageBytes(page: Page, type: "image/png" | "image/jpeg"): Promise<Buffer> {
  const b64 = await page.evaluate(async (type) => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 48;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#c07020";
    ctx.fillRect(0, 0, 64, 48);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (const b of buf) s += String.fromCharCode(b);
    return btoa(s);
  }, type);
  return Buffer.from(b64, "base64");
}

async function sendWith(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.locator("form.input-area input[type=file]").setInputFiles(files);
  await page.getByPlaceholder(/^Message #/).first().press("Enter");
}

async function allDecoded(page: Page, count: number) {
  await expect(page.locator(".message-attachment-img")).toHaveCount(count, { timeout: 15000 });
  await expect
    .poll(() => page.$$eval(".message-attachment-img", (els) => els.every((e) => (e as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
}

test("PNG and JPEG attachments render from the hub", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  const channel = await createChannel(page, uniqueName("att").toLowerCase().slice(0, 20));
  await page.getByRole("button", { name: new RegExp(channel) }).first().click();

  await sendWith(page, [
    { name: "a.png", mimeType: "image/png", buffer: await imageBytes(page, "image/png") },
    { name: "b.jpg", mimeType: "image/jpeg", buffer: await imageBytes(page, "image/jpeg") },
  ]);
  await allDecoded(page, 2);
  const srcs = await page.$$eval(".message-attachment-img", (els) => els.map((e) => (e as HTMLImageElement).src));
  expect(srcs.every((s) => s.includes("/uploads/"))).toBe(true);

  // Send as file keeps the original and offers it as a download.
  await page.locator("form.input-area input[type=file]").setInputFiles({
    name: "orig.png",
    mimeType: "image/png",
    buffer: await imageBytes(page, "image/png"),
  });
  await page.getByLabel("Send as file").check();
  await expect(page.getByText(/location and camera details stay/).first()).toBeVisible();
  await page.getByPlaceholder(/^Message #/).first().press("Enter");
  const link = page.locator(".message-attachment-file", { hasText: "orig.png" });
  await expect(link).toBeVisible({ timeout: 15000 });
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toBe("orig.png");

  // An executable asks first, and only downloads once confirmed.
  const upload = page.waitForResponse((r) => r.url().includes("/upload") && r.request().method() === "POST");
  await sendWith(page, [{ name: "setup.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ not really") }]);
  const uploaded = (await (await upload).json()) as { id: string };
  const exe = page.locator(".message-attachment-file", { hasText: "setup.exe" });
  await expect(exe).toBeVisible({ timeout: 15000 });
  await exe.click();
  const modal = page.locator(".confirm-modal");
  await expect(modal).toBeVisible();
  await modal.locator(".confirm-modal-actions button").first().click();
  await expect(modal).not.toBeVisible();
  await exe.click();
  const [exeDownload] = await Promise.all([
    page.waitForEvent("download"),
    modal.locator(".confirm-modal-actions button").last().click(),
  ]);
  expect(exeDownload.suggestedFilename()).toBe("setup.exe");

  // A moderator removal reads "attachment removed" after a reload.
  await hubApi(page, `/uploads/${uploaded.id}`, { method: "DELETE" });
  await page.reload();
  await expectInHub(page);
  await page.getByRole("button", { name: new RegExp(channel) }).first().click();
  await expect(page.getByText("Attachment removed: setup.exe")).toBeVisible({ timeout: 15000 });
});

test("a forum post with an attachment renders it", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  const forum = await createChannel(page, uniqueName("frm").toLowerCase().slice(0, 20), "Forum");
  await page.getByRole("button", { name: new RegExp(forum) }).first().click();

  await page.getByRole("button", { name: "New post" }).click();
  await page.getByPlaceholder("Post title").fill("with picture");
  await page.getByPlaceholder("Write your post…").fill("see attached");
  await page.locator(".forum-composer input[type=file]").setInputFiles({
    name: "p.png",
    mimeType: "image/png",
    buffer: await imageBytes(page, "image/png"),
  });
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await allDecoded(page, 1);
});
