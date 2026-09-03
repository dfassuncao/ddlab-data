import type { Column } from "../components/DataTable";
import { brl, int, dec, pct, pctFrac } from "./format";

type Row = Record<string, any>;

export const metricCols = (currency = "BRL"): Column<Row>[] => [
  { key: "impressions", header: "Impr.", align: "right", render: (r) => int(r.impressions) },
  { key: "clicks", header: "Cliques", align: "right", render: (r) => int(r.clicks) },
  { key: "ctr", header: "CTR", align: "right", render: (r) => pct(r.ctr) },
  { key: "cost", header: "Custo", align: "right", render: (r) => brl(r.cost, currency) },
  { key: "cpc", header: "CPC", align: "right", render: (r) => brl(r.cpc, currency) },
  { key: "conversions", header: "Conv.", align: "right", render: (r) => dec(r.conversions, 1) },
  { key: "cvr", header: "CVR", align: "right", render: (r) => pct(r.cvr) },
  {
    key: "cpa",
    header: "CPA",
    align: "right",
    render: (r) => brl(r.cpa, currency),
    sortValue: (r) => r.cpa ?? Number.MAX_SAFE_INTEGER,
  },
  {
    key: "roas",
    header: "ROAS",
    align: "right",
    render: (r) => (r.roas == null ? "—" : `${dec(r.roas, 2)}x`),
    sortValue: (r) => r.roas ?? -1,
  },
];

export const isCols = (): Column<Row>[] => [
  {
    key: "search_is",
    header: "Impr. Share",
    align: "right",
    render: (r) => pctFrac(r.search_is),
    sortValue: (r) => r.search_is ?? -1,
  },
  {
    key: "budget_lost_is",
    header: "IS perd. verba",
    align: "right",
    render: (r) => pctFrac(r.budget_lost_is),
    sortValue: (r) => r.budget_lost_is ?? -1,
  },
];
