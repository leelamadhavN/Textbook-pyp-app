"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import type { Paper, Role, SuperGroup } from "@/lib/testbook-mappers";

const PAGE_LIMIT = 5;
const YEAR_PAGE_SIZE = 5;

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

  const [error, setError] = useState("");

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

  const handleDownload = async (paper: Paper) => {
    setDownloadingPaperId(paper.id);
    setError("");

    try {
      const response = await fetch(`/api/download?paperId=${paper.id}`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Excel download failed");
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${paper.title || "question-paper"}.xlsx`;
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
            {loadingPapers && <span className={styles.loading}>Loading papers...</span>}
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
