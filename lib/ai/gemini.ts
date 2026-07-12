import {
  GoogleGenerativeAI as BaseGoogleGenerativeAI,
  GenerativeModel,
  type GenerateContentRequest,
  type GenerateContentResult,
  type ModelParams,
  type Part,
  type RequestOptions,
  type SingleRequestOptions,
} from "@google/generative-ai";
import { serverLog } from "@/lib/debugLogs";

export * from "@google/generative-ai";

const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
const FALLBACK_MODELS: Record<string, string> = {
  "gemini-3.1-flash-lite": "gemini-3.1-pro-preview",
  "gemini-3.1-pro-preview": "gemini-3.1-flash-lite",
};

const originalGenerateContent = GenerativeModel.prototype.generateContent;
const originalGenerateContentStream =
  GenerativeModel.prototype.generateContentStream;

type GenerateContentInput =
  | GenerateContentRequest
  | string
  | Array<string | Part>;

type KaizoraRequestOptions = SingleRequestOptions & {
  __kaizoraDisableFallback?: boolean;
};

type GeminiCallKind = "generateContent" | "generateContentStream";
type GeminiAttemptOutcome = "success" | "error";

export interface GeminiTraceAttempt {
  label: string;
  model: string;
  requestedModel: string;
  startedAt: string;
  durationMs: number;
  outcome: GeminiAttemptOutcome;
  status?: number;
  statusText?: string;
  message?: string;
}

export interface GeminiTrace {
  label: string;
  kind: GeminiCallKind;
  requestedModel: string;
  modelUsed: string;
  usedFallback: boolean;
  fallbackModel: string | null;
  retries: number;
  attempts: GeminiTraceAttempt[];
}

