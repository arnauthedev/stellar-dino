import { CONTRACTS } from "@/config/contracts";
import { getAgentState } from "@/lib/agent-state";
import { AgentView } from "./view";

export const metadata = { title: "Dino" };

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const state = await getAgentState();
  return <AgentView initial={state} wallet={CONTRACTS.wallet} />;
}
