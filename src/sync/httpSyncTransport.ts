import type {
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncTransport,
} from "./syncRunner";

export interface HttpSyncTransportConfig {
  apiBaseUrl: string;
  authToken?: string;
  fetchImpl?: typeof fetch;
}

export function createHttpSyncTransport(
  config: HttpSyncTransportConfig,
): SyncTransport {
  const baseUrl = config.apiBaseUrl.replace(/\/+$/, "");
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async push(request: SyncPushRequest): Promise<SyncPushResponse> {
      const response = await fetchImpl(`${baseUrl}/api/sync/push`, {
        method: "POST",
        credentials: "same-origin",
        signal: AbortSignal.timeout(30000),
        headers: {
          ...(config.authToken
            ? { authorization: `Bearer ${config.authToken}` }
            : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      });

      const body = await readJson(response);
      if (!response.ok) {
        throw new Error(extractErrorMessage(body, response.statusText));
      }

      if (!body || typeof body.cursor !== "string") {
        throw new Error("Sync response did not include a cursor");
      }

      return { cursor: body.cursor };
    },

    async pull(request: SyncPullRequest): Promise<SyncPullResponse> {
      const response = await fetchImpl(
        `${baseUrl}/api/sync/pull?since=${encodeURIComponent(request.cursor)}`,
        {
          method: "GET",
          credentials: "same-origin",
          signal: AbortSignal.timeout(30000),
          headers: {
            ...(config.authToken
              ? { authorization: `Bearer ${config.authToken}` }
              : {}),
          },
        },
      );

      const body = await readJson(response);
      if (!response.ok) {
        throw new Error(extractErrorMessage(body, response.statusText));
      }

      if (
        !body ||
        typeof body.cursor !== "string" ||
        !Array.isArray(body.events)
      ) {
        throw new Error("Sync pull response was invalid");
      }

      return {
        cursor: body.cursor,
        events: body.events as Array<Record<string, unknown>>,
        ...(body.hasMore !== undefined
          ? { hasMore: Boolean(body.hasMore) }
          : {}),
      };
    },
  };
}

async function readJson(
  response: Response,
): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractErrorMessage(
  body: Record<string, unknown> | null,
  fallback: string,
): string {
  if (body && typeof body.error === "string" && body.error.trim()) {
    return body.error;
  }

  return fallback || "Sync request failed";
}
