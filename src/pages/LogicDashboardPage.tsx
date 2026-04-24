import { PublicShell } from "@/components/PublicShell";
import { SignalLogicReadingDashboard } from "@/components/signalLogic/SignalLogicReadingDashboard";
import "@/pages/pages.css";

export function LogicDashboardPage() {
  return (
    <PublicShell light={false}>
      <SignalLogicReadingDashboard />
    </PublicShell>
  );
}
