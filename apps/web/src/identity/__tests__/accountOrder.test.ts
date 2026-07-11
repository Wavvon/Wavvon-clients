import { describe, it, expect } from "vitest";
import {
  sortAccountsByOrder,
  renumberAccountOrder,
  nextAccountOrder,
  reorderByDrop,
  moveByStep,
} from "../accountOrder";

describe("sortAccountsByOrder", () => {
  it("sorts by account_order ascending", () => {
    const accounts = [
      { id: "b", account_order: 2 },
      { id: "a", account_order: 1 },
      { id: "c", account_order: 3 },
    ];
    expect(sortAccountsByOrder(accounts).map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts accounts missing account_order after every ordered account", () => {
    const accounts = [
      { id: "unordered", account_label: "Zed" },
      { id: "b", account_order: 2 },
      { id: "a", account_order: 1 },
    ];
    expect(sortAccountsByOrder(accounts).map((a) => a.id)).toEqual(["a", "b", "unordered"]);
  });

  it("falls back to label, then id, when multiple accounts have no order", () => {
    const accounts = [
      { id: "id-b", account_label: "Bravo" },
      { id: "id-a", account_label: "Alpha" },
      { id: "id-c" },
    ];
    expect(sortAccountsByOrder(accounts).map((a) => a.id)).toEqual(["id-a", "id-b", "id-c"]);
  });

  it("breaks ties on equal account_order using the label fallback", () => {
    const accounts = [
      { id: "id-b", account_order: 1, account_label: "Bravo" },
      { id: "id-a", account_order: 1, account_label: "Alpha" },
    ];
    expect(sortAccountsByOrder(accounts).map((a) => a.id)).toEqual(["id-a", "id-b"]);
  });

  it("does not mutate the input array", () => {
    const accounts = [{ id: "b", account_order: 2 }, { id: "a", account_order: 1 }];
    const copy = [...accounts];
    sortAccountsByOrder(accounts);
    expect(accounts).toEqual(copy);
  });
});

describe("renumberAccountOrder", () => {
  it("assigns sequential 1-based positions matching the given order", () => {
    const positions = renumberAccountOrder(["c", "a", "b"]);
    expect(positions.get("c")).toBe(1);
    expect(positions.get("a")).toBe(2);
    expect(positions.get("b")).toBe(3);
  });
});

describe("nextAccountOrder", () => {
  it("returns 1 for an empty account list", () => {
    expect(nextAccountOrder([])).toBe(1);
  });

  it("returns one past the highest existing account_order", () => {
    expect(nextAccountOrder([{ id: "a", account_order: 1 }, { id: "b", account_order: 5 }])).toBe(6);
  });

  it("ignores accounts without an account_order when computing the max", () => {
    expect(nextAccountOrder([{ id: "a" }, { id: "b", account_order: 2 }])).toBe(3);
  });
});

describe("reorderByDrop", () => {
  it("moves the dragged id to sit immediately before the target id", () => {
    expect(reorderByDrop(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("moves an id forward in the list", () => {
    expect(reorderByDrop(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "a", "c", "d"]);
  });

  it("no-ops when dragged and target ids are the same", () => {
    expect(reorderByDrop(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
  });

  it("no-ops when either id is unknown", () => {
    expect(reorderByDrop(["a", "b", "c"], "z", "b")).toEqual(["a", "b", "c"]);
    expect(reorderByDrop(["a", "b", "c"], "a", "z")).toEqual(["a", "b", "c"]);
  });
});

describe("moveByStep", () => {
  it("swaps with the previous item on -1", () => {
    expect(moveByStep(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
  });

  it("swaps with the next item on +1", () => {
    expect(moveByStep(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("no-ops when moving the first item up", () => {
    expect(moveByStep(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
  });

  it("no-ops when moving the last item down", () => {
    expect(moveByStep(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });

  it("no-ops for an id not in the list", () => {
    expect(moveByStep(["a", "b", "c"], "z", 1)).toEqual(["a", "b", "c"]);
  });
});
