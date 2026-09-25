"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DinoSprite } from "@/components/pixel";

const LINKS = [
  { href: "/agent", label: "Agent" },
  { href: "/actors", label: "Actors" },
  { href: "/history", label: "History" },
  { href: "/recycle-machine", label: "Recycling" },
  { href: "/play", label: "Play" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="flex items-center gap-4 px-4 py-3 sm:px-6">
      <Link href="/agent" className="flex flex-none items-center gap-2.5">
        <DinoSprite className="h-7 w-auto" />
        <span className="title hidden text-lg sm:inline">Stellar Dino</span>
      </Link>
      <nav className="segments ml-auto max-w-full overflow-x-auto">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="segment flex items-center whitespace-nowrap"
            aria-selected={pathname.startsWith(l.href)}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <span className="badge hidden flex-none md:inline-flex">Testnet</span>
    </header>
  );
}
