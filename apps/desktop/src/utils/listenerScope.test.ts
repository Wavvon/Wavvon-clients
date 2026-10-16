import { describe, it, expect, vi } from "vitest";
import { listenerScope } from "./listenerScope";

describe("listenerScope", () => {
  it("unlistens a registration that resolves after close", async () => {
    const unlisten = vi.fn();
    let resolve!: (fn: () => void) => void;
    const scope = listenerScope();
    scope.add(new Promise((r) => { resolve = r; }));
    scope.close();
    resolve(unlisten);
    await Promise.resolve();
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("unlistens resolved registrations on close, once", async () => {
    const unlisten = vi.fn();
    const scope = listenerScope();
    scope.add(Promise.resolve(unlisten));
    await Promise.resolve();
    await Promise.resolve();
    expect(unlisten).not.toHaveBeenCalled();
    scope.close();
    scope.close();
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
