import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

type DecisionLayerStatus = "success" | "error";

type SerializableRecord = Record<string, unknown>;

export interface DecisionLayerLogInput {
  route: string;
  mediaType: "image" | "video" | "audio" | "text";
  status: DecisionLayerStatus;
  startedAt: string;
  request: SerializableRecord;
  result?: SerializableRecord;
  error?: unknown;
  responseStatus?: number;
}

function sanitizeForJson(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      ...(value as Error & Record<string, unknown>),
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForJson(item));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      output[key] = sanitizeForJson(nestedValue);
    }
    return output;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return value;
}

export function summarizeFiles(files: File[]): Array<Record<string, unknown>> {
  return files.map((file) => ({
    name: file.name,
    type: file.type,
    sizeBytes: file.size,
    sizeMB: Number((file.size / 1024 / 1024).toFixed(2)),
    lastModified: file.lastModified,
  }));
}

export async function writeDecisionLayerAnalysisLog(
  input: DecisionLayerLogInput,
): Promise<string> {
  const startedAtDate = new Date(input.startedAt);
  const day = Number.isNaN(startedAtDate.getTime())
    ? new Date().toISOString().slice(0, 10)
    : startedAtDate.toISOString().slice(0, 10);
  const logsDir = join(process.cwd(), ".logs", "decision-layer", day);
  await mkdir(logsDir, { recursive: true });

  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}--${input.mediaType}--${input.status}--${randomUUID()}.json`;
  const filePath = join(logsDir, fileName);
  const endedAt = new Date().toISOString();

  const payload = {
    route: input.route,
    mediaType: input.mediaType,
    status: input.status,
    startedAt: input.startedAt,
    endedAt,
    durationMs:
      new Date(endedAt).getTime() - new Date(input.startedAt).getTime(),
    responseStatus: input.responseStatus ?? null,
    request: sanitizeForJson(input.request),
    result: sanitizeForJson(input.result ?? null),
    error: sanitizeForJson(input.error ?? null),
  };

  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}
