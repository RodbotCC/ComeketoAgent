import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import {
  getAuxiliaries,
  CAPABILITIES,
  capabilityAvailability,
  KEY_TARGETS,
  KEY_TARGET_LABEL,
  SLOT_KEYS,
  SLOT_PALETTE,
  type SlotKey,
} from "@/lib/auxiliaries";
import { env } from "@/lib/env";
import { setEngineEnabledAction, updateSlotAction } from "./actions";
import { AuxToastForm } from "./AuxToastForm";

export const dynamic = "force-dynamic";

export default async function AuxiliariesPage() {
  const cfg = await getAuxiliaries();

  // Surface which OpenAI keys are actually present in env so the operator
  // sees what's available before assigning slots.
  const keyPresence: Record<string, boolean> = {
    main:  Boolean(env.OPENAI_API_KEY),
    brown: Boolean(env.OPENAI_API_KEY_AUX_BROWN),
    gold:  Boolean(env.OPENAI_API_KEY_AUX_GOLD),
    sage:  Boolean(env.OPENAI_API_KEY_AUX_SAGE),
  };

  return (
    <div className="cme-shell">
      <AppHeader wordmarkHref="/" />
      <main className="admin-main">
        <div className="cme-section-label">admin · auxiliaries</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
          <h1 style={{ marginBottom: 0 }}>Auxiliary fleet</h1>
          <span className={`hb-mode hb-mode-${cfg.engine_enabled ? "ok" : "warn"}`}>
            {cfg.engine_enabled ? "engaged" : "idle"}
          </span>
        </div>
        <p className="muted" style={{ maxWidth: 720 }}>
          The wordmark has four dots: <em>brown</em>, <em>gold</em>, <em>sage</em>, <em>lavender</em>.
          The main agent (the one in chat) does the heavy lifting; the other three slots are
          auxiliaries — small specialized agents that ride alongside, each given a role + a small
          set of capabilities. Some capabilities can only live on one slot at a time.
        </p>
        <p className="muted" style={{ marginTop: 0, maxWidth: 720 }}>
          <Link href="/settings" style={{ textDecoration: "underline" }}>← back to settings</Link>
        </p>

        {/* Master engine toggle */}
        <section style={{ marginTop: 22, padding: "14px 16px", border: "0.5px solid var(--rule)", borderRadius: 8, background: "var(--card)" }}>
          <h2 style={{ margin: 0, marginBottom: 4 }}>Master switch</h2>
          <p className="muted" style={{ margin: 0, marginBottom: 12, fontSize: 12 }}>
            When idle, capability picks save but nothing runs. When engaged, wired capabilities
            (today: prompt rewriter) intercept the live chat path.
          </p>
          <AuxToastForm action={setEngineEnabledAction}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" name="engine_enabled" defaultChecked={cfg.engine_enabled} />
              <span style={{ fontSize: 13 }}>Engine enabled</span>
            </label>
            <button type="submit" style={{ marginLeft: 14, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "6px 12px" }}>
              Save
            </button>
          </AuxToastForm>
        </section>

        {/* Key inventory */}
        <section style={{ marginTop: 22 }}>
          <h2>OpenAI keys available</h2>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 8 }}>
            Each slot picks which key powers it. Missing keys can be added to <code>.env.local</code>
            as <code>OPENAI_API_KEY_AUX_BROWN</code>, <code>_GOLD</code>, <code>_SAGE</code>.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {KEY_TARGETS.map((t) => (
              <span
                key={t}
                className={`hb-mode ${keyPresence[t] ? "hb-mode-ok" : "hb-mode-warn"}`}
                style={{ fontSize: 10 }}
              >
                {KEY_TARGET_LABEL[t]} {keyPresence[t] ? "· set" : "· missing"}
              </span>
            ))}
          </div>
        </section>

        {/* Slot grid */}
        <section style={{ marginTop: 22 }}>
          <h2>Slots</h2>
          <div className="cmk-aux-grid">
            {SLOT_KEYS.map((slotKey) => {
              const slot = cfg.slots[slotKey];
              const palette = SLOT_PALETTE[slotKey];
              const availability = capabilityAvailability(cfg, slotKey);
              const availMap = Object.fromEntries(availability.map((a) => [a.id, a]));

              return (
                <div key={slotKey} className="cmk-aux-slot">
                  <header className="cmk-aux-slot-head">
                    <span
                      className="cmk-aux-slot-dot"
                      style={{ background: palette.hex }}
                      aria-hidden
                    />
                    <div>
                      <div className="cmk-aux-slot-name">
                        {slot.display_name || `${palette.label} slot`}
                      </div>
                      <div className="cmk-aux-slot-meta">
                        {palette.label.toLowerCase()} · {slot.capabilities.length} cap{slot.capabilities.length === 1 ? "" : "s"} · {slot.enabled ? "active" : "off"}
                      </div>
                    </div>
                  </header>

                  <AuxToastForm action={updateSlotAction}>
                    <input type="hidden" name="slot_key" value={slotKey} />

                    <label className="cmk-aux-field">
                      <span className="cmk-aux-field-label">Display name</span>
                      <input
                        type="text"
                        name="display_name"
                        defaultValue={slot.display_name}
                        placeholder={`e.g. ${defaultSlotName(slotKey)}`}
                        maxLength={60}
                      />
                    </label>

                    <label className="cmk-aux-field">
                      <span className="cmk-aux-field-label">Role (one line)</span>
                      <input
                        type="text"
                        name="role"
                        defaultValue={slot.role}
                        placeholder={`e.g. ${defaultSlotRole(slotKey)}`}
                        maxLength={240}
                      />
                    </label>

                    <label className="cmk-aux-field">
                      <span className="cmk-aux-field-label">OpenAI key</span>
                      <select name="key_target" defaultValue={slot.key_target}>
                        {KEY_TARGETS.map((t) => (
                          <option key={t} value={t} disabled={!keyPresence[t]}>
                            {KEY_TARGET_LABEL[t]} {keyPresence[t] ? "" : "· missing"}
                          </option>
                        ))}
                      </select>
                    </label>

                    <fieldset className="cmk-aux-caps">
                      <legend className="cmk-aux-field-label">Capabilities</legend>
                      {CAPABILITIES.map((cap) => {
                        const a = availMap[cap.id];
                        const checked = slot.capabilities.includes(cap.id);
                        const locked = !a?.available && !checked;
                        return (
                          <label
                            key={cap.id}
                            className={`cmk-aux-cap${locked ? " cmk-aux-cap-locked" : ""}${cap.wired ? "" : " cmk-aux-cap-pending"}`}
                            title={
                              locked
                                ? `Locked by ${a?.locked_by ?? "another"} slot (mutex: ${cap.mutex_group})`
                                : !cap.wired
                                ? "Capability defined; runtime wiring lands next round"
                                : ""
                            }
                          >
                            <input
                              type="checkbox"
                              name="capabilities"
                              value={cap.id}
                              defaultChecked={checked}
                              disabled={locked}
                            />
                            <div>
                              <div className="cmk-aux-cap-name">
                                {cap.label}
                                {cap.wired ? null : <span className="cmk-aux-cap-tag">queued</span>}
                                {locked && (
                                  <span className="cmk-aux-cap-tag cmk-aux-cap-tag-locked">
                                    held by {a?.locked_by}
                                  </span>
                                )}
                              </div>
                              <div className="cmk-aux-cap-blurb">{cap.blurb}</div>
                            </div>
                          </label>
                        );
                      })}
                    </fieldset>

                    <div className="cmk-aux-actions">
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <input type="checkbox" name="enabled" defaultChecked={slot.enabled} />
                        Slot active
                      </label>
                      <button
                        type="submit"
                        style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "6px 12px" }}
                      >
                        Save slot
                      </button>
                    </div>
                  </AuxToastForm>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

function defaultSlotName(k: SlotKey): string {
  return ({ brown: "Reflector", gold: "Observer", sage: "Bridger", lavender: "Main" } as const)[k];
}
function defaultSlotRole(k: SlotKey): string {
  return ({
    brown: "Sharpens drafts and gives quiet feedback",
    gold: "Watches the operator's surface and nudges",
    sage: "Mirrors fires to Slack / GitHub / ledger",
    lavender: "Main agent — does the work in chat",
  } as const)[k];
}
