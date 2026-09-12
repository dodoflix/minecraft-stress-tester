import { describe, expect, it, vi } from "vitest";
import type { BotDriver, BotEventMap } from "../src/drivers/driver.js";
import { TypedEmitter } from "../src/drivers/driver.js";
import { type ResolvedStage, runPipeline } from "../src/pipeline/runner.js";
import type { Stage, StageResult } from "../src/pipeline/stage.js";

function fakeBot(): BotDriver {
  const ee = new TypedEmitter<BotEventMap>();
  return Object.assign(ee, {
    spec: {} as never,
    connect: () => {},
    disconnect: () => {},
    chat: () => {},
  }) as unknown as BotDriver;
}

// A stage whose result we resolve manually; records start/stop.
function deferredStage(log: string[], name: string) {
  let resolve!: (r: StageResult) => void;
  const stage: Stage = () => {
    log.push(`start:${name}`);
    return {
      done: new Promise<StageResult>((r) => {
        resolve = r;
      }),
      stop: () => log.push(`stop:${name}`),
    };
  };
  return { stage, finish: (status: StageResult["status"]) => resolve({ status }) };
}

const rs = (kind: string, stage: Stage, extra: Partial<ResolvedStage> = {}): ResolvedStage => ({
  kind,
  stage,
  onFailure: "continue",
  retries: 0,
  ...extra,
});

describe("runPipeline", () => {
  it("gates each stage on the previous one's completion", async () => {
    const log: string[] = [];
    const a = deferredStage(log, "a");
    const b = deferredStage(log, "b");
    const bot = fakeBot();
    runPipeline(bot, [rs("a", a.stage), rs("b", b.stage)]);
    await Promise.resolve();
    expect(log).toEqual(["start:a"]); // b waits for a
    a.finish("succeeded");
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toContain("start:b");
  });

  it("stops the pipeline when a stage fails with policy stop", async () => {
    const log: string[] = [];
    const a = deferredStage(log, "a");
    const b = deferredStage(log, "b");
    const { finished } = runPipeline(fakeBot(), [rs("a", a.stage, { onFailure: "stop" }), rs("b", b.stage)]);
    a.finish("failed");
    await finished;
    expect(log).not.toContain("start:b");
  });

  it("continues past a failed stage with policy continue", async () => {
    const log: string[] = [];
    const a = deferredStage(log, "a");
    const b = deferredStage(log, "b");
    runPipeline(fakeBot(), [rs("a", a.stage, { onFailure: "continue" }), rs("b", b.stage)]);
    a.finish("failed");
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toContain("stop:a");
    expect(log).toContain("start:b");
  });

  it("retries a failing stage up to the limit then succeeds", async () => {
    const log: string[] = [];
    let attempts = 0;
    const stage: Stage = () => {
      attempts++;
      const status: StageResult["status"] = attempts < 3 ? "failed" : "succeeded";
      return { done: Promise.resolve({ status }), stop: () => log.push("stop") };
    };
    const { finished } = runPipeline(fakeBot(), [rs("a", stage, { onFailure: "retry", retries: 5 })]);
    await finished;
    expect(attempts).toBe(3);
  });

  it("treats a stage that never completes as failed after its timeout", async () => {
    const stage: Stage = () => ({ done: new Promise<StageResult>(() => {}), stop: () => {} });
    const next = vi.fn<Stage>(() => ({ done: Promise.resolve({ status: "done" as const }), stop: () => {} }));
    const { finished } = runPipeline(fakeBot(), [
      rs("slow", stage, { onFailure: "continue", timeoutMs: 10 }),
      rs("next", next),
    ]);
    await finished;
    expect(next).toHaveBeenCalled();
  });

  it("passes a stage through when it completes before its timeout", async () => {
    const stage: Stage = () => ({ done: Promise.resolve({ status: "succeeded" }), stop: () => {} });
    const next = vi.fn<Stage>(() => ({ done: Promise.resolve({ status: "done" as const }), stop: () => {} }));
    const { finished } = runPipeline(fakeBot(), [rs("t", stage, { timeoutMs: 1000 }), rs("next", next)]);
    await finished;
    expect(next).toHaveBeenCalled();
  });

  it("continues after exhausting retries", async () => {
    let attempts = 0;
    const a: Stage = () => {
      attempts++;
      return { done: Promise.resolve({ status: "failed" }), stop: () => {} };
    };
    const b = vi.fn<Stage>(() => ({ done: Promise.resolve({ status: "done" as const }), stop: () => {} }));
    const { finished } = runPipeline(fakeBot(), [rs("a", a, { onFailure: "retry", retries: 2 }), rs("b", b)]);
    await finished;
    expect(attempts).toBe(3); // initial + 2 retries
    expect(b).toHaveBeenCalled();
  });

  it("treats a rejecting stage as failed", async () => {
    const boom: Stage = () => ({ done: Promise.reject(new Error("boom")), stop: () => {} });
    const next = vi.fn<Stage>(() => ({ done: Promise.resolve({ status: "done" as const }), stop: () => {} }));
    const { finished } = runPipeline(fakeBot(), [
      rs("boom", boom, { onFailure: "continue" }),
      rs("next", next),
    ]);
    await finished;
    expect(next).toHaveBeenCalled();
  });

  it("does not start the next stage once the bot has ended", async () => {
    const log: string[] = [];
    const a = deferredStage(log, "a");
    const b = deferredStage(log, "b");
    const bot = fakeBot();
    const { finished } = runPipeline(bot, [rs("a", a.stage), rs("b", b.stage)]);
    await Promise.resolve();
    bot.emit("end", "bye"); // stops the pipeline mid-flight
    a.finish("succeeded");
    await finished;
    expect(log).not.toContain("start:b");
  });

  it("tears down running stages when the bot ends", async () => {
    const log: string[] = [];
    const daemon: Stage = () => {
      log.push("start");
      return { done: Promise.resolve({ status: "succeeded" as const }), stop: () => log.push("stop") };
    };
    const bot = fakeBot();
    runPipeline(bot, [rs("d", daemon)]);
    await Promise.resolve();
    bot.emit("end", "bye");
    expect(log).toContain("stop");
  });
});
