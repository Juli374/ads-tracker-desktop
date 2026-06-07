// Canonical list of navigable views.
//
// Extracted from src/renderer/contexts/NavContext.tsx so that shared/ code
// (notably the module-activation registry in src/shared/modules.ts) can
// reference ViewId without creating a renderer→shared import cycle. NavContext
// re-exports this type, so existing
//   import { ViewId } from '../contexts/NavContext'
// call sites keep working unchanged.
export type ViewId =
  | 'dashboard'
  | 'books'
  | 'search_terms'
  | 'campaigns'
  | 'campaign_details'
  | 'keywords'
  | 'reports'
  | 'comparison'
  | 'negatives'
  | 'action_center'
  | 'automation'
  | 'alerts'
  | 'royalties'
  | 'pnl'
  | 'operations'
  | 'accounting'
  | 'profile'
  // Phase L Lane A — AI-assisted listing rewrite (Pro tier).
  | 'listing_studio'
  // Phase M.1 — Niche Explorer / Research page (Pro tier).
  | 'research'
  // Phase M.5 Lane E — Weekly Author Briefing page (Pro tier).
  | 'briefing'
  | 'settings';
