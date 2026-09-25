import { ActorsConsole } from "@/components/actors-console";

export const metadata = { title: "Actors · Stellar Dino" };

export const dynamic = "force-dynamic";

export default function ActorsPage() {
  return (
    <main className="flex min-h-dvh flex-col lg:h-dvh">
      <ActorsConsole />
    </main>
  );
}
