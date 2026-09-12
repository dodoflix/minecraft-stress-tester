import { describe, expect, it, vi } from "vitest";
import { TypedEmitter } from "../src/drivers/driver.js";

describe("TypedEmitter", () => {
  it("on/emit/off", () => {
    const ee = new TypedEmitter<{ ping: [n: number] }>();
    const fn = vi.fn();
    ee.on("ping", fn);
    ee.emit("ping", 1);
    ee.off("ping", fn);
    ee.emit("ping", 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });
});
