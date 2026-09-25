import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DinoSprite, Ground } from "@/components/pixel";
import { AUTH_COOKIE, demoToken } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const next = String(formData.get("next") || "/agent");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/agent";
  if (formData.get("password") !== process.env.DEMO_PASSWORD) {
    redirect(`/login?error=1&next=${encodeURIComponent(safeNext)}`);
  }
  (await cookies()).set(AUTH_COOKIE, await demoToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(safeNext);
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <form action={login} className="card w-full max-w-sm space-y-5 p-7">
        <div>
          <DinoSprite className="h-14 w-auto" />
          <Ground className="mt-0.5" />
        </div>
        <div>
          <h1 className="title text-2xl">Stellar Dino</h1>
          <p className="text-sm text-subtle">Enter the demo password.</p>
        </div>
        <input type="hidden" name="next" value={typeof next === "string" ? next : "/agent"} />
        <input className="field" type="password" name="password" placeholder="Password" autoFocus required />
        {error && <p className="text-sm text-bad">Wrong password. Try again.</p>}
        <button className="btn btn-primary w-full">Enter</button>
      </form>
    </main>
  );
}
