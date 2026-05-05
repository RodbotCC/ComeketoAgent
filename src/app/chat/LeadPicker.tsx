"use client";

/**
 * Lead picker for the cockpit's Lead mode.
 *
 * Three input modes:
 *  - Search box (debounced) → /api/leads/search?q=…
 *  - Paste Close URL → regex out lead_xxx, call onPick immediately
 *  - Recent leads (top 10 by date_updated) loaded on mount
 *
 * When the parent owns a current lead_id, render a compact "active lead
 * header" instead of the full picker.
 */
import { useEffect, useRef, useState } from "react";

type LeadHit = { id: string; display_name: string; status_label: string };

const CLOSE_LEAD_RE = /lead_[A-Za-z0-9]+/;

export function LeadPicker({
  activeLeadId,
  activeLeadName,
  onPick,
  onClear,
}: {
  activeLeadId: string | null;
  activeLeadName?: string | null;
  onPick: (leadId: string, displayName: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LeadHit[]>([]);
  const [recent, setRecent] = useState<LeadHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [showPicker, setShowPicker] = useState(!activeLeadId);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recent leads on mount when picker is visible.
  useEffect(() => {
    if (!showPicker) return;
    let cancelled = false;
    fetch("/api/leads/search?limit=10")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) setRecent(data.leads as LeadHit[]);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [showPicker]);

  // Debounced search.
  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/leads/search?q=${encodeURIComponent(query)}&limit=8`);
        const data = await res.json();
        if (data.ok) setHits(data.leads as LeadHit[]);
        else setError(data.error || "search failed");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handlePaste(value: string) {
    setPasted(value);
    const m = value.match(CLOSE_LEAD_RE);
    if (m) {
      const id = m[0];
      // Display name will refresh after server prompt; pick with a placeholder.
      onPick(id, id);
      setPasted("");
      setShowPicker(false);
    }
  }

  // Compact header when a lead is active and the picker is collapsed.
  if (activeLeadId && !showPicker) {
    return (
      <div className="cmk-lead-active">
        <div className="cmk-lead-active-eyebrow">in scope</div>
        <div className="cmk-lead-active-name">{activeLeadName || activeLeadId}</div>
        <div className="cmk-lead-active-actions">
          <button type="button" className="cmk-lead-active-link" onClick={() => setShowPicker(true)}>
            switch
          </button>
          <span className="cmk-lead-active-sep">·</span>
          <a href={`/lead/${activeLeadId}`} className="cmk-lead-active-link">
            view Box
          </a>
          <span className="cmk-lead-active-sep">·</span>
          <button type="button" className="cmk-lead-active-link" onClick={onClear}>
            clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cmk-lead-picker">
      <div className="cmk-lead-picker-eyebrow">pick a lead</div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name…"
        className="cmk-lead-picker-input"
      />
      <input
        type="text"
        value={pasted}
        onChange={(e) => handlePaste(e.target.value)}
        placeholder="…or paste a Close lead URL"
        className="cmk-lead-picker-input cmk-lead-picker-input-paste"
      />
      {error && <div className="cmk-lead-picker-error">{error}</div>}
      {loading && <div className="cmk-lead-picker-loading">searching…</div>}
      <div className="cmk-lead-picker-list">
        {(query.trim() ? hits : recent).map((l) => (
          <button
            key={l.id}
            type="button"
            className="cmk-lead-picker-row"
            onClick={() => {
              onPick(l.id, l.display_name);
              setShowPicker(false);
              setQuery("");
            }}
            title={l.id}
          >
            <span className="cmk-lead-picker-row-name">{l.display_name}</span>
            <span className="cmk-lead-picker-row-status">{l.status_label}</span>
          </button>
        ))}
        {!loading && query.trim() && hits.length === 0 && !error && (
          <div className="cmk-lead-picker-empty">no matches</div>
        )}
        {!query.trim() && recent.length === 0 && !loading && (
          <div className="cmk-lead-picker-empty">no recent leads — try searching</div>
        )}
      </div>
      {activeLeadId && (
        <button type="button" className="cmk-lead-active-link" onClick={() => setShowPicker(false)} style={{ marginTop: 8, fontSize: 11 }}>
          ← back to {activeLeadName || activeLeadId}
        </button>
      )}
    </div>
  );
}
