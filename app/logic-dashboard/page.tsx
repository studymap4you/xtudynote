/**
 * Next.js App Router entry (reference / migration).
 * This repo ships with Vite — production route: `src/pages/LogicDashboardPage.tsx` → `/logic-dashboard`.
 */
import { SignalLogicReadingDashboard } from "../../src/components/signalLogic/SignalLogicReadingDashboard";
import styles from "../../src/pages/logicDashboard.module.css";

export default function LogicDashboardRoutePage() {
  return (
    <div className={styles.pageRoot}>
      <SignalLogicReadingDashboard />
    </div>
  );
}
