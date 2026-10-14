import { ExchangesTableCard } from "@/components/watch/ExchangesTableCard";
import type { TerminalViewModel } from "@/terminal/types";

export function ExchangesView({ vm }: { vm: TerminalViewModel }) {
  return <ExchangesTableCard vm={vm} />;
}
