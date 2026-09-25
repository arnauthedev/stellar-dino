import { LiveProvider } from "@/components/live";
import { Nav } from "@/components/nav";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <LiveProvider>
      <div className="flex min-h-dvh flex-col">
        <Nav />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </LiveProvider>
  );
}
