/**
 * Next.js App Router entry (reference / future migration).
 * This repo runs on Vite — the live route is `src/pages/LogicDashboardPage.tsx` → `/logic-dashboard`.
 */
import { SignalLogicReadingDashboard } from "../../src/components/signalLogic/SignalLogicReadingDashboard";
import styles from "../../src/pages/logicDashboard.module.css";

export default function LogicDashboardPage() {
  return (
    <div className={styles.pageRoot}>
      <SignalLogicReadingDashboard />
    </div>
  );
}
