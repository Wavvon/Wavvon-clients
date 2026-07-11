import { describe, it, expect } from "vitest";
import {
  bufferSourceToBytes,
  prfExtensionEnabled,
  extractPrfOutput,
  buildPrfCreationOptions,
  buildPrfRequestOptions,
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
});

describe("prfExtensionEnabled", () => {
  it("is true only when the create() response says enabled: true", () => {
    expect(prfExtensionEnabled({ prf: { enabled: true } })).toBe(true);
    expect(prfExtensionEnabled({ prf: { enabled: false } })).toBe(false);
    expect(prfExtensionEnabled({ prf: {} })).toBe(false);
    expect(prfExtensionEnabled({})).toBe(false);
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
