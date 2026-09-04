import type { Column } from "../components/DataTable";
import { brl, int, dec, pct } from "./format";

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

export const qualityCol = (): Column<Row> => ({
  key: "quality_score",
  header: "QS",
  align: "right",
  render: (r) => (r.quality_score == null ? "—" : dec(r.quality_score, 0)),
  sortValue: (r) => r.quality_score ?? -1,
});
