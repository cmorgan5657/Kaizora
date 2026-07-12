type LogLevel = "log" | "info" | "warn" | "error";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function parseEnvFlag(
  value: string | undefined,
  defaultValue = false,
): boolean {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return defaultValue;
}

export function isServerLogEnabled(
  areaEnvKey: string,
  defaultValue = true,
): boolean {
  const globalEnabled = parseEnvFlag(
    process.env.KAIZORA_SERVER_LOGS_ENABLED,
    true,
  );
  if (!globalEnabled) return false;
  return parseEnvFlag(process.env[areaEnvKey], defaultValue);
}

export function serverLog(
  areaEnvKey: string,
  level: LogLevel,
  message: string,
  payload?: unknown,
  defaultValue = true,
) {
  if (!isServerLogEnabled(areaEnvKey, defaultValue)) return;
  if (payload === undefined) {
    console[level](message);
    return;
  }
  console[level](message, payload);
}
