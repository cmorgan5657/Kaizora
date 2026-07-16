import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  GenerateContentRequest,
  ModelParams,
  Part,
  RequestOptions,
  SingleRequestOptions,
} from "@google/generative-ai";
import { serverLog } from "@/lib/debugLogs";
import { isVertexProvider } from "@/lib/ai/provider";

const GOOGLE_OAUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_VERTEX_PROJECT = "gen-lang-client-0448379397";
const DEFAULT_VERTEX_LOCATION = "us-central1";
const DEFAULT_VERTEX_CREDENTIALS_PATH = resolve(
  process.cwd(),
  "vertex-api-file.json",
);

type GenerateContentInput =
  | GenerateContentRequest
  | string
  | Array<string | Part>;

type VertexCredentials = {
  type: "service_account";
  project_id: string;
  private_key: string;
  client_email: string;
  token_uri: string;
};

type CachedVertexToken = {
  accessToken: string;
  expiresAt: number;
};

const VERTEX_MAX_RETRIES = 3;

let cachedVertexToken: CachedVertexToken | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1000;
  }

  const baseDelayMs = 2000 * 2 ** attempt;
  const jitterMs = Math.floor(Math.random() * 750);
  return baseDelayMs + jitterMs;
}

function normalizeModelName(model: string) {
  return model.replace(/^models\//, "");
}

function withModelPrefix(model: string) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

function normalizeTextParts(parts: any[] = []) {
  return parts
    .map((part) => {
      if (typeof part?.text === "string") return part.text;
      return "";
    })
    .join("");
}

function extractVertexText(payload: any) {
  if (typeof payload?.text === "string" && payload.text.trim()) {
    return payload.text;
  }

  const candidate = Array.isArray(payload?.candidates)
    ? payload.candidates[0]
    : null;

  if (typeof candidate?.text === "string" && candidate.text.trim()) {
    return candidate.text;
  }

  if (typeof candidate?.content?.text === "string" && candidate.content.text.trim()) {
    return candidate.content.text;
  }

  const parts = candidate?.content?.parts || [];
  return normalizeTextParts(parts);
}

function wrapVertexResponsePayload(payload: any) {
  return {
    ...payload,
    text() {
      return extractVertexText(payload);
    },
  };
}

function getVertexCredentials(): VertexCredentials {
  const rawJson = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON?.trim();
  if (rawJson) {
    return parseInlineVertexCredentials(rawJson);
  }

  try {
    return JSON.parse(
      readFileSync(DEFAULT_VERTEX_CREDENTIALS_PATH, "utf8"),
    ) as VertexCredentials;
  } catch (defaultPathError) {
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (!credentialsPath) {
      throw new Error(
        `Vertex AI credentials not found. Expected ${DEFAULT_VERTEX_CREDENTIALS_PATH} or GOOGLE_CLOUD_CREDENTIALS_JSON.`,
      );
    }

    // Some hosts store the service-account JSON directly in the env var instead
    // of mounting a file path. Support both shapes as a fallback.
    if (
      credentialsPath.startsWith("{") ||
      credentialsPath.startsWith("\"{") ||
      credentialsPath.startsWith("'{")
    ) {
      return parseInlineVertexCredentials(credentialsPath);
    }

    try {
      return JSON.parse(readFileSync(credentialsPath, "utf8")) as VertexCredentials;
    } catch {
      throw defaultPathError;
    }
  }
}

function parseInlineVertexCredentials(rawValue: string): VertexCredentials {
  const trimmed = rawValue.trim();
  const unwrapped =
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;

  try {
    return JSON.parse(unwrapped) as VertexCredentials;
  } catch {
    // Some env UIs escape quotes/newlines when storing JSON secrets.
    const normalized = unwrapped
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r");
    return JSON.parse(normalized) as VertexCredentials;
  }
}

function base64UrlEncode(input: Buffer | string) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getVertexAccessToken() {
  if (cachedVertexToken && cachedVertexToken.expiresAt > Date.now() + 60_000) {
    return cachedVertexToken.accessToken;
  }

  const credentials = getVertexCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: credentials.client_email,
    scope: GOOGLE_OAUTH_SCOPE,
    aud: credentials.token_uri,
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const unsignedJwt = `${encodedHeader}.${encodedClaimSet}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(credentials.private_key);
  const assertion = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(credentials.token_uri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vertex auth failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedVertexToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

function normalizeVertexPart(part: any) {
  if (typeof part === "string") return { text: part };
  if (!part || typeof part !== "object") return { text: String(part ?? "") };
  if ("text" in part || "inlineData" in part || "fileData" in part) return part;
  return part;
}

function normalizeVertexContents(request: GenerateContentInput) {
  if (typeof request === "string") {
    return [{ role: "user", parts: [{ text: request }] }];
  }

  if (Array.isArray(request)) {
    return [
      {
        role: "user",
        parts: request.map((part) => normalizeVertexPart(part)),
      },
    ];
  }

  if (request && typeof request === "object" && "contents" in request) {
    return ((request as any).contents || []).map((content: any) => ({
      ...content,
      parts: Array.isArray(content?.parts)
        ? content.parts.map((part: any) => normalizeVertexPart(part))
        : [],
    }));
  }

  return [{ role: "user", parts: [{ text: JSON.stringify(request) }] }];
}

function extractRequestGenerationConfig(request: GenerateContentInput) {
  if (request && typeof request === "object" && !Array.isArray(request)) {
    return (request as any).generationConfig || undefined;
  }
  return undefined;
}

function buildSystemInstruction(systemInstruction: any) {
  if (!systemInstruction) return undefined;
  if (typeof systemInstruction === "string") {
    return { parts: [{ text: systemInstruction }] };
  }
  if (Array.isArray(systemInstruction)) {
    return { parts: systemInstruction.map((part) => normalizeVertexPart(part)) };
  }
  if (systemInstruction?.parts) return systemInstruction;
  return { parts: [normalizeVertexPart(systemInstruction)] };
}

function attachVertexMetadata(
  response: any,
  requestedModel: string,
  actualModel: string,
) {
  Object.defineProperty(response, "__provider", {
    value: "vertex",
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(response, "__modelUsed", {
    value: normalizeModelName(actualModel),
    enumerable: false,
    configurable: true,
  });

  return {
    response,
    __provider: "vertex",
    __modelUsed: normalizeModelName(actualModel),
    __requestedModel: normalizeModelName(requestedModel),
  };
}

export class VertexGenerativeModel {
  model: string;
  generationConfig?: any;
  safetySettings?: any;
  tools?: any;
  toolConfig?: any;
  systemInstruction?: any;
  cachedContent?: any;
  _requestOptions?: RequestOptions;
  private readonly project: string;
  private readonly location: string;

  constructor(modelParams: ModelParams, requestOptions?: RequestOptions) {
    this.model = withModelPrefix(modelParams.model);
    this.generationConfig = modelParams.generationConfig;
    this.safetySettings = modelParams.safetySettings;
    this.tools = modelParams.tools;
    this.toolConfig = modelParams.toolConfig;
    this.systemInstruction = modelParams.systemInstruction;
    this.cachedContent = modelParams.cachedContent;
    this._requestOptions = requestOptions;
    this.project =
      process.env.GOOGLE_CLOUD_PROJECT?.trim() || DEFAULT_VERTEX_PROJECT;
    this.location =
      process.env.GOOGLE_CLOUD_LOCATION?.trim() || DEFAULT_VERTEX_LOCATION;
  }

  private getEndpoint(action: "generateContent" | "streamGenerateContent") {
    const model = normalizeModelName(this.model);
    const host =
      this.location === "global"
        ? "aiplatform.googleapis.com"
        : `${this.location}-aiplatform.googleapis.com`;
    return `https://${host}/v1/projects/${this.project}/locations/${this.location}/publishers/google/models/${model}:${action}`;
  }

  private async execute(request: GenerateContentInput) {
    const accessToken = await getVertexAccessToken();
    const contents = normalizeVertexContents(request);
    const generationConfig = {
      ...(this.generationConfig || {}),
      ...(extractRequestGenerationConfig(request) || {}),
    };

    const payload: Record<string, any> = {
      contents,
    };

    if (Object.keys(generationConfig).length) {
      payload.generationConfig = generationConfig;
    }
    if (this.safetySettings) payload.safetySettings = this.safetySettings;
    if (this.tools) payload.tools = this.tools;
    if (this.toolConfig) payload.toolConfig = this.toolConfig;
    if (this.cachedContent) payload.cachedContent = this.cachedContent;

    const systemInstruction = buildSystemInstruction(this.systemInstruction);
    if (systemInstruction) payload.systemInstruction = systemInstruction;

    let response: Response | null = null;
    for (let attempt = 0; attempt <= VERTEX_MAX_RETRIES; attempt += 1) {
      response = await fetch(this.getEndpoint("generateContent"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) break;

      if (response.status !== 429 || attempt === VERTEX_MAX_RETRIES) {
        break;
      }

      const delayMs = getRetryDelayMs(response, attempt);
      serverLog(
        "KAIZORA_LOG_VERTEX_USAGE",
        "warn",
        "[vertex] rate limited, retrying",
        {
          model: normalizeModelName(this.model),
          project: this.project,
          location: this.location,
          attempt: attempt + 1,
          maxRetries: VERTEX_MAX_RETRIES,
          delayMs,
        },
      );
      await sleep(delayMs);
    }

    if (!response) {
      throw new Error("Vertex generateContent failed before a response was received");
    }

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(
        `Vertex generateContent failed [${response.status}] ${text}`,
      ) as Error & { status?: number; statusText?: string };
      error.status = response.status;
      error.statusText = response.statusText;
      throw error;
    }

    const responsePayload = await response.json();
    const wrapped = wrapVertexResponsePayload(responsePayload);
    const text = wrapped.text();

    if (!text.trim()) {
      const candidate = Array.isArray(responsePayload?.candidates)
        ? responsePayload.candidates[0]
        : null;
      serverLog(
        "KAIZORA_LOG_VERTEX_USAGE",
        "warn",
        "[vertex] empty text response",
        {
          model: normalizeModelName(this.model),
          project: this.project,
          location: this.location,
          promptFeedback: responsePayload?.promptFeedback ?? null,
          usageMetadata: responsePayload?.usageMetadata ?? null,
          finishReason: candidate?.finishReason ?? null,
          safetyRatings: candidate?.safetyRatings ?? null,
          candidatePreview: candidate
            ? JSON.stringify(candidate).slice(0, 1200)
            : null,
        },
      );
    }

    return wrapped;
  }

  async generateContent(
    request: GenerateContentInput,
    _requestOptions: SingleRequestOptions = {},
  ) {
    const response = await this.execute(request);
    return attachVertexMetadata(response, this.model, this.model);
  }

  async generateContentStream(
    request: GenerateContentInput,
    requestOptions: SingleRequestOptions = {},
  ) {
    const result = await this.generateContent(request, requestOptions);
    const response = result.response;

    async function* streamChunks() {
      yield {
        text() {
          return response.text();
        },
      };
    }

    return {
      stream: streamChunks(),
      response: Promise.resolve(response),
    };
  }
}

export class VertexGoogleGenerativeAI {
  getGenerativeModel(
    modelParams: ModelParams,
    requestOptions?: RequestOptions,
  ) {
    return new VertexGenerativeModel(modelParams, requestOptions);
  }
}

export function isUsingVertexProvider() {
  return isVertexProvider();
}

export function logVertexBootstrap() {
  serverLog("KAIZORA_LOG_VERTEX_USAGE", "info", "[vertex] bootstrap", {
    enabled: isVertexProvider(),
    project:
      process.env.GOOGLE_CLOUD_PROJECT?.trim() || DEFAULT_VERTEX_PROJECT,
    location:
      process.env.GOOGLE_CLOUD_LOCATION?.trim() || DEFAULT_VERTEX_LOCATION,
  });
}
