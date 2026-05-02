"use client";

import { useState, type ChangeEvent } from "react";
import { useToast } from "@/components/Toast";

export function OpenAiMediaLab() {
  const toast = useToast();
  const [ttsText, setTtsText] = useState("Comeketo Agent — quick TTS check.");
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsAudio, setTtsAudio] = useState<string | null>(null);

  const [imgPrompt, setImgPrompt] = useState("Minimal line illustration of a catering tasting table, sage and cream palette.");
  const [imgModel, setImgModel] = useState<"gpt-image-1" | "dall-e-3">("gpt-image-1");
  const [imgBusy, setImgBusy] = useState(false);
  const [imgDataUrl, setImgDataUrl] = useState<string | null>(null);

  const [txBusy, setTxBusy] = useState(false);
  const [txText, setTxText] = useState("");

  async function runTts() {
    setTtsBusy(true);
    setTtsAudio(null);
    try {
      const res = await fetch("/api/openai/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: ttsText, voice: "sage", model: "gpt-4o-mini-tts" }),
      });
      const data = (await res.json()) as { ok?: boolean; base64?: string; mime?: string; error?: string };
      if (!data.ok || !data.base64) {
        toast.push(data.error ?? "TTS failed", { tone: "error", ttl: 5000 });
        return;
      }
      const url = `data:${data.mime ?? "audio/mpeg"};base64,${data.base64}`;
      setTtsAudio(url);
      toast.push("Speech generated — hit play", { tone: "success" });
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), { tone: "error", ttl: 4500 });
    } finally {
      setTtsBusy(false);
    }
  }

  async function runImage() {
    setImgBusy(true);
    setImgDataUrl(null);
    try {
      const res = await fetch("/api/openai/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: imgPrompt, model: imgModel, n: 1 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        b64_json?: string | null;
        url?: string | null;
        error?: string;
      };
      if (!data.ok) {
        toast.push(data.error ?? "Image failed", { tone: "error", ttl: 5000 });
        return;
      }
      if (data.b64_json) {
        setImgDataUrl(`data:image/png;base64,${data.b64_json}`);
      } else if (data.url) {
        setImgDataUrl(data.url);
      } else {
        toast.push("No image data in response", { tone: "error" });
        return;
      }
      toast.push("Image ready", { tone: "success" });
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), { tone: "error", ttl: 4500 });
    } finally {
      setImgBusy(false);
    }
  }

  async function runTranscribe(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setTxBusy(true);
    setTxText("");
    try {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("model", "gpt-4o-mini-transcribe");
      const res = await fetch("/api/openai/transcribe", { method: "POST", body: fd });
      const data = (await res.json()) as { ok?: boolean; text?: string; error?: string };
      if (!data.ok) {
        toast.push(data.error ?? "Transcribe failed", { tone: "error", ttl: 5000 });
        return;
      }
      setTxText(data.text ?? "");
      toast.push("Transcription ready", { tone: "success" });
    } catch (err) {
      toast.push(err instanceof Error ? err.message : String(err), { tone: "error", ttl: 4500 });
    } finally {
      setTxBusy(false);
      e.target.value = "";
    }
  }

  return (
    <section style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--rule)" }}>
      <h2>OpenAI media</h2>
      <p className="muted">
        Text-to-speech, image generation, and speech-to-text against your <code>OPENAI_API_KEY</code>. Same auth as the rest of the admin surface when operator lock is on.
      </p>

      <div className="cmk-stack-panel cmk-stack-panel--sky cmk-stack-panel--tight-top" style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15, fontFamily: "var(--serif)", fontWeight: 500 }}>Text → speech</h3>
        <textarea
          value={ttsText}
          onChange={(e) => setTtsText(e.target.value)}
          rows={3}
          className="cmk-field-panel"
          style={{ width: "100%", fontSize: 13, resize: "vertical" }}
        />
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="plan-btn plan-btn-primary" onClick={() => void runTts()} disabled={ttsBusy || !ttsText.trim()}>
            {ttsBusy ? "Generating…" : "Speak"}
          </button>
          {ttsAudio ? (
            <audio controls src={ttsAudio} style={{ height: 36, maxWidth: 320 }} />
          ) : null}
        </div>
      </div>

      <div className="cmk-stack-panel cmk-stack-panel--lavender cmk-stack-panel--tight-top" style={{ marginTop: 14 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15, fontFamily: "var(--serif)", fontWeight: 500 }}>Text → image</h3>
        <label className="muted" style={{ fontSize: 11, display: "block", marginBottom: 6 }}>
          Model
          <select
            value={imgModel}
            onChange={(e) => setImgModel(e.target.value as typeof imgModel)}
            className="cmk-field-panel"
            style={{ display: "block", marginTop: 4, fontFamily: "var(--mono)", fontSize: 12 }}
          >
            <option value="gpt-image-1">gpt-image-1</option>
            <option value="dall-e-3">dall-e-3</option>
          </select>
        </label>
        <textarea
          value={imgPrompt}
          onChange={(e) => setImgPrompt(e.target.value)}
          rows={3}
          className="cmk-field-panel"
          style={{ width: "100%", fontSize: 13, resize: "vertical" }}
        />
        <button type="button" className="plan-btn plan-btn-primary" style={{ marginTop: 10 }} onClick={() => void runImage()} disabled={imgBusy || !imgPrompt.trim()}>
          {imgBusy ? "Rendering…" : "Generate"}
        </button>
        {imgDataUrl ? (
          <div style={{ marginTop: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgDataUrl} alt="" style={{ maxWidth: "100%", borderRadius: 8, border: "0.5px solid var(--rule)" }} />
          </div>
        ) : null}
      </div>

      <div className="cmk-stack-panel cmk-stack-panel--sage cmk-stack-panel--tight-top" style={{ marginTop: 14 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15, fontFamily: "var(--serif)", fontWeight: 500 }}>Speech → text</h3>
        <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Upload a short audio clip (webm/mp3/wav). Uses <code>gpt-4o-mini-transcribe</code>.
        </p>
        <input type="file" accept="audio/*" disabled={txBusy} onChange={(e) => void runTranscribe(e)} />
        {txBusy ? <p className="muted" style={{ marginTop: 8 }}>Transcribing…</p> : null}
        {txText ? (
          <pre className="test-result-pre" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
            {txText}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
