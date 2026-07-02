/**
 * ai-verify-proof — Deno edge function (VER-3/VER-9, doc 09 §5 lenient proof).
 *
 * Input:  { proof: { uri?: string, note?: string }, task: { title: string } }
 * Output: { verdict: "pass" | "uncertain" }
 *
 * A LENIENT plausibility check: does the submitted proof plausibly relate to the
 * task? This is a light nudge, never a grader. Per doc 09 §5 the worst outcome is
 * a false reject, so the model is instructed to accept unless the proof is
 * CLEARLY unrelated, and the client treats anything other than an explicit
 * "uncertain" (including no_key, network failure, or any ambiguity) as "pass".
 *
 * Returns 200 { error: "no_key" } when GEMINI_API_KEY is unset so the client
 * falls back to "pass" locally. Note: proof images live on-device; this text
 * check reasons over the task title plus any caption/note the client provides
 * (it does not upload image bytes). It exists so the pipeline is READY-FOR-KEY;
 * with no key the existing pass-by-default behavior is unchanged.
 */

import {
  callGemini,
  extractJson,
  getApiKey,
  handlePreflight,
  jsonResponse,
  noKeyResponse,
  readBody,
} from "../_shared/gemini.ts";

const SYSTEM = `You are a LENIENT plausibility checker for task-completion proof in Ampora, an app for students who procrastinate and people with ADHD.
You are shown a task title and a short description of the proof the user attached (a photo/screenshot caption, a note, or a filename). You do NOT grade quality.
Decide only: could this proof plausibly relate to that task?
Rules:
- Err strongly toward "pass". A false reject is the worst outcome — never shame or block someone doing the right thing.
- Return "uncertain" ONLY if the proof is clearly, obviously unrelated to the task (e.g. task "finish history essay", proof described as "a photo of a pizza").
- If you have little to go on, or it is even slightly plausible, return "pass".
- No explanations, no advice, no medical/financial content.
Output STRICT JSON only: { "verdict": "pass" | "uncertain" }`;

interface ProofInput {
  uri?: string;
  note?: string;
}

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const apiKey = getApiKey();
  if (!apiKey) return noKeyResponse();

  try {
    const body = await readBody<{ proof?: ProofInput; task?: { title?: string } }>(req);
    const taskTitle = (body.task?.title ?? "").trim();
    const proof = body.proof ?? {};
    // Derive a light textual description of the proof for the model to reason over.
    const note = (proof.note ?? "").trim();
    const uri = (proof.uri ?? "").trim();
    const fileHint = uri ? uri.split(/[?#]/)[0].split("/").pop() ?? "" : "";

    // With nothing to judge, be lenient by default rather than calling the model.
    if (!taskTitle) return jsonResponse({ verdict: "pass" });

    const user = `TASK: ${taskTitle}
PROOF DESCRIPTION: ${note || fileHint || "an attached image (no caption)"}`;

    const text = await callGemini(apiKey, {
      system: SYSTEM,
      user,
      maxTokens: 64,
      temperature: 0.1,
    });
    const raw = extractJson<{ verdict?: string }>(text);
    // Only an explicit "uncertain" is surfaced; everything else is "pass".
    const verdict = raw.verdict === "uncertain" ? "uncertain" : "pass";
    return jsonResponse({ verdict });
  } catch (_err) {
    // Any failure -> lenient pass (doc 09 §5: never block on a check).
    return jsonResponse({ verdict: "pass" });
  }
});
