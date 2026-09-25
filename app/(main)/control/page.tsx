import { LiveRefresh } from "@/components/live-refresh";
import { getMyFlights, listFlights } from "@/lib/stellar";
import { ControlPanel } from "./panel";

export const metadata = { title: "Control panel" };

export const dynamic = "force-dynamic";

export default async function ControlPage() {
  const [flights, mine] = await Promise.all([listFlights(), getMyFlights()]);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <LiveRefresh />
      <div className="mb-6 mt-8">
        <h1 className="title text-3xl">Control panel</h1>
        <p className="text-sm text-subtle">Hidden page to run the demo on cue. The flight buttons act as the Skyscannerd flight-status oracle.</p>
      </div>
      <ControlPanel flights={flights} bookedFlight={mine[0]?.id} />
    </main>
  );
}
