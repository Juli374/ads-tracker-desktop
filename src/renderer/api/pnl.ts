// Pure data plumbing for P&L. No AI — Start tier, free.
//
// Aggregator: parallel fetches summaryByBook (ads spend + sales) + royalty list
// (cloud or local), merges per book by title+marketplace, computes net profit per row:
//
//   revenue   = royalty_revenue (KDP list-price total) || royalty (fallback)
//   spend     = ads_cost (summaryByBook.cost)
//   print     = printCostPerBook * orders   (0 if not configured)
//   returns   = from royalty record if backend exposes; else 0
//   netProfit = revenue - spend - print - returns
//   margin    = revenue > 0 ? netProfit / revenue : 0
//
// Backend currently doesn't ship per-ASIN royalty in summaryByBook, and KDP
// reports may not expose returns. All matching is best-effort by title+marketplace.

import type { Attribution, BookFilters } from './metrics';
import { metricsApi } from './metrics';
import { royaltiesApi } from './royalties';
import { localRoyaltyApi } from './localRoyalty';

export type PnLSource = 'cloud' | 'local';

export interface PnLBookRow {
  bookId: number | null;
  asin: string | null;
  title: string;
  marketplace: string;
  currency: string;
  revenue: number;
  spend: number;
  printCost: number;
  returns: number;
  netProfit: number;
  /** 0..1; 0 if revenue is 0. */
  margin: number;
  orders: number;
}

export interface PnLTotals {
  revenue: number;
  spend: number;
  printCost: number;
  returns: number;
  netProfit: number;
  margin: number;
}

export interface PnLData {
  from: string;
  to: string;
  attribution: Attribution;
  rows: PnLBookRow[];
  totals: PnLTotals;
}

interface RoyaltyAgg {
  royalty: number;
  revenue: number;
  returns: number;
  marketplace: string;
  currency?: string;
  title?: string;
  asin?: string;
}

