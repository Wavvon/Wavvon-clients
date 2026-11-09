import { describe, it, expect, beforeEach, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import {
  bytesToHex,
  decryptDmDr,
  dhKeySigningBytes,
  dhKeypairFromSeed,
  federatedPlaintextDmSigningBytes,
  federatedPlaintextDmV2SigningBytes,
  hexToBytes,
  publicKeyHex,
  type DrEnvelope,
} from "@wavvon/core";

// The one path where a wrong answer is not a bug but a disclosure: sendDm
// deciding whether a DM may leave this device readable. It used to decide by
// asking for the recipient's DH key and treating *any* null as "cannot
// encrypt" — including the null that `fetchDhKey` returned for a request that
// simply failed. A rate-limited moment was enough to post the message to the
// hub in the clear, with nothing said to anyone.

const SENDER_SEED = bytesToHex(new Uint8Array(32).fill(1));
const SENDER_PUB = publicKeyHex(SENDER_SEED);
const RECIPIENT_SEED = bytesToHex(new Uint8Array(32).fill(2));
const RECIPIENT_PUB = publicKeyHex(RECIPIENT_SEED);
const CANONICAL_PUB = publicKeyHex(bytesToHex(new Uint8Array(32).fill(3)));
const HUB = "https://hub.example";

const dmFetch = vi.fn();
let identity: Record<string, unknown> = {};
let capabilities: string[] = [];

vi.mock("../dmHub", () => ({
  dmFetch: (path: string, init?: RequestInit) => dmFetch(path, init),
  dmSession: async () => ({ hub_url: HUB, token: "t", capabilities }),
}));

vi.mock("../session", () => ({
  activeSession: () => ({ hub_url: HUB, token: "t", hub_id: "h" }),
}));

const saveOwnDmAttachments = vi.fn(async () => {});

vi.mock("../../identity/store", () => ({
  loadIdentity: async () => identity,
  saveIdentity: async () => {},
  saveOwnDmAttachments: (...a: unknown[]) => saveOwnDmAttachments(...(a as [])),
  loadOwnDmAttachments: async () => undefined,
}));

vi.stubGlobal("localStorage", {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
});

/** Every POST of a message body, as the hub would have received it. */
function postedBodies(): Record<string, unknown>[] {
  return dmFetch.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(init.body as string) as Record<string, unknown>);
}

function dhKeyResponse(status: number, hex?: string) {
  return async (url: string) => {
    if (String(url).includes("/dh-key")) {
      return hex
        ? new Response(
            JSON.stringify({
              dh_pubkey_hex: hex,
              // Signed by the recipient, as a real record is; the client refuses any other.
              signature_hex: bytesToHex(
                ed25519.sign(dhKeySigningBytes(RECIPIENT_PUB, hex), hexToBytes(RECIPIENT_SEED)),
              ),
            }),
            { status: 200 },
          )
        : new Response("nope", { status });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
}

beforeEach(() => {
  vi.resetModules();
  dmFetch.mockReset();
  identity = { id: "acct", seed_hex: SENDER_SEED, security_nonce: 0, security_level: 0 };
  capabilities = [];
  // The conversation read, then the message POST.
  dmFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Response(JSON.stringify({ id: "m1" }), { status: 201 });
    return new Response(
      JSON.stringify({ id: "c1", members: [SENDER_PUB, RECIPIENT_PUB], conv_type: "dm" }),
      { status: 200 },
    );
  });
});

async function sendDm(...args: Parameters<typeof import("../commands/dms")["sendDm"]>) {
  const mod = await import("../commands/dms");
  return mod.sendDm(...args);
}

