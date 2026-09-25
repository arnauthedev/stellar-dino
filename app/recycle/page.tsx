import { Claim } from "./claim";

// Public phone page reached from the recycling machine QR.
export default async function RecyclePage({ searchParams }: PageProps<"/recycle">) {
  const { code } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      {typeof code === "string" && code ? (
        <Claim code={code} />
      ) : (
        <p className="text-subtle">Scan the QR code on the recycling machine.</p>
      )}
    </main>
  );
}
