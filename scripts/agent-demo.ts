// Runs demo conversations through Dino (real model + testnet), accepting its cards.
// Resets the demo first. Usage: npm run test:agent
import { acceptCard, type Card } from "@/lib/agent/cards";
import { delayImpact, delayInstruction } from "@/lib/agent/delay";
import { askDino } from "@/lib/agent/dino";
import type { AiMessage } from "@/lib/ai";
import { markDemoReset } from "@/lib/demo";
import { getMuseumBookings, getMyFlights, recordRecycling, reportFlightStatus, resetDemo } from "@/lib/stellar";
import { isoDate, todayNum } from "@/lib/trip";

const history: AiMessage[] = [];

function summary(card: Card | null): string {
  if (!card) return "-";
  if (card.kind === "proposal")
    return `proposal: ${[...card.flights.map((f) => `${f.code} ${f.from}->${f.to} ${f.dateLabel} ${f.depart}-${f.arrive}`), ...card.museums.map((m) => `${m.name} ${m.dateLabel} ${m.time}`)].join(" + ")} = ${card.total}`;
  if (card.kind === "product") return `product: ${card.product.name} ${card.product.youPay}`;
  return `${card.kind} (${"options" in card ? card.options.length : 0} options)`;
}

async function say(content: string, opts: { event?: boolean; accept?: boolean } = {}) {
  history.push({ role: opts.event ? "developer" : "user", content: opts.event ? `EVENT: ${content}` : content });
  const t = Date.now();
  const r = await askDino(history);
  history.push({ role: "assistant", content: r.reply });
  console.log(`\n${opts.event ? "EVENT" : "USER"}: ${content}`);
  console.log(`DINO (${((Date.now() - t) / 1000).toFixed(1)}s): ${r.reply}`);
  console.log(`  tools: ${r.calls.map((c) => c.name + (c.error ? `[ERR ${c.error}]` : "")).join(", ") || "-"}`);
  console.log(`  card: ${summary(r.card)}`);
  if (r.actions.length) console.log(`  actions: ${JSON.stringify(r.actions)}`);
  if (opts.accept && r.card && (r.card.kind === "proposal" || r.card.kind === "product")) {
    const a = await acceptCard(
      r.card.kind === "proposal"
        ? { kind: "proposal", flightIds: r.card.flights.map((f) => f.id), museums: r.card.museums.map((m) => ({ museumId: m.museumId, date: m.date, time: m.time })) }
        : { kind: "product", productId: r.card.product.id },
    );
    console.log(`  ACCEPTED: ${a.message}`);
    history.push({ role: "assistant", content: a.message });
  }
  return r;
}

(async () => {
  console.log("reset:", (await resetDemo()).join(", "));
  await markDemoReset();
  const dayAfter = isoDate(todayNum(2));

  await say("Book a flight from Barcelona to Lisbon tomorrow morning.", { accept: true });
  await say("Book a museum of classic art tomorrow, as early as possible after I land.", { accept: true });
  await say(`Book a flight from Lisbon to Paris on ${dayAfter} and I also want to see a museum of contemporary art in Lisbon before I leave, can you book it?`, { accept: true });
  console.log("\n  flights:", (await getMyFlights()).map((f) => `${f.code} ${f.date} ${f.depart}-${f.arrive}`).join(" | "));
  console.log("  museums:", (await getMuseumBookings()).map((m) => `${m.museumName} ${m.date} ${m.time}`).join(" | "));

  const first = (await getMyFlights())[0];
  const delay = await reportFlightStatus(first.id, true, 120);
  const instruction = delayInstruction(await delayImpact(delay.result));
  console.log("  instruction:", instruction.replace(/\n/g, " / "));
  await say(instruction, { event: true });
  console.log("  museums after delay:", (await getMuseumBookings()).map((m) => `${m.museumName} ${m.date} ${m.time}`).join(" | "));
  await say("And book a museum of classic art the day after tomorrow in the afternoon.", { accept: true });

  await say("Buy me a bottle of water.", { accept: true });
  await recordRecycling();
  await say("I just recycled my bottle. What can I buy with my credit?");
  await say("Buy the bamboo bottle.", { accept: true });
  await say("I'm bored, any indoor sport idea?");
})().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
