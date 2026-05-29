"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import type { Paper, Role, SuperGroup } from "@/lib/testbook-mappers";
import type { JwtInfo } from "@/lib/testbook-api";

const AUTH_TOKEN_KEY = "tb_auth_token";

const PAGE_LIMIT = 5;
const YEAR_PAGE_SIZE = 5;

function parseJwtInfoClient(token: string): JwtInfo {
  const empty: JwtInfo = { name: "", email: "", expiresAt: null, isExpired: true, isValid: false };
  if (!token) return empty;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return empty;
    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(raw)) as Record<string, unknown>;
    const exp = decoded.exp;
    let expiresAt: string | null = null;
    let isExpired = true;
    if (exp) {
      const d = typeof exp === "string" ? new Date(exp) : new Date((exp as number) * 1000);
      if (!Number.isNaN(d.getTime())) {
        expiresAt = d.toISOString();
        isExpired = d < new Date();
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

type ApiResponse<T> = {
  success: boolean;
  items: T[];
  message?: string;
};

type YearCount = {
  year: number;
  count: number;
};

type PapersApiResponse = {
  success: boolean;
  items: Paper[];
  yearCounts: YearCount[];
  pagination: {
    start: number;
    limit: number;
    total: number;
    totalOverall: number;
  };
  message?: string;
};

async function getItems<T>(url: string): Promise<T[]> {
  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Request failed");
  }

  return data.items ?? [];
}

function formatDate(dateText: string): string {
  if (!dateText) return "-";
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return dateText;
  return date.toLocaleString();
}

function getCsvFileNameFromHeaders(contentDisposition: string | null, fallback: string): string {
  if (contentDisposition) {
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      const decoded = decodeURIComponent(utf8Match[1]);
      return decoded.toLowerCase().endsWith(".csv") ? decoded : `${decoded}.csv`;
    }

    const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    if (basicMatch?.[1]) {
      const value = basicMatch[1].trim();
      return value.toLowerCase().endsWith(".csv") ? value : `${value}.csv`;
    }
  }

  const safeFallback = fallback || "question-paper";
  return safeFallback.toLowerCase().endsWith(".csv")
    ? safeFallback
    : `${safeFallback}.csv`;
}

async function getPapersPage(examId: string, year: string, page: number) {
  const start = (page - 1) * PAGE_LIMIT;
  const url = `/api/papers?examId=${encodeURIComponent(examId)}&start=${start}&limit=${PAGE_LIMIT}&year=${encodeURIComponent(year)}`;
  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json()) as PapersApiResponse;

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to fetch papers");
  }

  return data;
}

