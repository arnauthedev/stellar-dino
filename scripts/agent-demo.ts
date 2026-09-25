// Runs the demo conversation through Dino (real model + testnet). Resets the demo first.
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/agent-demo.ts
import { askDino } from "@/lib/agent/dino";
import type { AiMessage } from "@/lib/ai";
import { markDemoReset } from "@/lib/demo";
import { getMuseumBooking, recordRecycling, reportFlightStatus, resetDemo } from "@/lib/stellar";

const history: AiMessage[] = [];
async function say(content: string, role: "user" | "developer" = "user") {
  history.push({ role, content: role === "developer" ? `EVENT: ${content}` : content });
  const t = Date.now();
  const r = await askDino(history);
  history.push({ role: "assistant", content: r.reply });
  console.log(`\n${role === "user" ? "USER" : "EVENT"}: ${content}`);
  console.log(`DINO (${((Date.now() - t) / 1000).toFixed(1)}s): ${r.reply}`);
  console.log(`  tools: ${r.calls.map((c) => c.name + (c.error ? `[ERR ${c.error}]` : "")).join(", ") || "-"}`);
  if (r.actions.length) console.log(`  actions: ${JSON.stringify(r.actions)}`);
  return r;
}

(async () => {
  console.log("reset:", (await resetDemo()).join(", "));
  await markDemoReset();
  await say("Plan a trip to Paris this morning with a museum visit.");
  console.log("  museum booking:", JSON.stringify(await getMuseumBooking()));
  await say("Buy me a bottle of water at the airport shop.");
  const delay = await reportFlightStatus("TP432", true, 120);
  await say(`Flight TP432 delayed 2 h: 24.00 USDC refunded to passenger (${delay.explorerUrl})`, "developer");
  console.log("  museum booking:", JSON.stringify(await getMuseumBooking()));
  await recordRecycling();
  await say("I just recycled my bottle. What can I buy with my credit?");
  await say("Great, buy the bamboo bottle.");
  await say("Let's play the dino game!");
})().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
