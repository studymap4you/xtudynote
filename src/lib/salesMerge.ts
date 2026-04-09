import { Timestamp } from "firebase/firestore";
import type { SalesRecord } from "@/types/sales";

export type SaleRow = SalesRecord & { id: string };

function soldAtMs(raw: unknown): number {
  if (raw instanceof Timestamp) return raw.toMillis();
  if (
    raw !== null &&
    typeof raw === "object" &&
    "toMillis" in raw &&
    typeof (raw as { toMillis: () => number }).toMillis === "function"
  ) {
    return (raw as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function mergeSalesById(a: SaleRow[], b: SaleRow[]): SaleRow[] {
  const map = new Map<string, SaleRow>();
  [...a, ...b].forEach((r) => map.set(r.id, r));
  return Array.from(map.values()).sort((x, y) => soldAtMs(y.soldAt) - soldAtMs(x.soldAt));
}
