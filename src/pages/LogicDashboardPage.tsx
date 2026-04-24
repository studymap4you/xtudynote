import { PublicShell } from "@/components/PublicShell";
import { SignalLogicReadingDashboard } from "@/components/signalLogic/SignalLogicReadingDashboard";
import styles from "@/pages/logicDashboard.module.css";
import "@/pages/pages.css";

export function LogicDashboardPage() {
  return (
    <PublicShell light={true}>
      <div className={styles.pageRoot}>
        <SignalLogicReadingDashboard />
      </div>
    </PublicShell>
  );
}