describe("sendDm and the recipient's encryption key", () => {
  it("refuses rather than falling back to plaintext when the key lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn(dhKeyResponse(429)));
    const confirmUnencrypted = vi.fn(async () => true);

    await expect(sendDm("c1", "secret", undefined, { confirmUnencrypted })).rejects.toThrow();

    // The whole point: nothing was posted, encrypted or otherwise.
    expect(postedBodies()).toHaveLength(0);
    // And the user was never asked — a failed lookup is not a missing key,
    // so there is no decision to put to them.
    expect(confirmUnencrypted).not.toHaveBeenCalled();
  });

  it("asks before sending in the clear to a recipient who has published no key", async () => {
    vi.stubGlobal("fetch", vi.fn(dhKeyResponse(404)));
    const confirmUnencrypted = vi.fn(async () => true);

    const res = await sendDm("c1", "secret", undefined, { confirmUnencrypted });

    expect(confirmUnencrypted).toHaveBeenCalled();
    expect(res).toBe("sent");
    const [posted] = postedBodies();
    expect(posted.content).toBe("secret");
    // Signed, or a recipient on another hub refuses it (Wavvon-clients#126).
    const sb = federatedPlaintextDmSigningBytes("c1", "dm", "secret");
    expect(ed25519.verify(hexToBytes(posted.plaintext_signature as string), sb, hexToBytes(SENDER_PUB))).toBe(true);
  });

  it("signs a paired device's plaintext with its subkey and sends the cert", async () => {
    vi.stubGlobal("fetch", vi.fn(dhKeyResponse(404)));
    const cert = { master_pubkey: RECIPIENT_PUB, subkey_pubkey: SENDER_PUB };
    // The conversation knows us by the canonical key; this device holds a subkey.
    identity = { ...identity, canonical_pubkey: CANONICAL_PUB, subkey_cert: cert };
    dmFetch.mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ id: "m1" }), { status: 201 });
      return new Response(JSON.stringify({ id: "c1", members: [CANONICAL_PUB, RECIPIENT_PUB], conv_type: "dm" }), {
        status: 200,
      });
    });
    const sb = federatedPlaintextDmSigningBytes("c1", "dm", "secret");

    // An older hub would refuse a signature it checks against the canonical key.
    await sendDm("c1", "secret", undefined, { confirmUnencrypted: async () => true });
    expect(postedBodies()[0].plaintext_signature).toBeUndefined();

    capabilities = ["dms.plaintext.signercert"];
    await sendDm("c1", "secret", undefined, { confirmUnencrypted: async () => true });
    const posted = postedBodies()[1];
    expect(ed25519.verify(hexToBytes(posted.plaintext_signature as string), sb, hexToBytes(SENDER_PUB))).toBe(true);
    expect(posted.plaintext_signer_cert).toEqual(cert);
  });

  it("signs v2 with its own id, time and the members where the hub takes it", async () => {
    vi.stubGlobal("fetch", vi.fn(dhKeyResponse(404)));
    capabilities = ["dms.plaintext.v2"];

    await sendDm("c1", "secret", undefined, { confirmUnencrypted: async () => true });

    const [posted] = postedBodies();
    expect(posted.message_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof posted.created_at).toBe("number");
    // Members in another order sign the same bytes: the set is what counts.
    const sb = federatedPlaintextDmV2SigningBytes(
      "c1",
      "dm",
      "secret",
      posted.message_id as string,
      posted.created_at as number,
      [RECIPIENT_PUB, SENDER_PUB],
    );
    expect(ed25519.verify(hexToBytes(posted.plaintext_signature as string), sb, hexToBytes(SENDER_PUB))).toBe(true);
  });

  it("sends nothing when the user declines", async () => {
    vi.stubGlobal("fetch", vi.fn(dhKeyResponse(404)));

    const res = await sendDm("c1", "secret", undefined, { confirmUnencrypted: async () => false });

    expect(res).toBe("cancelled");
    expect(postedBodies()).toHaveLength(0);
  });

  it("sends nothing when no one is there to ask", async () => {
    vi.stubGlobal("fetch", vi.fn(dhKeyResponse(404)));

    // No callback is not consent. Refusing is the only direction that cannot
    // leak, so it is the default.
    const res = await sendDm("c1", "secret");

    expect(res).toBe("cancelled");
    expect(postedBodies()).toHaveLength(0);
  });
});

describe("sendDm and attachments", () => {
  it("puts an encrypted DM's attachments inside the envelope, not beside it", async () => {
    const recipientDh = bytesToHex(dhKeypairFromSeed(RECIPIENT_SEED).dhPub);
    vi.stubGlobal("fetch", vi.fn(dhKeyResponse(200, recipientDh)));
    const files = [{ name: "cat.png", mime: "image/png", data_b64: "iVBORw==" }];

    await sendDm("c1", "look", files);

    const [posted] = postedBodies();
    expect(posted.encrypted_envelope).toBeDefined();
    expect(posted).not.toHaveProperty("attachments");
    expect(posted).not.toHaveProperty("content");
    // The recipient gets the files back out of the ciphertext.
    const empty = { rk: "", cks: null, ckr: null, ns: 0, nr: 0, pn: 0, dhsPriv: "", dhsPub: "", dhr: null, mkskipped: {} };
    const senderDh = bytesToHex(dhKeypairFromSeed(SENDER_SEED).dhPub);
    const out = decryptDmDr(posted.encrypted_envelope as DrEnvelope, empty, RECIPIENT_SEED, senderDh);
    expect(out.plaintext).toBe("look");
    expect(out.attachments).toEqual(files);
    // And the sender keeps its own copy, since it cannot decrypt its own send.
    expect(saveOwnDmAttachments).toHaveBeenCalledWith("m1", files);
  });

  it("still sends a consented plaintext DM's attachments as before", async () => {
    vi.stubGlobal("fetch", vi.fn(dhKeyResponse(404)));
    const files = [{ name: "a.txt", mime: "text/plain", data_b64: "aGk=" }];

    await sendDm("c1", "hi", files, { confirmUnencrypted: async () => true });

    expect(postedBodies()[0].attachments).toEqual(files);
  });
});

describe("sendDm and group conversations", () => {
  it("refuses a group rather than encrypting to one arbitrary member", async () => {
    // The read path already says "upgrade client to read" for a group; the
    // send path had no equivalent, and would have picked whichever member
    // came first — one reader, everyone else locked out, reported as sent.
    dmFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ id: "m1" }), { status: 201 });
      return new Response(
        JSON.stringify({
          id: "c1",
          members: [SENDER_PUB, RECIPIENT_PUB, "cc".repeat(32)],
          conv_type: "group",
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", vi.fn(dhKeyResponse(200, "aa".repeat(32))));

    await expect(sendDm("c1", "hello group")).rejects.toThrow();
    expect(postedBodies()).toHaveLength(0);
  });
});
