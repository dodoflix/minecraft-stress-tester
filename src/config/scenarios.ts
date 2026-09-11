/**
 * Named load profiles. Each returns a config overlay that seeds ramp/driver/behaviors;
 * an explicit config file and CLI flags override it. Pure and unit-tested.
 */
export type ScenarioName = "join-flood" | "sustained-load" | "chat-flood" | "chunk-thrash";

const SCENARIO_OVERLAYS: Record<ScenarioName, Record<string, unknown>> = {
  // Hammer the login/connection path: many bots, fast, brief, no reconnect.
  "join-flood": {
    driver: "light",
    ramp: { count: 500, connectRate: 50, rampUpSeconds: 0, holdSeconds: 5 },
    reconnect: { enabled: false },
    behaviors: { antiAfk: { enabled: false } },
  },
  // Steady population over a long window.
  "sustained-load": {
    driver: "light",
    ramp: { count: 200, connectRate: 10, rampUpSeconds: 10, holdSeconds: 300 },
    behaviors: { antiAfk: { enabled: true } },
  },
  // Stress chat handling / anti-spam plugins.
  "chat-flood": {
    driver: "light",
    ramp: { count: 100, connectRate: 10, holdSeconds: 60 },
    behaviors: { chatSpam: { enabled: true, delayMs: 500 } },
  },
  // Realistic movement to churn chunk loading and physics (FullBot).
  "chunk-thrash": {
    driver: "full",
    ramp: { count: 40, connectRate: 4, holdSeconds: 120 },
    behaviors: { antiAfk: { enabled: true }, movement: { enabled: true, intervalMs: 500 } },
  },
};

export function applyScenario(name: ScenarioName): Record<string, unknown> {
  return SCENARIO_OVERLAYS[name];
}
