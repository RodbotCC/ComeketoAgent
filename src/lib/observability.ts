/**
 * Structured JSON logs (stdout) for webhook / heartbeat / Close paths (Guardrails observability).
 */

export type LogLevel = "info" | "warn" | "error";

export function logStructured(
  level: LogLevel,
  component: string,
  message: string,
  fields: Record<string, unknown> = {}
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
