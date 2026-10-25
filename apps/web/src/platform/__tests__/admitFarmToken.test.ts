import { describe, it, expect, vi } from "vitest";
import { admitFarmToken } from "../commands/hubAuth";

const HUB = "https://hub.example";
const closed = () => new Response("This hub requires an invite code", { status: 403 });

function stub(probe: () => Response) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    return url.endsWith("/me") ? probe() : new Response(null, { status: 204 });
  }));
  return calls;
}

describe("admitFarmToken", () => {
  it("redeems the invite when the hub refuses a non-member", async () => {
    const calls = stub(closed);
    await admitFarmToken(HUB, "t", "a/b");
    expect(calls).toEqual([`GET ${HUB}/me`, `POST ${HUB}/join/a%2Fb`]);
  });

  it("spends no invite use on a member", async () => {
    const calls = stub(() => new Response("{}", { status: 200 }));
    await admitFarmToken(HUB, "t", "code");
    expect(calls).toEqual([`GET ${HUB}/me`]);
  });

  it("surfaces the refusal when no invite is held", async () => {
    stub(closed);
    await expect(admitFarmToken(HUB, "t")).rejects.toThrow("requires an invite code");
  });

  it("leaves other failures to the first real request", async () => {
    stub(() => new Response("banned", { status: 403 }));
    await expect(admitFarmToken(HUB, "t", "code")).resolves.toBeUndefined();
  });
});
