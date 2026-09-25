import { listProducts } from "@/lib/stellar";
import { ShopCounter } from "./counter";

export const metadata = { title: "Airport shop" };

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <div className="mt-8">
        <ShopCounter products={await listProducts()} />
      </div>
    </main>
  );
}
