export function maskSecret(value?: string | null) {
  if (!value) return "Not configured";
  if (value.length <= 8) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function formatReplicateError(error: any) {
  const response = error?.response;
  const request = error?.request;
  const body = error?.body;

  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    status: response?.status ?? error?.status ?? null,
    statusText: response?.statusText ?? error?.statusText ?? null,
    detail:
      body?.detail ||
      body?.error ||
      error?.detail ||
      error?.cause?.detail ||
      null,
    title: body?.title || error?.title || null,
    model: error?.model || null,
    requestUrl: request?.url || response?.url || null,
    method: request?.method || null,
  };
}

export function logReplicateError(context: string, error: any, extra?: Record<string, unknown>) {
  console.error(`${context}:`, {
    ...formatReplicateError(error),
    ...extra,
  });
}
