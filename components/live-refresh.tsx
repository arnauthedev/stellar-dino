"use client";

import { useRouter } from "next/navigation";
import { useChainEvents } from "@/components/live";

/** Re-render the current server page when new chain events arrive. */
export function LiveRefresh() {
  const router = useRouter();
  useChainEvents(() => router.refresh());
  return null;
}
