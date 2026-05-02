# Analytics — Port Manifest

Audit of every script under
`/Users/jakeaaron/Downloads/CC Agent/CCAgentindex/analytics_scripts/`,
classified by what it'd take to rerun against the **new Close org** that
Comeketo Agent points at (`Openera Automation` practice org / Comeketo
production org — both via `lib/close.ts`).

The seven snapshots already in `src/data/analytics/*.json` were exported by
these scripts against the **legacy** Close org. They power the current
`/analytics` page. Rerunning any script with the new org will refresh the
corresponding snapshot — but several scripts need work first.

---

## Status legend

- ✅ **clean** — script reads from generic Close exports (CSV/JSON) and has
  no org-specific custom field IDs hardcoded. Just point it at fresh
  exports + a new output path and run.
- ⚠️ **path-only** — script references a hardcoded
  `~/Comeketo/ComeketoData /…` path (note the trailing space — bug in the
  legacy convention). Just plumb a new `--phone-library-dir` and you're
  done.
- 🟡 **schema-port** — script hardcodes Close **custom field IDs**
  (`custom.cf_…`). The new org has different IDs. Need to either (a) export
  the new org's custom-field catalog and remap, or (b) take the field IDs
  as CLI args.
- ❌ **no snapshot yet** — script exists but its output isn't in
  `src/data/analytics/`, OR view exists in the legacy app but no script
  exists in this folder.
- ➕ **new** — visible in the legacy app's analytics page but neither
  script nor snapshot survives. Build from scratch.

---

## Scripts → snapshots map

### Snapshots that are already wired into `/analytics`

| Snapshot file | Script | Status | Notes |
|---|---|---|---|
| `source_channel_snapshot.json` | `build_source_channel_intelligence.py` | 🟡 schema-port | Hardcodes `SOURCE_FIELD`, `CUSTOMER_TYPE_FIELD`, `ASSIGNMENT_LANE_FIELD`, `INTERNAL_FLAGS_FIELD`. Read live values from new org's lead-status / custom-fields catalog and re-derive. |
| `seller_performance_snapshot.json` | `build_seller_performance_intelligence.py` | ⚠️ path-only | Reads only normalized CSVs; no hardcoded custom fields. Re-export normalized layer from new org → run. |
| `win_loss_snapshot.json` | (assumed) | ⚠️ path-only | Output schema `funnel`, `by_*` cuts. Confirm script in folder. |
| `revenue_trends_snapshot.json` | (assumed) | ⚠️ path-only | YoY comparison + percentiles + monthly trend. |
| `upcoming_events_snapshot.json` | `build_event_ops_registry.py` | ⚠️ path-only | Reads opps with event date → schedule. |
| `booking_lead_time_snapshot.json` | `build_schedule_commitment_registry.py` | ⚠️ path-only | Lead-time histogram + segments. |
| `cohort_snapshot.json` | (cohort builder, name TBD) | ⚠️ path-only | Conversion curves + cohort grid. |

### Scripts in folder, no snapshot wired

| Script | Status | Output dir (legacy) |
|---|---|---|
| `build_action_intelligence.py` | ⚠️ path-only | `…/action_intelligence/` |
| `build_conversation_intelligence.py` | ⚠️ path-only | `…/conversation_intelligence/` |
| `build_handoff_package.py` | ⚠️ path-only | `…/handoff_package/` |
| `build_lead_business_context.py` | ⚠️ path-only | `…/business_context/` |
| `build_lead_call_dossiers.py` | ⚠️ path-only | `…/call_dossiers/` |
| `build_lead_deal_sheets.py` | ⚠️ path-only | `…/deal_sheets/` |
| `build_lead_email_thread_library.py` | ⚠️ path-only | `…/email_threads/` |
| `build_lead_memory_briefs.py` | ⚠️ path-only | `…/memory_briefs/` |
| `build_lead_message_library.py` | ⚠️ path-only | `…/message_library/` |
| `build_menu_intelligence.py` | ⚠️ path-only | `…/menu_intelligence/` |
| `build_miscommunication_intelligence.py` | ⚠️ path-only | `…/miscommunication/` |
| `build_operational_intelligence.py` | 🟡 schema-port | Hardcodes custom-field IDs. |
| `build_owner_stage_dashboards.py` | ⚠️ path-only | `…/dashboards/` |
| `build_phone_call_library.py` | ⚠️ path-only | `…/phone_call_library/` |
| `build_pricing_scope_intelligence.py` | ⚠️ path-only | `…/pricing_scope/` |
| `build_recovery_intelligence.py` | ⚠️ path-only | `…/recovery/` |
| `build_unlinked_call_library.py` | ⚠️ path-only | `…/unlinked_calls/` |
| `align_endpoint_window.py` | (utility) | helper, not a builder |
| `export_close_conversations.py` | (utility) | exporter, not a builder |
| `repair_close_export.py` | (utility) | post-processor |

