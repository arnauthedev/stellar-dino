import "server-only";
import { rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { ACTORS, HORIZON_URL } from "@/config/actors";
import { CONTRACTS, START_LEDGER, USDC, WALLET_RULES } from "@/config/contracts";
import { fromUsdc, invoke, read, readRaw, server, sv, toUsdc, txUrl, type TxResult } from "@/lib/stellar/core";

// Shared Stellar interface for the app (pages, API routes, agent tools).
// Stellar TESTNET only. Every function that moves money returns
// { txHash, explorerUrl } (plus a typed result).

export type { TxResult };

/* ---------- Types ---------- */

export type FlightStatus = "Scheduled" | "OnTime" | "Delayed";

export type Flight = {
  id: string;
  code: string;
  from: string;
  to: string;
  depart: string; // "HH:MM"
  arrive: string; // "HH:MM" (includes delay)
  departMinutes: number;
  arriveMinutes: number;
  price: number;
  status: FlightStatus;
  delayMinutes: number;
};

export type Product = { id: string; name: string; price: number; sustainable: boolean; bottle: boolean };

export type MuseumSlot = { time: string; minutes: number; capacity: number; booked: number; free: number };

export type MuseumBooking = { date: number; time: string; minutes: number; price: number };

export type Receipt = { price: number; userPaid: number; govPaid: number };

export type ActorBalance = {
  name: string;
  address: string;
  xlm: number | null;
  usdc: number | null;
};

export type Balances = {
  wallet: { address: string; usdc: number };
  pool: number; // government subsidy pool held by the shop contract
  airlineHeld: number; // ticket holds waiting for landing
  actors: ActorBalance[];
};

export type HistoryKind =
  | "product_sold"
  | "subsidy_paid"
  | "bottle_recycled"
  | "pool_funded"
  | "product_added"
  | "ticket_sold"
  | "hold_released"
  | "delay_refund"
  | "museum_ticket_sold"
  | "museum_rescheduled";

export type HistoryRow = {
  id: string; // event id, sortable
  kind: HistoryKind;
  contract: "shop" | "airline" | "museum";
  note: string;
  user: string | null;
  amount: number | null;
  data: Record<string, unknown>;
  ledger: number;
  at: string; // ISO time
  txHash: string;
  explorerUrl: string;
};

export type SpendingLimit = { limit: number; spent: number; remaining: number; periodHours: number };

/* ---------- Helpers ---------- */

const WALLET = CONTRACTS.wallet;

export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function toMinutes(time: string | number): number {
  if (typeof time === "number") return time;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Today's date in Lisbon as yyyymmdd (museum slot dates). */
export function demoDate(offsetDays = 0): number {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const s = d.toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" }); // 2026-09-25
  return Number(s.replaceAll("-", ""));
}

const SHOP_ERRORS = { 1: "Product not found", 2: "No unrecycled bottle bought at the shop", 3: "Invalid amount" };
const AIRLINE_ERRORS = { 1: "Flight not found", 2: "Invalid amount", 3: "Flight already reported", 4: "Already booked on this flight" };
const MUSEUM_ERRORS = { 1: "Museum slot not found", 2: "Slot is full", 3: "Museum already booked", 4: "No museum booking", 5: "Invalid amount" };

type RawFlight = {
  id: string;
  code: string;
  from: string;
  to: string;
  depart: number;
  arrive: number;
  price: bigint;
  status: FlightStatus | [FlightStatus];
  delay_minutes: number;
};

function mapFlight(f: RawFlight): Flight {
  const status = (Array.isArray(f.status) ? f.status[0] : f.status) as FlightStatus;
  const delay = status === "Delayed" ? f.delay_minutes : 0;
  return {
    id: f.id,
    code: f.code,
    from: f.from,
    to: f.to,
    depart: hhmm(f.depart),
    arrive: hhmm(f.arrive + delay),
    departMinutes: f.depart,
    arriveMinutes: f.arrive + delay,
    price: toUsdc(f.price),
    status,
    delayMinutes: delay,
  };
}

/* ---------- Airline ---------- */

export async function listFlights(): Promise<Flight[]> {
  return (await read<RawFlight[]>(CONTRACTS.airline, "flights")).map(mapFlight);
}

export async function getFlight(flightId: string): Promise<Flight> {
  return mapFlight(await read<RawFlight>(CONTRACTS.airline, "flight", sv.symbol(flightId)));
}

/** The user's flights (from passenger lists). */
export async function getMyFlights(): Promise<(Flight & { held: number; settled: boolean })[]> {
  const flights = await listFlights();
  const out = [];
  for (const f of flights) {
    const passengers = await read<{ user: string; held: bigint; settled: boolean }[]>(
      CONTRACTS.airline,
      "passengers",
      sv.symbol(f.id),
    );
    const mine = passengers.find((p) => p.user === WALLET);
    if (mine) out.push({ ...f, held: toUsdc(mine.held), settled: mine.settled });
  }
  return out;
}

/** Agent buys a flight ticket from the user's smart wallet. 20% is held until landing. */
export async function buyFlight(flightId: string): Promise<TxResult<{ price: number; held: number }>> {
  const r = await invoke<{ price: bigint; held: bigint }>({
    source: "agent",
    walletKey: "agent",
    contract: CONTRACTS.airline,
    method: "buy_ticket",
    args: [sv.address(WALLET), sv.symbol(flightId)],
    errors: AIRLINE_ERRORS,
  });
  return { ...r, result: { price: toUsdc(r.result.price), held: toUsdc(r.result.held) } };
}

/** Demo oracle (control panel) reports the flight: releases holds or refunds them. */
export async function reportFlightStatus(
  flightId: string,
  delayed: boolean,
  delayMinutes = 120,
): Promise<TxResult<Flight>> {
  const r = await invoke({
    source: "oracle",
    contract: CONTRACTS.airline,
    method: "report_status",
    args: [sv.symbol(flightId), sv.bool(delayed), sv.u32(delayed ? delayMinutes : 0)],
    errors: AIRLINE_ERRORS,
  });
  return { ...r, result: await getFlight(flightId) };
}

/* ---------- Museum ---------- */

const MUSEUM_TIMES = Array.from({ length: 17 }, (_, i) => 600 + i * 30); // 10:00-18:00

export async function museumSlots(date = demoDate()): Promise<MuseumSlot[]> {
  let slots = await read<{ time: number; capacity: number; booked: number }[]>(CONTRACTS.museum, "slots", sv.u32(date));
  if (slots.length === 0) {
    // Museum opens the day on demand.
    await invoke({
      source: "museum",
      contract: CONTRACTS.museum,
      method: "set_slots",
      args: [sv.u32(date), sv.vecU32(MUSEUM_TIMES), sv.u32(20)],
    });
    slots = await read(CONTRACTS.museum, "slots", sv.u32(date));
  }
  return slots.map((s) => ({
    time: hhmm(s.time),
    minutes: s.time,
    capacity: s.capacity,
    booked: s.booked,
    free: s.capacity - s.booked,
  }));
}

export async function getMuseumBooking(): Promise<MuseumBooking | null> {
  const b = await read<{ date: number; time: number; price: bigint } | undefined>(
    CONTRACTS.museum,
    "booking_of",
    sv.address(WALLET),
  );
  return b ? { date: b.date, time: hhmm(b.time), minutes: b.time, price: toUsdc(b.price) } : null;
}

export async function bookMuseum(time: string | number, date = demoDate()): Promise<TxResult<MuseumBooking>> {
  await museumSlots(date);
  const r = await invoke<{ date: number; time: number; price: bigint }>({
    source: "agent",
    walletKey: "agent",
    contract: CONTRACTS.museum,
    method: "buy_ticket",
    args: [sv.address(WALLET), sv.u32(date), sv.u32(toMinutes(time))],
    errors: MUSEUM_ERRORS,
  });
  const b = r.result;
  return { ...r, result: { date: b.date, time: hhmm(b.time), minutes: b.time, price: toUsdc(b.price) } };
}

/** Move the user's museum booking to another slot the same day (free). */
export async function rescheduleMuseum(newTime: string | number): Promise<TxResult<MuseumBooking>> {
  const r = await invoke<{ date: number; time: number; price: bigint }>({
    source: "agent",
    walletKey: "agent",
    contract: CONTRACTS.museum,
    method: "reschedule",
    args: [sv.address(WALLET), sv.u32(toMinutes(newTime))],
    errors: MUSEUM_ERRORS,
  });
  const b = r.result;
  return { ...r, result: { date: b.date, time: hhmm(b.time), minutes: b.time, price: toUsdc(b.price) } };
}

/* ---------- Shop + recycling ---------- */

export async function listProducts(): Promise<Product[]> {
  const raw = await read<{ id: string; name: string; price: bigint; sustainable: boolean; bottle: boolean }[]>(
    CONTRACTS.shop,
    "products",
  );
  return raw.map((p) => ({ ...p, price: toUsdc(p.price) }));
}

/** User (agent) buys a product. Credit applies only to sustainable items; the government pays that part. */
export async function buyProduct(productId: string): Promise<TxResult<Receipt>> {
  const r = await invoke<{ price: bigint; user_paid: bigint; gov_paid: bigint }>({
    source: "agent",
    walletKey: "agent",
    contract: CONTRACTS.shop,
    method: "buy",
    args: [sv.address(WALLET), sv.symbol(productId)],
    errors: SHOP_ERRORS,
  });
  return {
    ...r,
    result: { price: toUsdc(r.result.price), userPaid: toUsdc(r.result.user_paid), govPaid: toUsdc(r.result.gov_paid) },
  };
}

/** Recycling machine: the recycling business records one bottle for the user. */
export async function recordRecycling(): Promise<TxResult<{ credit: number }>> {
  const r = await invoke<bigint>({
    source: "recycler",
    contract: CONTRACTS.shop,
    method: "record_recycling",
    args: [sv.address(WALLET)],
    errors: SHOP_ERRORS,
  });
  return { ...r, result: { credit: toUsdc(r.result) } };
}

export async function getCredit(): Promise<number> {
  return toUsdc(await read<bigint>(CONTRACTS.shop, "credit_of", sv.address(WALLET)));
}

export async function getBottles(): Promise<{ bought: number; recycled: number; unrecycled: number }> {
  const b = await read<{ bought: number; recycled: number }>(CONTRACTS.shop, "bottles_of", sv.address(WALLET));
  return { ...b, unrecycled: b.bought - b.recycled };
}

export async function fundPool(amount: number): Promise<TxResult> {
  return invoke({
    source: "government",
    contract: CONTRACTS.shop,
    method: "fund_pool",
    args: [sv.i128(fromUsdc(amount))],
    errors: SHOP_ERRORS,
  });
}

/* ---------- Wallet: spending limit (set by the user only) ---------- */

export async function getSpendingLimit(): Promise<SpendingLimit> {
  const [data, latest] = await Promise.all([
    read<{
      spending_limit: bigint;
      period_ledgers: number;
      spending_history: { amount: bigint; ledger_sequence: number }[];
    }>(CONTRACTS.spendingPolicy, "get_spending_limit_data", sv.u32(WALLET_RULES.usdc), sv.address(WALLET)),
    server.getLatestLedger(),
  ]);
  const cutoff = latest.sequence - data.period_ledgers;
  const spent = data.spending_history
    .filter((e) => e.ledger_sequence > cutoff)
    .reduce((sum, e) => sum + BigInt(e.amount), 0n);
  const limit = toUsdc(data.spending_limit);
  return {
    limit,
    spent: toUsdc(spent),
    remaining: Math.max(0, limit - toUsdc(spent)),
    periodHours: Math.round((data.period_ledgers * 5) / 3600),
  };
}

/** Change the limit. Signed with the USER's own key (owner rule); the agent cannot do this. */
export async function setSpendingLimit(amount: number): Promise<TxResult> {
  const rule = await readRaw(WALLET, "get_context_rule", sv.u32(WALLET_RULES.usdc));
  return invoke({
    source: "user",
    walletKey: "user",
    contract: CONTRACTS.spendingPolicy,
    method: "set_spending_limit",
    args: [sv.i128(fromUsdc(amount)), rule, sv.address(WALLET)],
  });
}

/* ---------- Balances ---------- */

async function horizonBalances(address: string): Promise<{ xlm: number | null; usdc: number | null }> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`, { cache: "no-store" });
    if (!res.ok) return { xlm: null, usdc: null };
    const acc: { balances: { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string }[] } =
      await res.json();
    const xlm = acc.balances.find((b) => b.asset_type === "native");
    const usdc = acc.balances.find((b) => b.asset_code === USDC.code && b.asset_issuer === USDC.issuer);
    return { xlm: xlm ? Number(xlm.balance) : null, usdc: usdc ? Number(usdc.balance) : null };
  } catch {
    return { xlm: null, usdc: null };
  }
}

async function usdcBalance(address: string): Promise<number> {
  return toUsdc(await read<bigint>(USDC.contract, "balance", sv.address(address)));
}

export async function getBalances(): Promise<Balances> {
  const names = ["user", "government", "recycler", "shop", "airline", "museum", "oracle", "agent"] as const;
  const [wallet, pool, airlineHeld, ...actors] = await Promise.all([
    usdcBalance(WALLET),
    usdcBalance(CONTRACTS.shop),
    usdcBalance(CONTRACTS.airline),
    ...names.map((n) => horizonBalances(ACTORS[n])),
  ]);
  return {
    wallet: { address: WALLET, usdc: wallet },
    pool,
    airlineHeld,
    actors: names.map((name, i) => ({ name, address: ACTORS[name], ...actors[i] })),
  };
}

/* ---------- Stats (actors page) ---------- */

export async function getStats() {
  const [shop, airline, museum] = await Promise.all([
    read<{ products_sold: number; bottles_sold: number; bottles_recycled: number; subsidy_paid: bigint; pool_funded: bigint }>(
      CONTRACTS.shop,
      "stats",
    ),
    read<{ tickets_sold: number; revenue: bigint; holds_released: bigint; refunds_paid: number; refunded: bigint }>(
      CONTRACTS.airline,
      "stats",
    ),
    read<{ tickets_sold: number; reschedules: number; revenue: bigint }>(CONTRACTS.museum, "stats"),
  ]);
  return {
    shop: {
      productsSold: shop.products_sold,
      bottlesSold: shop.bottles_sold,
      bottlesRecycled: shop.bottles_recycled,
      subsidyPaid: toUsdc(shop.subsidy_paid),
      poolFunded: toUsdc(shop.pool_funded),
    },
    airline: {
      ticketsSold: airline.tickets_sold,
      revenue: toUsdc(airline.revenue),
      holdsReleased: toUsdc(airline.holds_released),
      refundsPaid: airline.refunds_paid,
      refunded: toUsdc(airline.refunded),
    },
    museum: { ticketsSold: museum.tickets_sold, reschedules: museum.reschedules, revenue: toUsdc(museum.revenue) },
  };
}

/* ---------- History (contract events) ---------- */

const CONTRACT_NAME: Record<string, HistoryRow["contract"]> = {
  [CONTRACTS.shop]: "shop",
  [CONTRACTS.airline]: "airline",
  [CONTRACTS.museum]: "museum",
};

function eventKind(contract: HistoryRow["contract"], topic: string): HistoryKind | null {
  if (contract === "museum") {
    if (topic === "ticket_sold") return "museum_ticket_sold";
    if (topic === "rescheduled") return "museum_rescheduled";
    return null;
  }
  const known: HistoryKind[] = [
    "product_sold",
    "subsidy_paid",
    "bottle_recycled",
    "pool_funded",
    "product_added",
    "ticket_sold",
    "hold_released",
    "delay_refund",
  ];
  return known.includes(topic as HistoryKind) ? (topic as HistoryKind) : null;
}

function toRow(e: rpc.Api.EventResponse): HistoryRow | null {
  const contractId = typeof e.contractId === "string" ? e.contractId : e.contractId?.contractId();
  const contract = contractId ? CONTRACT_NAME[contractId] : undefined;
  if (!contract) return null;
  const topics = e.topic.map((t) => scValToNative(t));
  const kind = eventKind(contract, String(topics[0]));
  if (!kind) return null;
  const data = scValToNative(e.value) as Record<string, unknown>;
  const user = typeof topics[1] === "string" && /^[CG][A-Z0-9]{55}$/.test(topics[1]) ? topics[1] : null;
  const rawAmount = data.amount ?? data.price ?? null;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) clean[k] = typeof v === "bigint" ? toUsdc(v) : v;
  return {
    id: e.id,
    kind,
    contract,
    note: String(data.note ?? kind),
    user,
    amount: rawAmount === null ? null : toUsdc(rawAmount as bigint),
    data: clean,
    ledger: e.ledger,
    at: e.ledgerClosedAt,
    txHash: e.txHash,
    explorerUrl: txUrl(e.txHash),
  };
}

/**
 * Contract events as friendly rows, oldest first. Pass the returned cursor to
 * poll for new events only. scope "user" keeps only rows about the user's wallet
 * plus public ones (pool funding); "all" keeps everything.
 */
export async function getHistory(
  opts: { cursor?: string; scope?: "user" | "all" } = {},
): Promise<{ rows: HistoryRow[]; cursor: string }> {
  const filters: rpc.Api.EventFilter[] = [
    { type: "contract", contractIds: [CONTRACTS.shop, CONTRACTS.airline, CONTRACTS.museum] },
  ];
  const rows: HistoryRow[] = [];
  let cursor = opts.cursor;
  let startLedger: number | undefined = cursor ? undefined : START_LEDGER;

  for (let page = 0; page < 20; page++) {
    let res: rpc.Api.GetEventsResponse;
    try {
      res = await server.getEvents(
        cursor ? { filters, cursor, limit: 200 } : { filters, startLedger: startLedger!, limit: 200 },
      );
    } catch (err) {
      // START_LEDGER fell out of the RPC retention window: start from the oldest kept ledger.
      const oldest = String(err).match(/range: (\d+)/)?.[1];
      if (!cursor && oldest && startLedger !== Number(oldest)) {
        startLedger = Number(oldest);
        continue;
      }
      throw err;
    }
    for (const e of res.events) {
      const row = toRow(e);
      if (row) rows.push(row);
    }
    cursor = res.cursor;
    if (res.events.length < 200) break;
  }

  const scope = opts.scope ?? "user";
  const filtered =
    scope === "all" ? rows : rows.filter((r) => r.user === WALLET || r.kind === "pool_funded");
  return { rows: filtered, cursor: cursor ?? "" };
}

/* ---------- Demo reset ---------- */

/**
 * Reset the demo state without redeploying: flights back to Scheduled, museum
 * booking cleared, shop credit/bottles cleared, spending history cleared,
 * wallet topped up to 500 USDC and the pool to 100 USDC.
 */
export async function resetDemo(): Promise<string[]> {
  const log: string[] = [];
  const flights = await read<RawFlight[]>(CONTRACTS.airline, "flights");
  for (const f of flights) {
    await invoke({
      source: "airline",
      contract: CONTRACTS.airline,
      method: "add_flight",
      args: [
        sv.symbol(f.id),
        sv.string(f.code),
        sv.string(f.from),
        sv.string(f.to),
        sv.u32(f.depart),
        sv.u32(f.arrive),
        sv.i128(BigInt(f.price)),
      ],
    });
  }
  log.push("flights reset");

  await invoke({
    source: "museum",
    contract: CONTRACTS.museum,
    method: "set_slots",
    args: [sv.u32(demoDate()), sv.vecU32(MUSEUM_TIMES), sv.u32(20)],
  });
  await invoke({ source: "museum", contract: CONTRACTS.museum, method: "reset_user", args: [sv.address(WALLET)] });
  log.push("museum reset");

  await invoke({ source: "shop", contract: CONTRACTS.shop, method: "reset_user", args: [sv.address(WALLET)] });
  log.push("shop credit + bottles reset");

  // Clear spending history: reinstall the spending-limit policy (owner-signed).
  const limit = await getSpendingLimit();
  const policyId = await read<number>(WALLET, "get_policy_id", sv.address(CONTRACTS.spendingPolicy));
  await invoke({
    source: "user",
    walletKey: "user",
    contract: WALLET,
    method: "remove_policy",
    args: [sv.u32(WALLET_RULES.usdc), sv.u32(policyId)],
  });
  const params = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: sv.symbol("period_ledgers"), val: sv.u32(17_280) }),
    new xdr.ScMapEntry({ key: sv.symbol("spending_limit"), val: sv.i128(fromUsdc(limit.limit)) }),
  ]);
  await invoke({
    source: "user",
    walletKey: "user",
    contract: WALLET,
    method: "add_policy",
    args: [sv.u32(WALLET_RULES.usdc), sv.address(CONTRACTS.spendingPolicy), params],
  });
  log.push("spending history cleared");

  const { wallet, pool } = await getBalances();
  if (wallet.usdc < 500) {
    await invoke({
      source: "issuer",
      contract: USDC.contract,
      method: "mint",
      args: [sv.address(WALLET), sv.i128(fromUsdc(500 - wallet.usdc))],
    });
  }
  if (pool < 100) await fundPool(100 - pool);
  log.push("balances topped up");
  return log;
}
