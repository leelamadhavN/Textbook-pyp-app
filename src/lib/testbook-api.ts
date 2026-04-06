const API1_URL =
  "https://api.testbook.com/api/v1/target-family-details?pageType=pyp&type=%5Bapp%5D%20Get%20Pyp%20Target%20SuperGroup&__projection=%7B%22superGroup%22:%7B%22_id%22:1,%22properties%22:1,%22targetsCount%22:1%7D%7D&language=English";

const API4_AUTH_CODE =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3Rlc3Rib29rLmNvbSIsInN1YiI6IjY0ZTdiNWYyOTAwMjc4NTg2NTMwMDdhYSIsImF1ZCI6IlRCIiwiZXhwIjoiMjAyNi0wNS0wNFQxNDozMjoyOC4wMzkyNDU4OTFaIiwiaWF0IjoiMjAyNi0wNC0wNFQxNDozMjoyOC4wMzkyNDU4OTFaIiwibmFtZSI6IlNhZ2FyIEJ1dGxhIiwiZW1haWwiOiJzYWdhci5idXRsYUBnbWFpbC5jb20iLCJvcmdJZCI6IiIsImhvbWVTdGF0ZUlkIjoiNWY5MTYzYTQyZWM4MjdiMjE4ZGFjZDJlIiwiaXNMTVNVc2VyIjpmYWxzZSwicm9sZXMiOiJzdHVkZW50In0.JXwd1hTPFYLNf25HBEPJrFqG6XPURS73CKZ8LRsWrWwRT_CLa3ZbF05kl2dS9utsb6V_Wb5oSTKJLf4zeXsmxa0olnYOSqldR1K_wtrLWFmrH9L9VTGuEZAU14UjUcr_JeJfOseqrhG2_f9PZ8ghtbBjhaJTCReWTFXFb1jLVFk";

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

  if (!response.ok) {
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

export async function getQuestionPaperRaw(paperId: string) {
  const encodedId = encodeURIComponent(paperId);
  const params = new URLSearchParams({
    auth_code: API4_AUTH_CODE,
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
