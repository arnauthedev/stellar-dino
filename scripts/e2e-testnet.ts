// End-to-end check of lib/stellar.ts against the deployed TESTNET contracts.
// Runs the demo script, then resets the demo.
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/e2e-testnet.ts
import * as s from "@/lib/stellar";

const ok = (label: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
};
const tx = (r: { explorerUrl: string }) => console.log(`      ${r.explorerUrl}`);

async function main() {
  const before = await s.getBalances();
  console.log("wallet", before.wallet.usdc, "pool", before.pool);

  const flight = await s.buyFlight("TP432");
  ok(`buy flight TP432: held ${flight.result.held} of ${flight.result.price}`, flight.result.held === 24);
  tx(flight);

  const museum = await s.bookMuseum("15:00");
  ok(`book museum ${museum.result.time}`, museum.result.time === "15:00");
  tx(museum);

  const water = await s.buyProduct("water");
  ok(`buy water: paid ${water.result.userPaid}, gov ${water.result.govPaid}`, water.result.govPaid === 0);
  tx(water);

  const delay = await s.reportFlightStatus("TP432", true, 120);
  ok(`delay TP432 +2h: status ${delay.result.status}, arrives ${delay.result.arrive}`, delay.result.status === "Delayed");
  tx(delay);

  const moved = await s.rescheduleMuseum("17:00");
  ok(`reschedule museum to ${moved.result.time}`, moved.result.time === "17:00");
  tx(moved);

  const rec = await s.recordRecycling();
  ok(`recycle bottle: credit ${rec.result.credit}`, rec.result.credit === 0.5);
  tx(rec);

  const bamboo = await s.buyProduct("bamboo");
  ok(
    `buy bamboo bottle: user ${bamboo.result.userPaid}, gov ${bamboo.result.govPaid}`,
    bamboo.result.userPaid === 11.5 && bamboo.result.govPaid === 0.5,
  );
  tx(bamboo);

  const limit = await s.getSpendingLimit();
  console.log("spending", limit);
  const setLow = await s.setSpendingLimit(50);
  tx(setLow);
  try {
    await s.buyProduct("tote");
    ok("limit blocks purchase over the limit", false);
  } catch (e) {
    ok(`limit blocks purchase: ${(e as Error).message}`, /Spending limit exceeded/.test((e as Error).message));
  }
  await s.setSpendingLimit(300);

  const after = await s.getBalances();
  console.log("wallet", after.wallet.usdc, "pool", after.pool, "held", after.airlineHeld);
  ok("wallet: 500 - 96 (flight) - 18 - 2 - 11.5 = 372.5", after.wallet.usdc === 372.5);

  const { rows } = await s.getHistory();
  for (const r of rows) console.log(`  [${r.kind}] ${r.note}`);
  ok("history has refund + subsidy rows", rows.some((r) => r.kind === "delay_refund") && rows.some((r) => r.kind === "subsidy_paid"));

  const subsidy = rows.find((r) => r.kind === "subsidy_paid" && r.txHash === bamboo.txHash);
  ok(`government note on subsidised purchase: "${subsidy?.note}"`, !!subsidy?.note.includes("by Government"));

  console.log("stats", JSON.stringify(await s.getStats()));

  console.log("reset:", (await s.resetDemo()).join(", "));
  const reset = await s.getBalances();
  ok(`after reset wallet ${reset.wallet.usdc}, pool ${reset.pool}`, reset.wallet.usdc === 500 && reset.pool === 100);
  ok("after reset spending 0", (await s.getSpendingLimit()).spent === 0);
  ok("after reset no museum booking", (await s.getMuseumBooking()) === null);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
