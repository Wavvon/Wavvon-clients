import { test, expect } from "@playwright/test";
import { HUB_URL } from "./helpers/live";

// P58 — the hub's voice WebTransport cert, as a browser sees it.
//
// Every other voice spec asserts on roster state the hub pushes over the
// WebSocket, so all of them pass identically whether the transport connected
// or not — with `voice_wt_url` null they pass too. That left one thing nobody
// had ever checked: whether Chromium accepts the hub's *self-signed* cert
// through `serverCertificateHashes` at all. It does, and the negative control
// below is what makes that a measurement rather than a hope.
//
// This proves the handshake, not audio. Two clients on a real network remain
// the only thing that proves audio.

interface Info {
  voice_wt_url: string | null;
  voice_cert_hash: string | null;
}

/** Open a WebTransport from inside the page and report how it failed. */
async function probe(page: import("@playwright/test").Page, url: string, hashHex: string) {
  return page.evaluate(async ([wtUrl, hex]) => {
    const value = new Uint8Array((hex.match(/../g) ?? []).map((b) => parseInt(b, 16)));
    const errors: string[] = [];
    const onError = (e: ErrorEvent) => errors.push(e.message);
    window.addEventListener("error", onError);
    try {
      // A token the hub cannot have minted: this deliberately gets as far as
      // the session request and no further. TLS is the part under test.
      const wt = new WebTransport(`${wtUrl}?token=not-a-real-bind`, {
        serverCertificateHashes: [{ algorithm: "sha-256", value }],
      });
      await wt.ready;
      return { ready: true, reason: "" };
    } catch {
      // WebTransportError carries no detail by design; the useful string is
      // in the console message Chromium logs alongside it, which the caller
      // reads off its own console listener.
      return { ready: false, reason: errors.join(" ") };
    } finally {
      window.removeEventListener("error", onError);
    }
  }, [url, hashHex] as const);
}

test("Chromium accepts the hub's self-signed voice cert, and rejects a wrong hash", async ({ page }) => {
  const info: Info = await (await page.request.get(`${HUB_URL}/info`)).json();

  // A hub with no public URL advertises no transport (settings.rs,
  // `effective_public_url`), and then there is nothing here to measure.
  test.skip(
    !info.voice_wt_url || !info.voice_cert_hash,
    "hub advertises no voice_wt_url — start it with WAVVON_PUBLIC_URL set",
  );

  const messages: string[] = [];
  page.on("console", (m) => messages.push(m.text()));
  // Any secure-context document on the hub's own origin will do; the hub in
  // this suite serves no web client of its own.
  await page.goto(`${HUB_URL}/info`);

  const good = await probe(page, info.voice_wt_url!, info.voice_cert_hash!);
  expect(good.ready, "a real bind token would be needed to open a session").toBe(false);
  const afterGood = messages.join(" ");
  expect(afterGood, "the advertised hash must clear TLS").not.toMatch(/CERTIFICATE|CERT_/i);
  expect(afterGood).toMatch(/ERR_METHOD_NOT_SUPPORTED/);

  messages.length = 0;
  const bad = await probe(page, info.voice_wt_url!, "aa".repeat(32));
  expect(bad.ready).toBe(false);
  expect(messages.join(" "), "a wrong hash must fail in TLS, not later").toMatch(
    /QUIC_TLS_CERTIFICATE_UNKNOWN|CERTIFICATE_VERIFY_FAILED/,
  );
});