export default function Home() {
  const [superGroups, setSuperGroups] = useState<SuperGroup[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);

  const [selectedSuperGroupId, setSelectedSuperGroupId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedYear, setSelectedYear] = useState("all");
  const [yearCounts, setYearCounts] = useState<YearCount[]>([]);
  const [yearPage, setYearPage] = useState(1);
  const [paperPage, setPaperPage] = useState(1);
  const [paperTotal, setPaperTotal] = useState(0);
  const [paperTotalOverall, setPaperTotalOverall] = useState(0);

  const [loadingSuperGroups, setLoadingSuperGroups] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [downloadingPaperId, setDownloadingPaperId] = useState("");
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");

  const [error, setError] = useState("");

  const [authToken, setAuthToken] = useState("");
  const [authTokenInput, setAuthTokenInput] = useState("");
  const [tokenPanelOpen, setTokenPanelOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
    setAuthToken(saved);
    setAuthTokenInput(saved);
    if (!saved) setTokenPanelOpen(true);
  }, []);

  const tokenInfo = useMemo(() => parseJwtInfoClient(authToken), [authToken]);

  const handleSaveToken = () => {
    const trimmed = authTokenInput.trim();
    setAuthToken(trimmed);
    localStorage.setItem(AUTH_TOKEN_KEY, trimmed);
  };

  const handleClearToken = () => {
    setAuthToken("");
    setAuthTokenInput("");
    localStorage.removeItem(AUTH_TOKEN_KEY);
  };

  useEffect(() => {
    const load = async () => {
      setLoadingSuperGroups(true);
      setError("");

      try {
        const items = await getItems<SuperGroup>("/api/super-groups");
        setSuperGroups(items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch super groups");
      } finally {
        setLoadingSuperGroups(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    if (!selectedSuperGroupId) {
      setRoles([]);
      setSelectedRoleId("");
      setPapers([]);
      setYearCounts([]);
      setPaperTotal(0);
      setPaperTotalOverall(0);
      return;
    }

    const load = async () => {
      setLoadingRoles(true);
      setError("");
      setSelectedRoleId("");
      setPapers([]);
      setYearCounts([]);
      setSelectedYear("all");
      setYearPage(1);
      setPaperPage(1);
      setPaperTotal(0);
      setPaperTotalOverall(0);

      try {
        const items = await getItems<Role>(`/api/roles?categoryId=${selectedSuperGroupId}`);
        setRoles(items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch roles");
      } finally {
        setLoadingRoles(false);
      }
    };

    void load();
  }, [selectedSuperGroupId]);

  useEffect(() => {
    if (!selectedRoleId) {
      setPapers([]);
      setSelectedYear("all");
      setYearCounts([]);
      setYearPage(1);
      setPaperPage(1);
      setPaperTotal(0);
      setPaperTotalOverall(0);
      return;
    }

    const load = async () => {
      setLoadingPapers(true);
      setError("");

      try {
        const data = await getPapersPage(selectedRoleId, selectedYear, paperPage);
        setPapers(data.items ?? []);
        setYearCounts(data.yearCounts ?? []);
        setPaperTotal(data.pagination?.total ?? 0);
        setPaperTotalOverall(data.pagination?.totalOverall ?? 0);

        const totalPages = Math.max(1, Math.ceil((data.pagination?.total ?? 0) / PAGE_LIMIT));
        if (paperPage > totalPages) {
          setPaperPage(totalPages);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch papers");
      } finally {
        setLoadingPapers(false);
      }
    };

    void load();
  }, [selectedRoleId, selectedYear, paperPage]);

  const selectedSuperGroup = useMemo(
    () => superGroups.find((group) => group.id === selectedSuperGroupId),
    [selectedSuperGroupId, superGroups],
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId),
    [selectedRoleId, roles],
  );

  const totalPaperPages = useMemo(
    () => Math.max(1, Math.ceil((paperTotal || 0) / PAGE_LIMIT)),
    [paperTotal],
  );

  const totalYearPages = useMemo(
    () => Math.max(1, Math.ceil((yearCounts.length || 0) / YEAR_PAGE_SIZE)),
    [yearCounts.length],
  );

  const visibleYears = useMemo(() => {
    const start = (yearPage - 1) * YEAR_PAGE_SIZE;
    return yearCounts.slice(start, start + YEAR_PAGE_SIZE);
  }, [yearCounts, yearPage]);

  const handleSelectYear = (year: string) => {
    setSelectedYear(year);
    setPaperPage(1);
  };

  const handleBulkDownload = async () => {
    if (!selectedRoleId) return;

    setBulkDownloading(true);
    setBulkStatus("Starting...");
    setError("");

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers["x-auth-token"] = authToken;

      const examName = selectedRole?.title ?? "exam";
      const url =
        `/api/bulk-download?examId=${encodeURIComponent(selectedRoleId)}` +
        `&year=${encodeURIComponent(selectedYear)}` +
        `&examName=${encodeURIComponent(examName)}`;

      setBulkStatus("Attempting & downloading all papers…");
      const response = await fetch(url, { method: "GET", headers });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorBody.message || "Bulk download failed");
      }

      const total = response.headers.get("X-Papers-Total") ?? "?";
      const processed = response.headers.get("X-Papers-Processed") ?? "?";
      const failed = response.headers.get("X-Papers-Failed") ?? "0";
      const questions = response.headers.get("X-Questions-Total") ?? "?";

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      const cd = response.headers.get("content-disposition");
      link.download = getCsvFileNameFromHeaders(cd, `${examName}_all.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);

      const failedNum = Number(failed);
      setBulkStatus(
        `Done: ${processed}/${total} papers, ${questions} questions` +
          (failedNum > 0 ? ` (${failed} failed)` : ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk download failed");
      setBulkStatus("");
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleDownload = async (paper: Paper) => {
    if (!paper.id) {
      setError("This paper does not have a valid test ID for download.");
      return;
    }

    setDownloadingPaperId(paper.id);
    setError("");

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers["x-auth-token"] = authToken;

      const response = await fetch(`/api/download?paperId=${paper.id}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(errorBody.message || "CSV download failed");
      }

      const answersAvailable = response.headers.get("X-Answers-Available");
      const answersMessageEncoded = response.headers.get("X-Answers-Message");
      const answersMessage = answersMessageEncoded
        ? decodeURIComponent(answersMessageEncoded)
        : "Answers unavailable from upstream API";

      if (answersAvailable === "false") {
        setError(
          `Downloaded without answers: ${answersMessage}. So correct_option and solution_text may be blank.`,
        );
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      const contentDisposition = response.headers.get("content-disposition");
      link.download = getCsvFileNameFromHeaders(
        contentDisposition,
        `${paper.title || "question-paper"}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingPaperId("");
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>Testbook Previous Year Papers Extractor</h1>
        <p className={styles.subtitle}>
          Super Group → Role → Year Paper → Download Excel question sheet
        </p>

        <section className={styles.tokenPanel}>
          <button
            type="button"
            className={styles.tokenPanelToggle}
            onClick={() => setTokenPanelOpen((o) => !o)}
          >
            <span>
              Auth Token
              {tokenInfo.isValid && !tokenInfo.isExpired && (
                <span className={styles.tokenBadgeOk}>Active — {tokenInfo.name || tokenInfo.email}</span>
              )}
              {tokenInfo.isValid && tokenInfo.isExpired && (
                <span className={styles.tokenBadgeExp}>Expired</span>
              )}
              {!authToken && (
                <span className={styles.tokenBadgeMissing}>Not set — required for download</span>
              )}
            </span>
            <span>{tokenPanelOpen ? "▲" : "▼"}</span>
          </button>

          {tokenPanelOpen && (
            <div className={styles.tokenBody}>
              <p className={styles.tokenHint}>
                <strong>How to get your auth_code:</strong> Log in to{" "}
                <strong>testbook.com</strong>, open DevTools (F12) → Network tab, filter by{" "}
                <code>api-new.testbook.com</code>, click any request, and copy the{" "}
                <code>auth_code</code> query parameter value. Paste it below.
              </p>

              {tokenInfo.isValid && tokenInfo.isExpired && tokenInfo.expiresAt && (
                <p className={styles.tokenExpiredMsg}>
                  Current token expired on {new Date(tokenInfo.expiresAt).toLocaleString()}. Please refresh it.
                </p>
              )}

              <textarea
                className={styles.tokenInput}
                value={authTokenInput}
                onChange={(e) => setAuthTokenInput(e.target.value)}
                placeholder="Paste your Testbook auth_code JWT here..."
                rows={3}
                spellCheck={false}
              />

              <div className={styles.tokenActions}>
                <button
                  type="button"
                  className={styles.tokenSaveBtn}
                  onClick={handleSaveToken}
                  disabled={!authTokenInput.trim()}
                >
                  Save Token
                </button>
                {authToken && (
                  <button
                    type="button"
                    className={styles.tokenClearBtn}
                    onClick={handleClearToken}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className={styles.controls}>
          <label className={styles.label}>
            Super Group
            <select
              className={styles.select}
              value={selectedSuperGroupId}
              onChange={(event) => setSelectedSuperGroupId(event.target.value)}
              disabled={loadingSuperGroups}
            >
              <option value="">Select Super Group</option>
              {superGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.title} ({group.targetsCount})
                </option>
              ))}
            </select>
          </label>

          <label className={styles.label}>
            Role in Super Group
            <select
              className={styles.select}
              value={selectedRoleId}
              onChange={(event) => setSelectedRoleId(event.target.value)}
              disabled={!selectedSuperGroupId || loadingRoles}
            >
              <option value="">Select Role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title} ({role.pypCount})
                </option>
              ))}
            </select>
          </label>

          <label className={styles.label}>
            Year Total
            <input
              className={styles.select}
              value={`All Years (${paperTotalOverall})`}
              readOnly
            />
          </label>
        </section>

        <section className={styles.yearFilterPanel}>
          <div className={styles.yearHeader}>
            <h3>Year Filters</h3>
            <span>
              Year Page {yearPage} / {totalYearPages}
            </span>
          </div>

          <div className={styles.yearButtons}>
            <button
              type="button"
              className={selectedYear === "all" ? styles.yearButtonActive : styles.yearButton}
              onClick={() => handleSelectYear("all")}
            >
              All ({paperTotalOverall})
            </button>
            {visibleYears.map((item) => {
              const yearValue = String(item.year);
              return (
                <button
                  type="button"
                  key={item.year}
                  className={selectedYear === yearValue ? styles.yearButtonActive : styles.yearButton}
                  onClick={() => handleSelectYear(yearValue)}
                >
                  {item.year} ({item.count})
                </button>
              );
            })}
          </div>

          <div className={styles.paginationRow}>
            <button
              type="button"
              className={styles.pageButton}
              disabled={yearPage <= 1}
              onClick={() => setYearPage((prev) => Math.max(1, prev - 1))}
            >
              Prev Years
            </button>
            <button
              type="button"
              className={styles.pageButton}
              disabled={yearPage >= totalYearPages}
              onClick={() => setYearPage((prev) => Math.min(totalYearPages, prev + 1))}
            >
              Next Years
            </button>
          </div>
        </section>

        <section className={styles.meta}>
          <span>
            Selected Super Group: <strong>{selectedSuperGroup?.title ?? "-"}</strong>
          </span>
          <span>
            Selected Role: <strong>{selectedRole?.title ?? "-"}</strong>
          </span>
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <section className={styles.papers}>
          <div className={styles.paperHeaderRow}>
            <h2>
              Year Papers ({paperTotal}) - Page {paperPage} / {totalPaperPages}
            </h2>
            <div className={styles.paperHeaderActions}>
              {loadingPapers && <span className={styles.loading}>Loading papers...</span>}
              {selectedRoleId && paperTotalOverall > 0 && (
                <div className={styles.bulkDownloadWrap}>
                  <button
                    type="button"
                    className={styles.bulkDownloadButton}
                    onClick={() => void handleBulkDownload()}
                    disabled={bulkDownloading}
                  >
                    {bulkDownloading
                      ? bulkStatus || "Working…"
                      : `Attempt & Download All (${selectedYear === "all" ? paperTotalOverall : paperTotal})`}
                  </button>
                  {!bulkDownloading && bulkStatus && (
                    <span className={styles.bulkStatusMsg}>{bulkStatus}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {!loadingPapers && papers.length === 0 && (
            <p className={styles.empty}>No papers found for selected role.</p>
          )}

          {papers.map((paper) => (
            <article key={paper.id} className={styles.paperCard}>
              <div className={styles.paperInfo}>
                <h3>{paper.title}</h3>
                <p>
                  Year: {paper.year || "-"} | Date/Time: {formatDate(paper.examDate)} | Duration: {paper.durationMinutes} min
                </p>
              </div>
              <button
                className={styles.downloadButton}
                onClick={() => void handleDownload(paper)}
                disabled={downloadingPaperId === paper.id}
              >
                {downloadingPaperId === paper.id ? "Preparing Excel..." : "Download"}
              </button>
            </article>
          ))}

          {paperTotal > 0 && (
            <div className={styles.paginationRow}>
              <button
                type="button"
                className={styles.pageButton}
                disabled={paperPage <= 1 || loadingPapers}
                onClick={() => setPaperPage((prev) => Math.max(1, prev - 1))}
              >
                Prev Page
              </button>
              <button
                type="button"
                className={styles.pageButton}
                disabled={paperPage >= totalPaperPages || loadingPapers}
                onClick={() => setPaperPage((prev) => Math.min(totalPaperPages, prev + 1))}
              >
                Next Page
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
