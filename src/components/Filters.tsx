import type { Account } from "@shared/types";
import type { Filters } from "../lib/useFilters";

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export function FilterBar({ accounts, f }: { accounts: Account[]; f: Filters }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium"
        value={f.account}
        onChange={(e) => f.setAccount(e.target.value)}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => f.preset(p.days)}
            className="rounded px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-sm">
        <input
          type="date"
          value={f.from}
          onChange={(e) => f.setRange(e.target.value, f.to)}
          className="rounded-md border border-slate-300 px-2 py-1"
        />
        <span className="text-slate-400">→</span>
        <input
          type="date"
          value={f.to}
          onChange={(e) => f.setRange(f.from, e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1"
        />
      </div>
    </div>
  );
}
