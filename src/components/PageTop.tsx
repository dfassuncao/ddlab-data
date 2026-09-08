import type { ReactNode } from "react";
import { usePage } from "../lib/usePage";
import { SourcePills } from "./SourcePills";

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export function PageTop({
  title,
  subtitle,
  actions,
  hidePills,
}: {
  title: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  hidePills?: boolean;
}) {
  const { f, account } = usePage();

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => f.preset(p.days)}
                className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <input
              type="date"
              value={f.from}
              onChange={(e) => f.setRange(e.target.value, f.to)}
              className="rounded border border-slate-300 px-1.5 py-1"
            />
            <span>→</span>
            <input
              type="date"
              value={f.to}
              onChange={(e) => f.setRange(f.from, e.target.value)}
              className="rounded border border-slate-300 px-1.5 py-1"
            />
          </div>
        </div>
      </div>
      {!hidePills && account && <SourcePills account={account.id} />}
    </div>
  );
}
