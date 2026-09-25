import "server-only";
import OpenAI from "openai";

// The ONLY module that talks to the AI provider. Swap the provider here.

type ReasoningEffort = "minimal" | "low" | "medium" | "high";

let client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export function aiModel(): string {
  const model = process.env.AI_MODEL;
  if (!model) throw new Error("AI_MODEL is not set");
  return model;
}

export function aiReasoningEffort(): ReasoningEffort {
  return (process.env.AI_REASONING_EFFORT as ReasoningEffort) || "low";
}

/** Single-turn text generation. */
export async function generateText(opts: {
  instructions?: string;
  input: string;
}): Promise<string> {
  const res = await getClient().responses.create({
    model: aiModel(),
    reasoning: { effort: aiReasoningEffort() },
    instructions: opts.instructions,
    input: opts.input,
  });
  return res.output_text;
}

/** Tiny round-trip used by /health. */
export async function pingAI(): Promise<{ ok: boolean; detail: string }> {
  try {
    const text = await generateText({ input: "Reply with the single word: pong" });
    return { ok: text.trim().length > 0, detail: text.trim().slice(0, 40) };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
