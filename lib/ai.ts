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

/* ---------- Tool-using agent loop (provider-agnostic interface) ---------- */

export type AiTool = {
  name: string;
  description: string;
  /** JSON schema of the arguments. */
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
};

export type AiMessage = { role: "user" | "assistant" | "developer"; content: string };

export type AiToolCall = { name: string; args: Record<string, unknown>; result?: unknown; error?: string };

/** Run the model with tools until it answers in text (or maxSteps is reached). */
export async function runAgent(opts: {
  instructions: string;
  messages: AiMessage[];
  tools: AiTool[];
  maxSteps?: number;
}): Promise<{ text: string; calls: AiToolCall[] }> {
  const tools = opts.tools.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: false,
  }));
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const input: OpenAI.Responses.ResponseInput = opts.messages.map((m) => ({ role: m.role, content: m.content }));
  const calls: AiToolCall[] = [];

  for (let step = 0; step < (opts.maxSteps ?? 10); step++) {
    const res = await getClient().responses.create({
      model: aiModel(),
      reasoning: { effort: aiReasoningEffort() },
      instructions: opts.instructions,
      input,
      tools,
    });
    const fnCalls = res.output.filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === "function_call");
    if (fnCalls.length === 0) return { text: res.output_text, calls };

    input.push(...(res.output as OpenAI.Responses.ResponseInputItem[]));
    for (const call of fnCalls) {
      const tool = byName.get(call.name);
      const args = safeJson(call.arguments);
      let output: unknown;
      try {
        if (!tool) throw new Error(`Unknown tool ${call.name}`);
        output = await tool.run(args);
        calls.push({ name: call.name, args, result: output });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        output = { error };
        calls.push({ name: call.name, args, error });
      }
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) });
    }
  }
  return { text: "Sorry, that took too many steps. Could you try again?", calls };
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

/* ---------- Vision (street reports) ---------- */

/** One image + text in, strict JSON (by schema) out. Returns the raw parsed JSON and token usage. */
export async function analyzeImageJson(opts: {
  instructions: string;
  text: string;
  imageDataUrl: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<{ json: unknown; model: string; tokensIn: number; tokensOut: number }> {
  const model = process.env.VISION_MODEL || "gpt-5.6-luna";
  const res = await getClient().responses.create({
    model,
    reasoning: { effort: aiReasoningEffort() },
    instructions: opts.instructions,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: opts.text },
          { type: "input_image", image_url: opts.imageDataUrl, detail: "auto" },
        ],
      },
    ],
    text: { format: { type: "json_schema", name: opts.schemaName, schema: opts.schema, strict: true } },
  });
  const tokensIn = res.usage?.input_tokens ?? 0;
  const tokensOut = res.usage?.output_tokens ?? 0;
  console.info(`[vision] model=${model} tokens_in=${tokensIn} tokens_out=${tokensOut}`);
  const refusal = res.output
    .flatMap((o) => (o.type === "message" ? o.content : []))
    .find((c) => c.type === "refusal");
  if (refusal) throw new Error("The model declined to analyse this photo.");
  let json: unknown;
  try {
    json = JSON.parse(res.output_text);
  } catch {
    throw new Error("The model returned an unreadable answer.");
  }
  return { json, model, tokensIn, tokensOut };
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