export function disableGeminiFallback(
  requestOptions: SingleRequestOptions = {},
): SingleRequestOptions {
  return {
    ...requestOptions,
    __kaizoraDisableFallback: true,
  } as SingleRequestOptions;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeModelName(model: string) {
  return model.replace(/^models\//, "");
}

function withModelPrefix(model: string) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

function isRetryableGeminiError(error: any) {
  const message = String(error?.message || "");
  return (
    RETRYABLE_STATUS_CODES.has(Number(error?.status)) ||
    message.includes("[429") ||
    message.includes("[500") ||
    message.includes("[503")
  );
}

function getFallbackModel(model: string) {
  return FALLBACK_MODELS[normalizeModelName(model)] || null;
}

function buildGeminiTrace(
  label: string,
  kind: GeminiCallKind,
  requestedModel: string,
): GeminiTrace {
  const normalized = normalizeModelName(requestedModel);
  return {
    label,
    kind,
    requestedModel: normalized,
    modelUsed: normalized,
    usedFallback: false,
    fallbackModel: null,
    retries: 0,
    attempts: [],
  };
}

function buildGeminiErrorDetails(error: any) {
  return {
    status: Number(error?.status) || undefined,
    statusText: error?.statusText || undefined,
    message: error?.message || undefined,
  };
}

function attachGeminiMetadata(
  result: GenerateContentResult,
  requestedModel: string,
  actualModel: string,
  trace?: GeminiTrace,
) {
  Object.defineProperty(result, "__requestedModel", {
    value: normalizeModelName(requestedModel),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(result, "__modelUsed", {
    value: normalizeModelName(actualModel),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(result, "__usedFallback", {
    value: normalizeModelName(requestedModel) !== normalizeModelName(actualModel),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(result, "__geminiTrace", {
    value: trace || null,
    enumerable: false,
    configurable: true,
  });
  return result;
}

export function getGeminiTrace(source: any): GeminiTrace | null {
  return source?.__geminiTrace || source?.response?.__geminiTrace || null;
}

function buildFallbackModel(currentModel: GenerativeModel, fallbackModel: string) {
  return new GenerativeModel(
    currentModel.apiKey,
    {
      model: fallbackModel,
      generationConfig: currentModel.generationConfig,
      safetySettings: currentModel.safetySettings,
      tools: currentModel.tools,
      toolConfig: currentModel.toolConfig,
      systemInstruction: currentModel.systemInstruction,
      cachedContent: currentModel.cachedContent,
    } as ModelParams,
    ((currentModel as any)._requestOptions || {}) as RequestOptions,
  );
}

async function runGeminiCall(
  model: GenerativeModel,
  request: GenerateContentInput,
  requestOptions: SingleRequestOptions,
  requestedModel: string,
  actualModel: string,
  label: string,
  trace: GeminiTrace,
) {
  const startedAt = Date.now();
  const normalizedActualModel = normalizeModelName(actualModel);
  const attempt: GeminiTraceAttempt = {
    label,
    model: normalizedActualModel,
    requestedModel: normalizeModelName(requestedModel),
    startedAt: new Date(startedAt).toISOString(),
    durationMs: 0,
    outcome: "error",
  };
  trace.attempts.push(attempt);
  serverLog(
    "KAIZORA_LOG_GEMINI",
    "info",
    `[gemini] ${label} attempt using ${normalizedActualModel} (requested ${normalizeModelName(requestedModel)})`,
  );
  try {
    const result = await originalGenerateContent.call(
      model,
      request,
      requestOptions,
    );
    const durationMs = Date.now() - startedAt;
    attempt.durationMs = durationMs;
    attempt.outcome = "success";
    trace.modelUsed = normalizedActualModel;
    trace.usedFallback =
      trace.requestedModel !== normalizedActualModel || trace.usedFallback;
    serverLog(
      "KAIZORA_LOG_GEMINI",
      "info",
      `[gemini] ${label} success using ${normalizedActualModel} in ${durationMs}ms`,
      {
        requestedModel: trace.requestedModel,
        modelUsed: trace.modelUsed,
        retries: trace.retries,
        usedFallback: trace.usedFallback,
        fallbackModel: trace.fallbackModel,
      },
    );
    return attachGeminiMetadata(result, requestedModel, actualModel, trace);
  } catch (error: any) {
    const durationMs = Date.now() - startedAt;
    attempt.durationMs = durationMs;
    Object.assign(attempt, buildGeminiErrorDetails(error));
    throw error;
  }
}

async function runGeminiStreamCall(
  model: GenerativeModel,
  request: GenerateContentInput,
  requestOptions: SingleRequestOptions,
  requestedModel: string,
  actualModel: string,
  label: string,
  trace: GeminiTrace,
) {
  const startedAt = Date.now();
  const normalizedActualModel = normalizeModelName(actualModel);
  const attempt: GeminiTraceAttempt = {
    label,
    model: normalizedActualModel,
    requestedModel: normalizeModelName(requestedModel),
    startedAt: new Date(startedAt).toISOString(),
    durationMs: 0,
    outcome: "error",
  };
  trace.attempts.push(attempt);
  serverLog(
    "KAIZORA_LOG_GEMINI",
    "info",
    `[gemini] ${label} attempt using ${normalizedActualModel} (requested ${normalizeModelName(requestedModel)})`,
  );
  try {
    const streamResult = await originalGenerateContentStream.call(
      model,
      request,
      requestOptions,
    );
    const durationMs = Date.now() - startedAt;
    attempt.durationMs = durationMs;
    attempt.outcome = "success";
    trace.modelUsed = normalizedActualModel;
    trace.usedFallback =
      trace.requestedModel !== normalizedActualModel || trace.usedFallback;
    serverLog(
      "KAIZORA_LOG_GEMINI",
      "info",
      `[gemini] ${label} stream opened using ${normalizedActualModel} in ${durationMs}ms`,
      {
        requestedModel: trace.requestedModel,
        modelUsed: trace.modelUsed,
        retries: trace.retries,
        usedFallback: trace.usedFallback,
        fallbackModel: trace.fallbackModel,
      },
    );
    return {
      ...streamResult,
      response: streamResult.response.then((result: any) =>
        attachGeminiMetadata(result, requestedModel, actualModel, trace),
      ) as any,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startedAt;
    attempt.durationMs = durationMs;
    Object.assign(attempt, buildGeminiErrorDetails(error));
    throw error;
  }
}

function patchGenerativeModel(model: GenerativeModel) {
  if ((model as any).__kaizoraGeminiPatched) return model;

  const patchedGenerateContent = async function (
    this: GenerativeModel,
    request: GenerateContentInput,
    requestOptions: SingleRequestOptions = {},
  ) {
    const requestedModel = this.model;
    const label = `generateContent:${normalizeModelName(requestedModel)}`;
    const trace = buildGeminiTrace(label, "generateContent", requestedModel);
    const disableFallback = Boolean(
      (requestOptions as KaizoraRequestOptions).__kaizoraDisableFallback,
    );

    try {
      return await runGeminiCall(
        this,
        request,
        requestOptions,
        requestedModel,
        requestedModel,
        label,
        trace,
      );
    } catch (error: any) {
      if (!isRetryableGeminiError(error)) {
        serverLog(
          "KAIZORA_LOG_GEMINI",
          "error",
          `[gemini] ${label} failed with non-retryable error`,
          {
            status: error?.status,
            statusText: error?.statusText,
            message: error?.message,
            model: normalizeModelName(requestedModel),
            trace,
          },
        );
        throw error;
      }

      serverLog(
        "KAIZORA_LOG_GEMINI",
        "warn",
        `[gemini] ${label} retrying after transient error`,
        {
          status: error?.status,
          statusText: error?.statusText,
          message: error?.message,
          model: normalizeModelName(requestedModel),
        },
      );
      trace.retries += 1;
      await delay(1200);

      try {
        return await runGeminiCall(
          this,
          request,
          requestOptions,
          requestedModel,
          requestedModel,
          `${label}:retry`,
          trace,
        );
      } catch (retryError: any) {
        const fallbackModel = disableFallback
          ? null
          : getFallbackModel(requestedModel);
        if (!fallbackModel || !isRetryableGeminiError(retryError)) {
          serverLog(
            "KAIZORA_LOG_GEMINI",
            "error",
            `[gemini] ${label} failed after retry`,
            {
              status: retryError?.status,
              statusText: retryError?.statusText,
              message: retryError?.message,
              model: normalizeModelName(requestedModel),
              trace,
            },
          );
          throw retryError;
        }

        serverLog(
          "KAIZORA_LOG_GEMINI",
          "warn",
          `[gemini] ${label} falling back to ${fallbackModel}`,
          {
            status: retryError?.status,
            statusText: retryError?.statusText,
            message: retryError?.message,
            fromModel: normalizeModelName(requestedModel),
            toModel: normalizeModelName(fallbackModel),
          },
        );
        trace.usedFallback = true;
        trace.fallbackModel = normalizeModelName(fallbackModel);

        const fallbackInstance = buildFallbackModel(this, fallbackModel);
        return await runGeminiCall(
          fallbackInstance,
          request,
          requestOptions,
          requestedModel,
          withModelPrefix(fallbackModel),
          `${label}:fallback`,
          trace,
        );
      }
    }
  };

  Object.defineProperty(model, "generateContent", {
    value: patchedGenerateContent,
    configurable: true,
    writable: true,
  });

  const patchedGenerateContentStream = async function (
    this: GenerativeModel,
    request: GenerateContentInput,
    requestOptions: SingleRequestOptions = {},
  ) {
    const requestedModel = this.model;
    const label = `generateContentStream:${normalizeModelName(requestedModel)}`;
    const trace = buildGeminiTrace(
      label,
      "generateContentStream",
      requestedModel,
    );
    const disableFallback = Boolean(
      (requestOptions as KaizoraRequestOptions).__kaizoraDisableFallback,
    );

    try {
      return await runGeminiStreamCall(
        this,
        request,
        requestOptions,
        requestedModel,
        requestedModel,
        label,
        trace,
      );
    } catch (error: any) {
      if (!isRetryableGeminiError(error)) {
        serverLog(
          "KAIZORA_LOG_GEMINI",
          "error",
          `[gemini] ${label} failed with non-retryable error`,
          {
            status: error?.status,
            statusText: error?.statusText,
            message: error?.message,
            model: normalizeModelName(requestedModel),
            trace,
          },
        );
        throw error;
      }

      serverLog(
        "KAIZORA_LOG_GEMINI",
        "warn",
        `[gemini] ${label} retrying after transient error`,
        {
          status: error?.status,
          statusText: error?.statusText,
          message: error?.message,
          model: normalizeModelName(requestedModel),
        },
      );
      trace.retries += 1;
      await delay(1200);

      try {
        return await runGeminiStreamCall(
          this,
          request,
          requestOptions,
          requestedModel,
          requestedModel,
          `${label}:retry`,
          trace,
        );
      } catch (retryError: any) {
        const fallbackModel = disableFallback
          ? null
          : getFallbackModel(requestedModel);
        if (!fallbackModel || !isRetryableGeminiError(retryError)) {
          serverLog(
            "KAIZORA_LOG_GEMINI",
            "error",
            `[gemini] ${label} failed after retry`,
            {
              status: retryError?.status,
              statusText: retryError?.statusText,
              message: retryError?.message,
              model: normalizeModelName(requestedModel),
              trace,
            },
          );
          throw retryError;
        }

        serverLog(
          "KAIZORA_LOG_GEMINI",
          "warn",
          `[gemini] ${label} falling back to ${fallbackModel}`,
          {
            status: retryError?.status,
            statusText: retryError?.statusText,
            message: retryError?.message,
            fromModel: normalizeModelName(requestedModel),
            toModel: normalizeModelName(fallbackModel),
          },
        );
        trace.usedFallback = true;
        trace.fallbackModel = normalizeModelName(fallbackModel);

        const fallbackInstance = buildFallbackModel(this, fallbackModel);
        return await runGeminiStreamCall(
          fallbackInstance,
          request,
          requestOptions,
          requestedModel,
          withModelPrefix(fallbackModel),
          `${label}:fallback`,
          trace,
        );
      }
    }
  };

  Object.defineProperty(model, "generateContentStream", {
    value: patchedGenerateContentStream,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(model, "__kaizoraGeminiPatched", {
    value: true,
    configurable: false,
    enumerable: false,
  });

  return model;
}

export class GoogleGenerativeAI extends BaseGoogleGenerativeAI {
  getGenerativeModel(
    modelParams: ModelParams,
    requestOptions?: RequestOptions,
  ) {
    const model = super.getGenerativeModel(modelParams, requestOptions);
    return patchGenerativeModel(model);
  }
}
