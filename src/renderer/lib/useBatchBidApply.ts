// src/renderer/lib/useBatchBidApply.ts
import { useCallback, useState } from 'react';
import { amazonAdsApi, type BulkUpdateResponse } from '../api/amazonAds';
import {
  resolveBidUpdates,
  resolveStateUpdates,
  type BidEditSpec,
  type BidTargetInput,
  type BidUpdate,
} from './resolveBids';

export interface BatchApplyOutcome {
  applied: number;
  failed: number;
  skipped: number;
  /** target_ids the backend reported in errors[] (for selective revert/inspection). */
  failedIds: number[];
}

interface Options {
  /** Optimistically write resolved bids to local state, keyed target_id -> bid. */
  patchBids?: (byId: Map<number, number>) => void;
  /** Restore the pre-apply snapshot (full revert on whole-batch failure). */
  revert?: () => void;
  /** Reconcile with server truth after the call settles (e.g. reload()). */
  reload?: () => Promise<void> | void;
}

/**
 * One hook for all three bulk-bid surfaces. `applyBids` resolves multiply/delta/set
 * to absolute bids client-side, then POSTs the batch and reconciles. `applyState`
 * does the pause/resume path (uppercase ENABLED/PAUSED, no bid).
 */
export function useBatchBidApply(opts: Options) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (updates: BidUpdate[], selected: BidTargetInput[], skippedCount: number): Promise<BatchApplyOutcome> => {
      if (updates.length === 0) {
        return { applied: 0, failed: 0, skipped: skippedCount, failedIds: [] };
      }
      // Optimistic bid patch (only items that carry a bid).
      const optimistic = new Map<number, number>();
      for (const u of updates) if (typeof u.bid === 'number') optimistic.set(u.target_id, u.bid);

      setBusy(true);
      if (optimistic.size > 0) opts.patchBids?.(optimistic);
      try {
        const res: BulkUpdateResponse = await amazonAdsApi.setTargetBidsBatch(updates);
        // Failures live in errors[] (NOT results[].ok). Selectively revert them.
        const failedIds = (res.errors ?? []).map((e) => e.target_id);
        if (failedIds.length > 0 && optimistic.size > 0) {
          const prior = new Map<number, number>();
          const failedSet = new Set(failedIds);
          for (const t of selected) {
            if (t.target_id != null && failedSet.has(t.target_id) && typeof t.bid === 'number') {
              prior.set(t.target_id, t.bid); // snap failed rows back to original bid
            }
          }
          if (prior.size > 0) opts.patchBids?.(prior);
        }
        await opts.reload?.();
        return {
          applied: res.succeeded ?? updates.length - failedIds.length,
          failed: res.failed ?? failedIds.length,
          skipped: skippedCount,
          failedIds,
        };
      } catch (err) {
        opts.revert?.(); // whole-batch non-2xx → full revert, keep selection
        throw err;       // caller toasts ApiError.message
      } finally {
        setBusy(false);
      }
    },
    [opts],
  );

  const applyBids = useCallback(
    (selected: BidTargetInput[], spec: BidEditSpec) => {
      const { updates, skipped } = resolveBidUpdates(selected, spec);
      return run(updates, selected, skipped.length);
    },
    [run],
  );

  const applyState = useCallback(
    (selected: BidTargetInput[], state: 'ENABLED' | 'PAUSED') => {
      const { updates, skipped } = resolveStateUpdates(selected, state);
      return run(updates, selected, skipped.length);
    },
    [run],
  );

  return { applyBids, applyState, busy };
}
