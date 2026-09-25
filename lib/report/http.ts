import "server-only";
import { NextResponse } from "next/server";
import { ReportError } from "@/lib/report/reports";

// JSON helpers shared by the /api/report route handlers.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReportId(id: string): boolean {
  return UUID.test(id);
}

export function notFound() {
  return NextResponse.json({ ok: false, error: "Report not found." }, { status: 404 });
}

export function errorResponse(err: unknown) {
  if (err instanceof ReportError) {
    return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: err.status });
  }
  console.error("[report]", err instanceof Error ? err.message : err);
  return NextResponse.json({ ok: false, error: "Something went wrong. Please try again.", code: "server" }, { status: 500 });
}

export async function readJson<T>(req: Request): Promise<Partial<T>> {
  return ((await req.json().catch(() => ({}))) ?? {}) as Partial<T>;
}