export interface ComputePnLParams extends BookFilters {
  from: string;
  to: string;
  attribution?: Attribution;
  source?: PnLSource;
  /** YYYY-MM. Defaults to month part of `to`. */
  targetMonth?: string;
  /** book_id -> per-unit print cost. Defaults to {} (printCost = 0 for all books). */
  printCostByBookId?: Record<number, number>;
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function num(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

function indexRoyaltyByAsin(
  rows: Array<Record<string, unknown>> | undefined,
): Map<string, RoyaltyAgg> {
  const out = new Map<string, RoyaltyAgg>();
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const asin = typeof r.asin === 'string' ? r.asin : null;
    if (!asin) continue;
    const marketplace = typeof r.marketplace === 'string' ? r.marketplace : '';
    const royalty = num(r.royalty) ?? num(r.total_royalty) ?? 0;
    const revenue = num(r.revenue) ?? num(r.total_revenue) ?? 0;
    const returns = num(r.returns) ?? 0;
    const currency = typeof r.currency === 'string' ? r.currency : undefined;
    const title = typeof r.book_title === 'string' ? r.book_title : undefined;
    out.set(`${asin}|${marketplace.toUpperCase()}`, {
      royalty,
      revenue,
      returns,
      marketplace,
      currency,
      title,
      asin,
    });
  }
  return out;
}

async function fetchLocalRoyaltyMap(
  targetMonth: string,
): Promise<Map<string, RoyaltyAgg>> {
  const out = new Map<string, RoyaltyAgg>();
  try {
    const uploads = await localRoyaltyApi.listUploads();
    const monthUploads = uploads.filter((u) => u.target_month === targetMonth);
    for (const u of monthUploads) {
      const records = await localRoyaltyApi.listRecords(u.id);
      for (const r of records) {
        if (!r.asin) continue;
        const key = `${r.asin}|${r.marketplace.toUpperCase()}`;
        const prev = out.get(key);
        if (prev) {
          prev.royalty += r.royalty;
          prev.revenue += r.revenue;
        } else {
          out.set(key, {
            royalty: r.royalty,
            revenue: r.revenue,
            returns: 0,
            marketplace: r.marketplace,
            currency: r.currency,
            title: r.book_title,
            asin: r.asin,
          });
        }
      }
    }
  } catch {
    // graceful: local store unavailable → empty map
  }
  return out;
}

function indexByTitleMp(map: Map<string, RoyaltyAgg>): Map<string, RoyaltyAgg> {
  const out = new Map<string, RoyaltyAgg>();
  for (const v of map.values()) {
    if (!v.title) continue;
    const k = `${v.title.toLowerCase()}|${(v.marketplace || '').toUpperCase()}`;
    const prev = out.get(k);
    if (prev) {
      prev.royalty += v.royalty;
      prev.revenue += v.revenue;
      prev.returns += v.returns;
    } else {
      out.set(k, { ...v });
    }
  }
  return out;
}

export async function computePnL(params: ComputePnLParams): Promise<PnLData> {
  const {
    from,
    to,
    attribution = '7d',
    source = 'cloud',
    targetMonth = monthOf(to),
    marketplace,
    marketplaces,
    bookIds,
    accounts,
    printCostByBookId = {},
  } = params;

  const summaryPromise = metricsApi.summaryByBook({
    from,
    to,
    attribution,
    marketplace,
    marketplaces,
    bookIds,
    accounts,
  });

  const royaltyPromise: Promise<Map<string, RoyaltyAgg>> =
    source === 'cloud'
      ? royaltiesApi
          .getSummary(targetMonth)
          .then((res) => indexRoyaltyByAsin(res?.by_book))
          .catch(() => new Map<string, RoyaltyAgg>())
      : fetchLocalRoyaltyMap(targetMonth);

  const [summary, royaltyAsinMap] = await Promise.all([
    summaryPromise,
    royaltyPromise,
  ]);

  const royaltyByTitleMp = indexByTitleMp(royaltyAsinMap);

  const rows: PnLBookRow[] = (summary.books ?? []).map((b) => {
    const titleKey = `${b.title.toLowerCase()}|${(b.marketplace || '').toUpperCase()}`;
    const ro = royaltyByTitleMp.get(titleKey);
    // Royalty money: prefer aggregated royalty record; fallback to summaryByBook.royalty.
    const royaltyMoney = ro?.royalty ?? b.royalty ?? 0;
    // Revenue: prefer KDP-reported revenue (list-price * units) if exposed.
    const revenue =
      ro?.revenue != null && ro.revenue > 0 ? ro.revenue : royaltyMoney;
    const returns = ro?.returns ?? 0;
    const printPerUnit = printCostByBookId[b.book_id] ?? 0;
    const orders = b.orders ?? 0;
    const printCost = printPerUnit * orders;
    const spend = b.cost ?? 0;
    const netProfit = revenue - spend - printCost - returns;
    const margin = revenue > 0 ? netProfit / revenue : 0;
    return {
      bookId: b.book_id,
      asin: ro?.asin ?? null,
      title: b.title,
      marketplace: b.marketplace ?? '',
      currency: b.currency,
      revenue,
      spend,
      printCost,
      returns,
      netProfit,
      margin,
      orders,
    };
  });

  const totals = rows.reduce<PnLTotals>(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      spend: acc.spend + r.spend,
      printCost: acc.printCost + r.printCost,
      returns: acc.returns + r.returns,
      netProfit: acc.netProfit + r.netProfit,
      margin: 0,
    }),
    { revenue: 0, spend: 0, printCost: 0, returns: 0, netProfit: 0, margin: 0 },
  );
  totals.margin = totals.revenue > 0 ? totals.netProfit / totals.revenue : 0;

  return { from, to, attribution, rows, totals };
}

// Exposed for tests.
export const __testing = {
  indexRoyaltyByAsin,
  indexByTitleMp,
  monthOf,
};
