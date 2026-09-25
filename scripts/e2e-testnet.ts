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

  const tomorrow = s.demoDate(1);
  const flightId = s.flightId("SK101", tomorrow);

  const bcn = await s.listFlights({ date: tomorrow, from: "bcn", to: "LIS" });
  ok(`BCN->LIS tomorrow: ${bcn.map((f) => `${f.code} ${f.depart}`).join(", ")}`, bcn.length === 3 && bcn.every((f) => f.date === tomorrow));
  ok(`all flights in 6 days: ${(await s.listFlights({ date: s.demoDate(6) })).length}`, (await s.listFlights({ date: s.demoDate(6) })).length === 13);
  const museums = await s.listMuseums();
  ok(`museums: ${museums.map((m) => `${m.name} ${m.price}`).join(", ")}`, museums.length === 4);
  const slots = await s.museumSlots("maat", s.demoDate(3));
  ok(`MAAT slots in 3 days: ${slots.length} x ${slots[0]?.capacity}, ${slots[0]?.time}-${slots.at(-1)?.time}`, slots.length === 17);

  const flight = await s.buyFlight(flightId);
  ok(`buy flight ${flightId}: held ${flight.result.held} of ${flight.result.price}`, flight.result.held === 17.8 && flight.result.price === 89);
  tx(flight);
  try {
    await s.buyFlight(flightId);
    ok("second ticket on same flight rejected", false);
  } catch (e) {
    ok(`second ticket rejected: ${(e as Error).message}`, /Already booked/.test((e as Error).message));
  }

  const museum = await s.bookMuseum("gulbenkian", "15:00", tomorrow);
  ok(
    `book ${museum.result.museumName} ${museum.result.date} ${museum.result.time}: ${museum.result.price}`,
    museum.result.time === "15:00" && museum.result.price === 14 && museum.result.date === tomorrow,
  );
  tx(museum);
  const booked = (await s.museumSlots("gulbenkian", tomorrow)).find((x) => x.time === "15:00");
  ok(`15:00 slot booked count ${booked?.booked}`, booked?.booked === 1);

  const water = await s.buyProduct("water");
  ok(`buy water: paid ${water.result.userPaid}, gov ${water.result.govPaid}`, water.result.govPaid === 0);
  tx(water);

  const delay = await s.reportFlightStatus(flightId, true, 120);
  ok(
    `delay ${flightId} +2h: status ${delay.result.status}, arrives ${delay.result.arrive}`,
    delay.result.status === "Delayed" && delay.result.arrive === "11:05",
  );
  tx(delay);
  const mine = await s.getMyFlights();
  ok(`my flights: ${mine.map((f) => `${f.id} ${f.status} held ${f.held} settled ${f.settled}`).join(", ")}`, mine.length === 1 && mine[0].settled);

  const moved = await s.rescheduleMuseum("gulbenkian", "17:00", tomorrow);
  ok(`reschedule museum to ${moved.result.time}`, moved.result.time === "17:00");
  tx(moved);
  const bookings = await s.getMuseumBookings();
  ok(`my museum bookings: ${bookings.map((b) => `${b.museumName} ${b.date} ${b.time}`).join(", ")}`, bookings.length === 1 && bookings[0].time === "17:00");

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
  ok("wallet: 500 - 71.2 (flight after refund) - 14 - 2 - 11.5 = 401.3", after.wallet.usdc === 401.3);

  const { rows } = await s.getHistory();
  for (const r of rows) console.log(`  [${r.kind}] ${r.note}`);
  ok("history has refund + subsidy rows", rows.some((r) => r.kind === "delay_refund") && rows.some((r) => r.kind === "subsidy_paid"));
  const refund = rows.find((r) => r.kind === "delay_refund" && r.txHash === delay.txHash);
  ok(`refund row: "${refund?.note}" (${refund?.data.flightId})`, !!refund?.note.includes("delayed 2 h") && refund?.data.flightId === flightId);
  const mt = rows.find((r) => r.kind === "museum_ticket_sold" && r.txHash === museum.txHash);
  ok(`museum ticket row: "${mt?.note}"`, !!mt?.note.startsWith("Museu Calouste Gulbenkian") && mt?.data.museumId === "gulbenkian");
  ok("museum rescheduled row", rows.some((r) => r.kind === "museum_rescheduled" && r.note.includes("moved from 15:00 to 17:00")));

  const subsidy = rows.find((r) => r.kind === "subsidy_paid" && r.txHash === bamboo.txHash);
  ok(`government note on subsidised purchase: "${subsidy?.note}"`, !!subsidy?.note.includes("by Government"));

  console.log("stats", JSON.stringify(await s.getStats()));

  console.log("reset:", (await s.resetDemo()).join(", "));
  const reset = await s.getBalances();
  ok(`after reset wallet ${reset.wallet.usdc}, pool ${reset.pool}`, reset.wallet.usdc === 500 && reset.pool === 100);
  ok("after reset spending 0", (await s.getSpendingLimit()).spent === 0);
  ok("after reset no museum booking", (await s.getMuseumBookings()).length === 0);
  ok("after reset no flights", (await s.getMyFlights()).length === 0);
  ok("after reset flight Scheduled", (await s.getFlight(flightId)).status === "Scheduled");
  ok("after reset museum slot free", (await s.museumSlots("gulbenkian", tomorrow)).every((x) => x.booked === 0));
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
