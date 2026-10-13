import { RefreshCw } from "lucide-react";
import { btnGhost } from "@/lib/format";

export const LiveSync = ({ lastSync, onRefresh }) => (
  <div className="flex items-center gap-2">
    <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700" data-testid="live-sync-indicator">
      <span className="live-dot h-2 w-2 rounded-full bg-emerald-500" />
      Live · {lastSync ? lastSync.toLocaleTimeString("en-IN") : "syncing"}
    </span>
    <button type="button" className={btnGhost} onClick={onRefresh} data-testid="refresh-btn" aria-label="Refresh">
      <RefreshCw className="h-4 w-4" />
    </button>
  </div>
);
