import { test, expect } from "@playwright/test";
import { expectInHub } from "./helpers/live";
import { readFileSync } from "node:fs";

// P8 — personal data export (data-export.md): the Account settings tab
// assembles an encrypted archive and downloads it. Verifies the mismatch
// guard and that a non-empty encrypted file is produced.

test("full archive export downloads an encrypted file", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  await page.locator(".btn-icon-gear").click();
  await page.getByRole("button", { name: "Manage accounts", exact: true }).click();
  await page.getByRole("button", { name: "Export full archive…" }).click();

  const passphrase = page.getByPlaceholder("Passphrase", { exact: true });
  const confirm = page.getByPlaceholder("Confirm passphrase");
  const save = page.getByRole("button", { name: "Save archive" });

  // Mismatched passphrases are rejected before any export.
  await passphrase.fill("correct horse battery");
  await confirm.fill("wrong horse");
  await save.click();
  await expect(page.getByText("Passphrases don't match.")).toBeVisible();

  // Matching passphrases produce an encrypted download.
  await confirm.fill("correct horse battery");
  const downloadPromise = page.waitForEvent("download");
  await save.click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^wavvon-archive-\d{4}-\d{2}-\d{2}\.json\.enc$/);
  const path = await download.path();
  const bytes = readFileSync(path);
  // Encrypted blob: salt + nonce + ciphertext — comfortably non-trivial.
  expect(bytes.length).toBeGreaterThan(32);
});
