import { LiveRefresh } from "@/components/live-refresh";
import { getMyFlights } from "@/lib/stellar";
import { ControlPanel } from "./panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Control panel" };

export default async function ControlPage() {
  const mine = await getMyFlights();
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <LiveRefresh />
      <div className="mb-6 mt-8">
        <h1 className="title text-3xl">Control panel</h1>
        <p className="text-sm text-subtle">Hidden page to run the demo on cue. The flight buttons act as the Skyscannerd flight-status oracle for the user&apos;s booked flight.</p>
      </div>
      <ControlPanel flights={mine} />
    </main>
  );
}
