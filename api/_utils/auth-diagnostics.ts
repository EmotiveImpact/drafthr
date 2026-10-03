/** Log dependency failures without cookies, tokens, user data, or SQL parameters. */
export function logAuthFailure(stage: string, error: unknown): void {
  const causes: Array<{ name?: string; code?: string; status?: number }> = [];
  let current = error;
  for (let depth = 0; current && typeof current === "object" && depth < 4; depth++) {
    const value = current as { name?: unknown; code?: unknown; status?: unknown; cause?: unknown };
    causes.push({
      name: typeof value.name === "string" ? value.name : undefined,
      code: typeof value.code === "string" ? value.code : undefined,
      status: typeof value.status === "number" ? value.status : undefined,
    });
    current = value.cause;
  }
  console.error("[auth] dependency failure", { stage, causes });
}