### Visible in the legacy app, **no script + no snapshot** — these are net-new

| View name (from legacy screenshot) | What it shows | Build from |
|---|---|---|
| **Pipeline funnel** | stage-by-stage drop-off, value at each stage | derive from `win_loss_snapshot.funnel` + `lead_status` enum |
| **Conversation intel** (extra view) | aggregate of `build_conversation_intelligence.py` outputs | run that script + write a snapshot rollup |

---

## Custom field ID catalog (legacy → new)

The four custom-field IDs hardcoded in the legacy scripts:

```python
# legacy Close org IDs:
SOURCE_FIELD          = "custom.cf_ge7qOebiWpyPvuv7xkzNaYpM8PsmOeNvXasXFOtPXRt"
CUSTOMER_TYPE_FIELD   = "custom.cf_fs7mrfN5x0M20CyoltczyVg8t0Xul5GFvkC4FNUKvY6"
ASSIGNMENT_LANE_FIELD = "lead_custom.cf_xF8FLufgEx9bsijfRAfHhgIrPBQ5ajuohcazC7OtNmT"
INTERNAL_FLAGS_FIELD  = "lead_custom.cf_9vVeQH1oYtJbtdHoL9VPwGhNpuCzVCgi95p7MCasszj"
```

To get the new org's equivalents:

```bash
# from the comeketo-agent repo
npm run close:custom-fields   # TODO: add this script
# OR via the existing `lib/close.ts`:
#   close_get_lead_custom_fields_schema  → maps display name → cf_id
```

Then add a JSON map at `_reference/analytics-custom-fields.json` like:

```json
{
  "source":          "custom.cf_NEW_ID_HERE",
  "customer_type":   "custom.cf_NEW_ID_HERE",
  "assignment_lane": "lead_custom.cf_NEW_ID_HERE",
  "internal_flags":  "lead_custom.cf_NEW_ID_HERE"
}
```

The schema-port scripts (`build_source_channel_intelligence.py`,
`build_operational_intelligence.py`) should be patched to read this JSON
instead of having IDs hardcoded.

---

## Run order to refresh `/analytics` end-to-end

1. **Export normalized CSVs** from the new Close org. The legacy pipeline
   produced these under `~/Comeketo/ComeketoData /phone_call_transcript_library/normalized/`.
   We don't have that exporter yet — it lived in a separate repo. Either:
   - Port the exporter to use `lib/close.ts` (recommended — gives us a
     repeatable `npm run analytics:export` command), OR
   - Manually re-run the legacy exporter against the new org's API key
     (faster, one-shot).
2. **Map custom-field IDs** (one-time per org). Write `_reference/analytics-custom-fields.json`.
3. **Run path-only scripts** (most of them). Just pass `--phone-library-dir`
   pointing at the new normalized export.
4. **Patch + run schema-port scripts** (source_channel, operational).
5. **Drop new snapshots** into `src/data/analytics/`. The page will
   automatically read them and render fresher data — `_meta.generated_at`
   drives the "snapshot N days ago" badge.
6. **Build the new views** — Pipeline funnel + Conversation intel rollup.

---

## What `/analytics` does today

- Reads the seven legacy snapshots from `src/data/analytics/*.json`
- Renders the metric strip (leads / active / won / win-rate / pipeline /
  events / all-time win / YoY revenue) with each card pulling from the
  relevant snapshot and labeling its data source honestly
- Renders an auto-derived "intel signals" row built from the snapshot
  rollups (top channel, worst converter, YoY trend, etc.)
- Renders "Leads by source · top 12" with animated bars colored by
  source family
- Lists every dataset with a `view live` / `data ready` / `port script`
  pill so the operator can see at a glance what's wired and what's not
- Tags the whole page with `snapshot data` in the toolbar so we never
  pretend stale data is live

What it does **not** yet do:
- Refresh from live Close (needs the run-order above)
- Render the Owner Performance / Win-Loss / Revenue & Growth / Lead Time /
  Cohort views — data is there, dedicated chart components are next round
- Render Pipeline Funnel or Conversation Intel — neither has a snapshot

---

## Open questions for Jake / Rodrigo

- **Which Close org** should `/analytics` point at long-term — the practice
  org (Openera Automation) or the live Comeketo production org?
- **Refresh cadence** — daily cron via Vercel? Manual `npm run`? Live API
  on every page load (slow)?
- **Owner alias map** — the legacy `owner_distribution` shows
  "Sales Team Event Consultant Team", "Andre Raw", "Eduarda Fedrizzi", etc.
  Are those still the owners on the new org, or has the team rotated?
