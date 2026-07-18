import { describe, it, expect, vi, afterEach } from "vitest";
import {
  bufferSourceToBytes,
  extractPrfOutput,
  buildPrfCreationOptions,
  buildPrfRequestOptions,
  createIdentityWithPasskey,
  PrfOutputUnavailableError,
  PrfRestoreUnverifiedError,
} from "../prfIdentity";

describe("bufferSourceToBytes", () => {
  it("wraps a plain ArrayBuffer", () => {
    const ab = new Uint8Array([1, 2, 3]).buffer;
    expect(Array.from(bufferSourceToBytes(ab))).toEqual([1, 2, 3]);
  });

  it("respects a typed-array view's offset and length", () => {
    const backing = new Uint8Array([9, 9, 1, 2, 3, 9]);
    const view = new Uint8Array(backing.buffer, 2, 3);
    expect(Array.from(bufferSourceToBytes(view))).toEqual([1, 2, 3]);
  });

  it("handles a foreign-realm ArrayBuffer that fails instanceof", () => {
    // Simulate a buffer minted in another realm (extension boundary): a
    // proxy-like object that is NOT instanceof ArrayBuffer in this realm
    // but is accepted by the Uint8Array constructor via its buffer-ness.
    const real = new Uint8Array([4, 5, 6]).buffer;
    const foreign = Object.create(null);
    Object.defineProperty(foreign, "byteLength", { value: 3 });
    // new Uint8Array(foreign) can't work on a plain object, so emulate the
    // realm mismatch the way it actually manifests: prototype detached.
    Object.setPrototypeOf(real, null);
    expect(real instanceof ArrayBuffer).toBe(false);
    expect(Array.from(bufferSourceToBytes(real as ArrayBuffer))).toEqual([4, 5, 6]);
  });
});

describe("createIdentityWithPasskey — create() response is advisory only", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubCredentials(opts: {
    createExt: AuthenticationExtensionsClientOutputs;
    getExt: AuthenticationExtensionsClientOutputs;
  }) {
    const fakeCred = (ext: AuthenticationExtensionsClientOutputs) => ({
      id: "cred-id",
      rawId: new Uint8Array([1]).buffer,
      getClientExtensionResults: () => ext,
    });
    const get = vi.fn().mockResolvedValue(fakeCred(opts.getExt));
    vi.stubGlobal("navigator", {
      credentials: {
        create: vi.fn().mockResolvedValue(fakeCred(opts.createExt)),
        get,
      },
    });
    // isPasskeySupported() checks window.PublicKeyCredential
    vi.stubGlobal("window", { PublicKeyCredential: class {}, location: { hostname: "example.com" } });
    return { get };
  }

  const output32 = { prf: { results: { first: new Uint8Array(32).fill(7).buffer } } };

  it("falls through to a get() when create() omits prf entirely (Bitwarden case)", async () => {
    const { get } = stubCredentials({ createExt: {}, getExt: output32 });
    const { seedHex } = await createIdentityWithPasskey();
    expect(get).toHaveBeenCalledOnce();
    expect(seedHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws PrfOutputUnavailableError when neither ceremony ever yields output", async () => {
    stubCredentials({ createExt: { prf: { enabled: false } }, getExt: {} });
    await expect(createIdentityWithPasskey()).rejects.toBeInstanceOf(PrfOutputUnavailableError);
  });

  it("always runs the verification get(); its output is canonical when both exist", async () => {
    const getFirst = new Uint8Array(32).fill(9).buffer;
    const { get } = stubCredentials({
      createExt: output32, // fill(7)
      getExt: { prf: { results: { first: getFirst } } }, // fill(9) — get wins
    });
    const { seedHex } = await createIdentityWithPasskey();
    expect(get).toHaveBeenCalledOnce();
    expect(seedHex).toBe("09".repeat(32));
  });

  it("REFUSES creation with PrfRestoreUnverifiedError when create() yields output but the restore self-test fails (Windows Hello create-only case)", async () => {
    const { get } = stubCredentials({ createExt: output32, getExt: {} });
    await expect(createIdentityWithPasskey()).rejects.toBeInstanceOf(PrfRestoreUnverifiedError);
    expect(get).toHaveBeenCalledOnce();
  });
});

describe("extractPrfOutput", () => {
  it("returns undefined when the authenticator gave no PRF results", () => {
    expect(extractPrfOutput({})).toBeUndefined();
    expect(extractPrfOutput({ prf: { enabled: true } })).toBeUndefined();
  });

  it("extracts the 'first' output when present", () => {
    const first = new Uint8Array(32).fill(7).buffer;
    const output = extractPrfOutput({ prf: { results: { first } } });
    expect(output).toBeInstanceOf(Uint8Array);
    expect(output?.length).toBe(32);
    expect(output?.[0]).toBe(7);
  });
});

describe("buildPrfCreationOptions", () => {
  const salt = new TextEncoder().encode("wavvon-master/v1");
  const challenge = new Uint8Array([1, 2, 3]);
  const userId = new Uint8Array([4, 5, 6]);

  it("scopes the credential to the given rp and carries the PRF salt", () => {
    const options = buildPrfCreationOptions({ rpId: "example.com", rpName: "Wavvon", challenge, userId, salt });
    expect(options.rp).toEqual({ id: "example.com", name: "Wavvon" });
    expect(options.user.id).toBe(userId);
    expect(options.challenge).toBe(challenge);
    expect(options.extensions?.prf?.eval?.first).toBe(salt);
  });

  it("requires a resident (discoverable) credential and user verification", () => {
    const options = buildPrfCreationOptions({ rpId: "example.com", rpName: "Wavvon", challenge, userId, salt });
    expect(options.authenticatorSelection?.residentKey).toBe("required");
    expect(options.authenticatorSelection?.userVerification).toBe("required");
  });
});

describe("buildPrfRequestOptions", () => {
  const salt = new TextEncoder().encode("wavvon-master/v1");
  const challenge = new Uint8Array([9, 9, 9]);

  it("carries the PRF salt and omits allowCredentials for discoverable sign-in", () => {
    const options = buildPrfRequestOptions({ challenge, salt });
    expect(options.extensions?.prf?.eval?.first).toBe(salt);
    expect(options.allowCredentials).toBeUndefined();
    expect(options.userVerification).toBe("required");
  });

  it("scopes to a specific credential when allowCredentials is given", () => {
    const rawId = new Uint8Array([1]).buffer;
    const options = buildPrfRequestOptions({
      challenge,
      salt,
      allowCredentials: [{ id: rawId, type: "public-key" }],
    });
    expect(options.allowCredentials).toEqual([{ id: rawId, type: "public-key" }]);
  });
});
