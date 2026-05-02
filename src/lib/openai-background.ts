import OpenAI from "openai";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type Resp = {
  id: string;
  status?: string;
  output_text?: string | null;
};

/**
 * Poll a Responses API object started with background=true until it leaves
 * queued / in_progress (see OpenAI background mode guide).
 */
export async function pollBackgroundResponse(
  client: OpenAI,
  responseId: string,
  opts?: { intervalMs?: number; maxWaitMs?: number }
): Promise<Resp> {
  const intervalMs = opts?.intervalMs ?? 2000;
  const maxWaitMs = opts?.maxWaitMs ?? 240_000;
  const deadline = Date.now() + maxWaitMs;
  let r = (await client.responses.retrieve(responseId)) as Resp;
  while ((r.status === "queued" || r.status === "in_progress") && Date.now() < deadline) {
    await sleep(intervalMs);
    r = (await client.responses.retrieve(responseId)) as Resp;
  }
  return r;
}
