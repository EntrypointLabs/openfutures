import { FundingTableCard } from "@/components/watch/FundingTableCard";
import type { TerminalViewModel } from "@/terminal/types";

export function FundingView({ vm }: { vm: TerminalViewModel }) {
  return <FundingTableCard vm={vm} />;
}
