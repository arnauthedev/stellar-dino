import { PayCheckout } from "./checkout";

// Public phone page reached from the airport shop QR.
export default async function PayPage({ searchParams }: PageProps<"/pay">) {
  const { code } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      {typeof code === "string" && code ? <PayCheckout code={code} /> : <p className="text-subtle">Scan the QR at the shop counter.</p>}
    </main>
  );
}
