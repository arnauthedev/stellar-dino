// Site-wide demo password. The cookie holds a hash of DEMO_PASSWORD, never the password.
// Uses Web Crypto so it works in the proxy and in server actions.

export const AUTH_COOKIE = "demo_auth";

export async function demoToken(): Promise<string> {
  const data = new TextEncoder().encode(`stellar-dino:${process.env.DEMO_PASSWORD ?? ""}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
