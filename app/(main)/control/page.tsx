import Link from "next/link";
import { ActorsConsole } from "@/components/actors-console";
import { LiveRefresh } from "@/components/live-refresh";
import { getMyFlights } from "@/lib/stellar";
import { ControlPanel } from "./panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Control panel" };

const TABS = [
  { id: "demo", label: "Demo controls", href: "/control" },
  { id: "actors", label: "Actors", href: "/control?tab=actors" },
] as const;

export default async function ControlPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const tab = (await searchParams).tab === "actors" ? "actors" : "demo";

  return (
    <main className={`flex min-h-dvh flex-col ${tab === "actors" ? "bg-[#eef1f4] lg:h-dvh" : ""}`}>
      <nav className="sticky top-0 z-10 flex flex-none items-center gap-3 border-b border-line bg-white/90 px-3 py-2 backdrop-blur sm:px-4 sm:py-1.5">
        <span className="hidden text-[13px] font-semibold text-ink-strong sm:inline">Control</span>
        <div className="segments w-full sm:w-auto" role="tablist" aria-label="Control view">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              role="tab"
              aria-selected={tab === t.id}
              className="segment flex min-h-11 flex-1 items-center justify-center sm:min-h-9 sm:flex-none sm:py-1.5"
              scroll={false}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <span className="ml-auto hidden items-center gap-1.5 text-[11.5px] text-subtle sm:flex">
          <span className="size-1.5 animate-pulse rounded-full bg-good" aria-hidden="true" />
          Live · Stellar testnet
        </span>
      </nav>
      {tab === "actors" ? <ActorsConsole showHeader={false} /> : <DemoTab />}
    </main>
  );
}

async function DemoTab() {
  const mine = await getMyFlights();
  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-16 sm:px-6">
      <LiveRefresh />
      <div className="mb-4 mt-5 sm:mb-6 sm:mt-8">
        <h1 className="title text-2xl sm:text-3xl">Control panel</h1>
        <p className="text-sm text-subtle">
          Hidden page to run the demo on cue. The flight buttons act as the Skyscannerd flight-status oracle for the user&apos;s booked flight.
        </p>
      </div>
      <ControlPanel flights={mine} />
    </div>
  );
}
