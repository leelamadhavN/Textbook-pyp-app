const API1_URL =
  "https://api.testbook.com/api/v1/target-family-details?pageType=pyp&type=%5Bapp%5D%20Get%20Pyp%20Target%20SuperGroup&__projection=%7B%22superGroup%22:%7B%22_id%22:1,%22properties%22:1,%22targetsCount%22:1%7D%7D&language=English";

// Server-side fallback token. Expires 2026-06-25. Override via TESTBOOK_AUTH_CODE env var or X-Auth-Token header from the UI.
const FALLBACK_AUTH_CODE =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3Rlc3Rib29rLmNvbSIsInN1YiI6IjY0ZTdiNWYyOTAwMjc4NTg2NTMwMDdhYSIsImF1ZCI6IlRCIiwiZXhwIjoiMjAyNi0wNi0yNVQwOTo0NTo1My4zNjgxMzE2ODlaIiwiaWF0IjoiMjAyNi0wNS0yNlQwOTo0NTo1My4zNjgxMzE2ODlaIiwibmFtZSI6IlNhZ2FyIEJ1dGxhIiwiZW1haWwiOiJzYWdhci5idXRsYUBnbWFpbC5jb20iLCJvcmdJZCI6IiIsImhvbWVTdGF0ZUlkIjoiNWY5MTYzYTQyZWM4MjdiMjE4ZGFjZDJlIiwiaXNMTVNVc2VyIjpmYWxzZSwicm9sZXMiOiJzdHVkZW50In0.a3pmCRVeXplwGrBPigYDIg7jjL_fN9eYiAQr1fr-Bei0Z9u1i9C8Pqy9f3nW-6CEQi1ykCqN-gkkcy6dul5D-4zsRzZDkHBtlb9mYGjiOvAG9j3LDUBVkDVxvrJgtkqcPqXHKeYdl078NgREYtD0XG57zOD7aw-OJcIaDD70D3M";

export function getServerAuthCode(headerToken?: string | null): string {
  return headerToken ?? process.env.TESTBOOK_AUTH_CODE ?? FALLBACK_AUTH_CODE;
}

export type JwtInfo = {
  name: string;
  email: string;
  expiresAt: string | null;
  isExpired: boolean;
  isValid: boolean;
};

export function parseJwtInfo(token: string): JwtInfo {
  const empty: JwtInfo = { name: "", email: "", expiresAt: null, isExpired: true, isValid: false };
  if (!token || typeof token !== "string") return empty;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return empty;
    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Record<string, unknown>;

    const exp = decoded.exp;
    let expiresAt: string | null = null;
    let isExpired = true;

    if (exp) {
      const expDate = typeof exp === "string" ? new Date(exp) : new Date((exp as number) * 1000);
      if (!Number.isNaN(expDate.getTime())) {
        expiresAt = expDate.toISOString();
        isExpired = expDate < new Date();
      }
    }

    return {
      name: typeof decoded.name === "string" ? decoded.name : "",
      email: typeof decoded.email === "string" ? decoded.email : "",
      expiresAt,
      isExpired,
      isValid: true,
    };
  } catch {
    return empty;
  }
}

type ApiResult = {
  success: boolean;
  status: number;
  body: unknown;
};

async function fetchJson(url: string): Promise<ApiResult> {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { success: false, message: "Invalid JSON response", raw: text };
  }

  const bodyIndicatesFailure =
    parsed &&
    typeof parsed === "object" &&
    "success" in parsed &&
    (parsed as { success?: boolean }).success === false;

  if (!response.ok || bodyIndicatesFailure) {
    return {
      success: false,
      status: response.status,
      body: parsed,
    };
  }

  return {
    success: true,
    status: response.status,
    body: parsed,
  };
}

export async function getSuperGroupsRaw() {
  return fetchJson(API1_URL);
}

export async function getRolesRaw(categoryId: string) {
  const encodedId = encodeURIComponent(categoryId);
  const url =
    `https://api.testbook.com/api/v1/previous-year-papers/${encodedId}/targets` +
    "?pageType=pyp&__projection=%7B%22targets%22:1%7D&language=English";

  return fetchJson(url);
}

type GetPapersOptions = {
  start: number;
  limit: number;
  year?: string;
};

export async function getPapersRaw(examId: string, options: GetPapersOptions) {
  const encodedId = encodeURIComponent(examId);
  const params = new URLSearchParams({
    id: examId,
    skip: String(options.start),
    limit: String(options.limit),
    year: options.year && options.year !== "all" ? options.year : "",
    stage: "",
    type: "[Target Page] getPypTargetTests",
    language: "English",
  });

  const url = `https://api.testbook.com/api/v1/previous-year-papers/target/${encodedId}?${params.toString()}`;
  return fetchJson(url);
}

export async function getQuestionPaperRaw(paperId: string, authCode: string) {
  const encodedId = encodeURIComponent(paperId);
  const params = new URLSearchParams({
    auth_code: authCode,
    "X-Tb-Client": "web,1.2",
    language: "English",
  });

  const url = `https://api-new.testbook.com/api/v2/tests/${encodedId}?${params.toString()}`;

  const attempts = 3;
  let lastResult: ApiResult | null = null;

  for (let i = 0; i < attempts; i += 1) {
    const result = await fetchJson(url);
    lastResult = result;

    if (result.success) {
      return result;
    }
  }

  return (
    lastResult ?? {
      success: false,
      status: 500,
      body: { success: false, message: "Unable to fetch question paper" },
    }
  );
}

export async function getQuestionAnswersRaw(paperId: string, authCode: string) {
  const encodedId = encodeURIComponent(paperId);
  const params = new URLSearchParams({
    auth_code: authCode,
    "X-Tb-Client": "web,1.2",
    language: "English",
  });

  const url = `https://api-new.testbook.com/api/v2/tests/${encodedId}/answers?${params.toString()}`;

  const attempts = 3;
  let lastResult: ApiResult | null = null;

  for (let i = 0; i < attempts; i += 1) {
    const result = await fetchJson(url);
    lastResult = result;

    if (result.success) {
      return result;
    }
  }

  return (
    lastResult ?? {
      success: false,
      status: 500,
      body: { success: false, message: "Unable to fetch question answers" },
    }
  );
}
