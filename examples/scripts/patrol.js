// A sandboxed user script. Runs in an isolate with only the Bot API available; every bot call is
// async, and there is no fs, net, env, or require. Run it headless with:
//   mcst debug --user-script examples/scripts/patrol.js -H <host> --i-am-authorized
// or from the web UI's Scripts tab.

const start = await bot.position();
console.log("spawned at", start ? `${start.x},${start.y},${start.z}` : "unknown");

bot.on("chat", (m) => {
  if (m.message.includes("come")) console.log("was summoned by", m.username);
});

// Walk a small square, pausing at each corner.
const corners = [
  [5, 0],
  [5, 5],
  [0, 5],
  [0, 0],
];
for (const [dx, dz] of corners) {
  if (!start) break;
  await bot.goto(start.x + dx, start.y, start.z + dz);
  const here = await bot.position();
  console.log("reached", here ? `${here.x},${here.z}` : "?");
  await sleep(1000);
}
await bot.chat("patrol complete");
