const API1_URL =
  "https://api.testbook.com/api/v1/target-family-details?pageType=pyp&type=%5Bapp%5D%20Get%20Pyp%20Target%20SuperGroup&__projection=%7B%22superGroup%22:%7B%22_id%22:1,%22properties%22:1,%22targetsCount%22:1%7D%7D&language=English";

// Server-side fallback token. Expires 2026-06-28. Override via TESTBOOK_AUTH_CODE env var or X-Auth-Token header from the UI.
const FALLBACK_AUTH_CODE =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3Rlc3Rib29rLmNvbSIsInN1YiI6IjY0ZTdiNWYyOTAwMjc4NTg2NTMwMDdhYSIsImF1ZCI6IlRCIiwiZXhwIjoiMjAyNi0wNi0yOFQwNTo1MjoyMy45OTczMzkyNzFaIiwiaWF0IjoiMjAyNi0wNS0yOVQwNTo1MjoyMy45OTczMzkyNzFaIiwibmFtZSI6IlNhZ2FyIEJ1dGxhIiwiZW1haWwiOiJzYWdhci5idXRsYUBnbWFpbC5jb20iLCJvcmdJZCI6IiIsImhvbWVTdGF0ZUlkIjoiNWY5MTYzYTQyZWM4MjdiMjE4ZGFjZDJlIiwiaXNMTVNVc2VyIjpmYWxzZSwicm9sZXMiOiJzdHVkZW50In0.Wil22IIfoe64aqEsoq-q34UPtRBMgy0LfZ7lliVoCqeDjnWutkolc2bvsfxNs4n2q55pb_v9zR1CqyyHTsp2bFAvHkM-brFgMUykonLEmkxgkiYS5oDCivQbsPl2v49MiTga6N9Emq-7dkKs6tAs7EZe_fG-1N_BVz5sZOiEdNo";

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

  const buffer = await response.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(buffer);

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
    "X-Tb-Client": "web,1.3",
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

// Replicates the minimum browser sequence needed to create an attempt and unlock answers:
//   1. GET /state?beforeServe=true  → creates the attempt record (no attemptNo yet)
//   2. GET /state?beforeServe=false → marks attempt as serving
//   3. GET /state?beforeServe=true&attemptNo=1 → re-checks state with attempt context
//   4. GET /v2.2/tests/{id}/analysis?attemptNo=1 → loads analysis page; server finalises attempt
// The analysis call (step 4) is what makes /answers?attemptNo=1 return data.
export async function initTestAttempt(paperId: string, authCode: string): Promise<void> {
  const encodedId = encodeURIComponent(paperId);
  const stateBase = `https://api-new.testbook.com/api/v2/tests/${encodedId}/state`;
  const sharedState = {
    auth_code: authCode,
    "X-Tb-Client": "web,1.3",
    language: "English",
    client: "web",
    testLang: "en",
  };

  // Step 1: create attempt (beforeServe=true, no attemptNo)
  await fetch(
    `${stateBase}?${new URLSearchParams({ ...sharedState, beforeServe: "true", random: String(Math.random()) }).toString()}`,
    { method: "GET", cache: "no-store" },
  ).catch(() => null);

  // Step 2: mark as serving
  await fetch(
    `${stateBase}?${new URLSearchParams({ ...sharedState, beforeServe: "false", random: String(Math.random()) }).toString()}`,
    { method: "GET", cache: "no-store" },
  ).catch(() => null);

  // Step 3: re-check state with attemptNo=1 (as the browser does after navigation)
  await fetch(
    `${stateBase}?${new URLSearchParams({ ...sharedState, beforeServe: "true", attemptNo: "1", random: String(Math.random()) }).toString()}`,
    { method: "GET", cache: "no-store" },
  ).catch(() => null);

  // Step 4: call analysis endpoint — this is what the browser loads on the results page
  //         and appears to be required for /answers?attemptNo=1 to return data
  const analysisParams = new URLSearchParams({
    auth_code: authCode,
    "X-Tb-Client": "web,1.3",
    language: "English",
    attemptNo: "1",
    requiredStateExamCutoffs: "true",
  });
  await fetch(
    `https://api-new.testbook.com/api/v2.2/tests/${encodedId}/analysis?${analysisParams.toString()}`,
    { method: "GET", cache: "no-store" },
  ).catch(() => null);
}

export async function getQuestionAnswersRaw(paperId: string, authCode: string) {
  const encodedId = encodeURIComponent(paperId);
  const params = new URLSearchParams({
    auth_code: authCode,
    "X-Tb-Client": "web,1.3",
    language: "English",
    attemptNo: "1",
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
