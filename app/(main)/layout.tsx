import { LiveProvider } from "@/components/live";

// No top bar: the demo runs in separate tabs (/agent, /recycle-machine, /shop, /actors, hidden /control).
export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <LiveProvider>
      <div className="flex min-h-dvh flex-col">{children}</div>
    </LiveProvider>
  );
}
