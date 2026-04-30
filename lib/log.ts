type Level = "info" | "warn" | "error";

function emit(level: Level, scope: string, msg: string, data?: Record<string, unknown>) {
  const line = { t: new Date().toISOString(), level, scope, msg, ...data };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const log = {
  info: (scope: string, msg: string, data?: Record<string, unknown>) => emit("info", scope, msg, data),
  warn: (scope: string, msg: string, data?: Record<string, unknown>) => emit("warn", scope, msg, data),
  error: (scope: string, msg: string, data?: Record<string, unknown>) => emit("error", scope, msg, data),
  step: <T>(name: string, gamePk: number | string | null, fn: () => Promise<T>): Promise<T> => {
    const start = Date.now();
    emit("info", "step", `${name}:start`, { gamePk });
    return fn().then(
      (v) => {
        emit("info", "step", `${name}:ok`, { gamePk, ms: Date.now() - start });
        return v;
      },
      (e: unknown) => {
        emit("error", "step", `${name}:err`, { gamePk, ms: Date.now() - start, err: String(e) });
        throw e;
      },
    );
  },
};
