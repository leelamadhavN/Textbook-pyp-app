"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import type { Paper, Role, SuperGroup } from "@/lib/testbook-mappers";
import type { JwtInfo } from "@/lib/testbook-api";
import type { PaperStateInfo } from "@/app/api/paper-states/route";
import { detectPaperType } from "@/lib/examprep-api";

type InstanceProgress = {
  paperId: string;
  paperTitle: string;
  year: number;
  instanceId: string | null;
  instanceStatus: "pending" | "created" | "exists" | "failed";
  instanceError?: string;
  uploadStatus: "pending" | "uploading" | "success" | "failed";
  uploadError?: string;
  questionCount?: number;
  imported?: number;
};

type PaperTypeProgress = {
  name: string;
  stage: string;
  paperTypeId: string | null;
  status: "pending" | "created" | "exists" | "failed";
  error?: string;
  instances: InstanceProgress[];
};

type UploadProgressState = {
  examName: string;
  examId: string | null;
  examStatus: "pending" | "created" | "exists" | "failed";
  examError?: string;
  paperTypes: PaperTypeProgress[];
  currentStep: string;
  totalPapers: number;
  uploadedCount: number;
  failedCount: number;
  completed: boolean;
  errorList: string[];
};

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

  // Upload to examprep state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  const [paperStates, setPaperStates] = useState<Record<string, PaperStateInfo>>({});
  const [loadingStates, setLoadingStates] = useState(false);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);

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

  // Auto-check paper availability whenever the papers list or auth token changes
  useEffect(() => {
    if (papers.length === 0 || !authToken) {
      setPaperStates({});
      return;
    }

    const checkStates = async () => {
      setLoadingStates(true);
      try {
        const ids = papers.map((p) => p.id).join(",");
        const response = await fetch(`/api/paper-states?paperIds=${encodeURIComponent(ids)}`, {
          headers: { "x-auth-token": authToken },
          cache: "no-store",
        });
        const data = (await response.json()) as { success: boolean; states: Record<string, PaperStateInfo> };
        if (data.success) setPaperStates(data.states);
      } catch {
        // silently fail — papers still show without availability info
      } finally {
        setLoadingStates(false);
      }
    };

    void checkStates();
  }, [papers, authToken]);

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

  // Papers filtered by availability toggle; only applies when states are loaded
  const statesLoaded = Object.keys(paperStates).length > 0;
  const displayedPapers = useMemo(() => {
    if (!showOnlyAvailable || !statesLoaded) return papers;
    return papers.filter((p) => paperStates[p.id]?.accessible !== false);
  }, [papers, paperStates, showOnlyAvailable, statesLoaded]);

  const accessibleCount = useMemo(
    () => papers.filter((p) => paperStates[p.id]?.accessible === true).length,
    [papers, paperStates],
  );

  const handleSelectYear = (year: string) => {
    setSelectedYear(year);
    setPaperPage(1);
  };

  const handleBulkDownload = async () => {
    if (!selectedRoleId) return;

    setBulkDownloading(true);
    setBulkStatus("Fetching full papers list…");
    setError("");

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers["x-auth-token"] = authToken;

      // Step 1: get all paper IDs for this exam / year (may span multiple pages)
      const allPapersResp = await fetch(
        `/api/all-papers?examId=${encodeURIComponent(selectedRoleId)}&year=${encodeURIComponent(selectedYear)}`,
        { headers },
      );
      const allPapersData = (await allPapersResp.json()) as {
        success: boolean;
        papers: Paper[];
        message?: string;
      };
      if (!allPapersData.success || !allPapersData.papers?.length) {
        throw new Error(allPapersData.message ?? "No papers found.");
      }
      // Deduplicate by paper ID — some papers appear under multiple year buckets
      const seenIds = new Set<string>();
      const allPapers = allPapersData.papers.filter((p) => {
        if (!p.id || seenIds.has(p.id)) return false;
        seenIds.add(p.id);
        return true;
      });

      // Step 2: check availability for any papers not already in local state cache
      const unchecked = allPapers.filter((p) => paperStates[p.id] === undefined);
      let allStates: Record<string, PaperStateInfo> = { ...paperStates };

      if (unchecked.length > 0) {
        setBulkStatus(`Checking availability for ${unchecked.length} papers…`);
        const statesResp = await fetch(
          `/api/paper-states?paperIds=${encodeURIComponent(unchecked.map((p) => p.id).join(","))}`,
          { headers },
        );
        const statesData = (await statesResp.json()) as {
          success: boolean;
          states: Record<string, PaperStateInfo>;
        };
        if (statesData.success) {
          allStates = { ...allStates, ...statesData.states };
          setPaperStates(allStates);
        }
      }

      // Step 3: classify papers
      const accessible = allPapers.filter((p) => {
        const s = allStates[p.id];
        return s === undefined || s.accessible;  // undefined = unknown, try anyway
      });
      const lockedCount = allPapers.length - accessible.length;

      if (accessible.length === 0) {
        throw new Error(`All ${allPapers.length} papers are locked for this account.`);
      }

      // Step 4: deduplicate by title before downloading — same title = same paper, download only once
      const seenTitles = new Set<string>();
      const toDownload = accessible.filter((p) => {
        const key = p.title.trim().toLowerCase();
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      });
      const titleDupCount = accessible.length - toDownload.length;

      let downloaded = 0;
      let failed = 0;

      // Safety net: also track server-returned filenames to catch any remaining collisions
      const usedFileNames = new Set<string>();

      for (let i = 0; i < toDownload.length; i++) {
        const paper = toDownload[i];
        const state = allStates[paper.id];
        const label =
          state?.attemptsCompleted > 0
            ? "already attempted"
            : "attempting & extracting";

        setBulkStatus(
          `[${i + 1}/${toDownload.length}] ${label}: ${paper.title.slice(0, 45)}…`,
        );

        try {
          const response = await fetch(`/api/download?paperId=${encodeURIComponent(paper.id)}`, {
            method: "GET",
            headers,
          });

          if (!response.ok) {
            const errBody = (await response.json().catch(() => ({}))) as { message?: string };
            console.warn(`[bulk] skip ${paper.title}: ${errBody.message ?? response.status}`);
            failed++;
            continue;
          }

          const cd = response.headers.get("content-disposition");
          const fileName = getCsvFileNameFromHeaders(cd, `${paper.title}.csv`);

          // Safety net: skip if server returned a name we already used
          if (usedFileNames.has(fileName.toLowerCase())) {
            console.warn(`[bulk] duplicate filename skipped: ${fileName}`);
            continue;
          }
          usedFileNames.add(fileName.toLowerCase());

          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(blobUrl);

          downloaded++;

          // Brief pause so the browser doesn't group/block successive downloads
          if (i < toDownload.length - 1) {
            await new Promise<void>((resolve) => setTimeout(resolve, 600));
          }
        } catch {
          failed++;
        }
      }

      const dupMsg = titleDupCount > 0 ? ` · ${titleDupCount} duplicate title(s) skipped` : "";

      setBulkStatus(
        `Done: ${downloaded} downloaded · ${lockedCount} locked${dupMsg}` +
          (failed > 0 ? ` · ${failed} failed` : ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk download failed");
      setBulkStatus("");
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleAttemptAndUpload = async () => {
    if (!selectedRoleId || !selectedRole) return;

    setUploading(true);
    setShowUploadPanel(true);
    setError("");

    const initialProgress: UploadProgressState = {
      examName: selectedRole.title,
      examId: null,
      examStatus: "pending",
      paperTypes: [],
      currentStep: "Fetching papers...",
      totalPapers: 0,
      uploadedCount: 0,
      failedCount: 0,
      completed: false,
      errorList: [],
    };
    setUploadProgress(initialProgress);

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers["x-auth-token"] = authToken;

      // Step 1: get all papers
      updateProgress({ currentStep: "Fetching all papers..." });
      const allPapersResp = await fetch(
        `/api/all-papers?examId=${encodeURIComponent(selectedRoleId)}&year=${encodeURIComponent(selectedYear)}`,
        { headers },
      );
      const allPapersData = (await allPapersResp.json()) as {
        success: boolean;
        papers: Paper[];
        message?: string;
      };
      if (!allPapersData.success || !allPapersData.papers?.length) {
        throw new Error(allPapersData.message ?? "No papers found.");
      }

      const seenIds = new Set<string>();
      const allPapers = allPapersData.papers.filter((p) => {
        if (!p.id || seenIds.has(p.id)) return false;
        seenIds.add(p.id);
        return true;
      });

      // Step 2: check availability
      updateProgress({ currentStep: "Checking paper availability..." });
      const unchecked = allPapers.filter((p) => paperStates[p.id] === undefined);
      let allStates: Record<string, PaperStateInfo> = { ...paperStates };

      if (unchecked.length > 0) {
        const statesResp = await fetch(
          `/api/paper-states?paperIds=${encodeURIComponent(unchecked.map((p) => p.id).join(","))}`,
          { headers },
        );
        const statesData = (await statesResp.json()) as {
          success: boolean;
          states: Record<string, PaperStateInfo>;
        };
        if (statesData.success) {
          allStates = { ...allStates, ...statesData.states };
          setPaperStates(allStates);
        }
      }

      const accessible = allPapers.filter((p) => {
        const s = allStates[p.id];
        return s === undefined || s.accessible;
      });

      if (accessible.length === 0) {
        throw new Error("All papers are locked for this account.");
      }

      const seenTitles = new Set<string>();
      const toUpload = accessible.filter((p) => {
        const key = p.title.trim().toLowerCase();
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      });

      // Step 3: detect paper types and group
      updateProgress({ currentStep: "Detecting paper types..." });
      const groupMap = new Map<
        string,
        { stage: string; name: string; papers: Paper[] }
      >();

      for (const paper of toUpload) {
        const pt = detectPaperType(paper.title);
        const key = pt.name;
        if (!groupMap.has(key)) {
          groupMap.set(key, { stage: pt.stage, name: pt.name, papers: [] });
        }
        groupMap.get(key)!.papers.push(paper);
      }

      const paperTypeGroups = Array.from(groupMap.values()).map((g) => ({
        stage: g.stage,
        name: g.name,
        papers: g.papers.map((p) => ({
          id: p.id,
          year: p.year,
          displayName: p.title,
        })),
      }));

      // Step 4: batch setup on examprep
      updateProgress({
        currentStep: `Setting up on examprep: ${selectedRole.title} (${paperTypeGroups.length} paper types, ${toUpload.length} papers)...`,
      });

      const setupResp = await fetch("/api/examprep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setup-batch",
          examName: selectedRole.title,
          paperTypeGroups,
        }),
      });

      if (!setupResp.ok) {
        const errData = await setupResp.json().catch(() => ({ message: "Setup failed" }));
        throw new Error((errData as { message?: string }).message ?? "Setup failed");
      }

      const setupData = (await setupResp.json()) as {
        success: boolean;
        examId: string;
        examStatus: "created" | "exists";
        examName: string;
        paperTypes: Array<{
          name: string;
          stage: string;
          paperTypeId: string | null;
          status: "created" | "exists" | "failed";
          error?: string;
          instances: Array<{
            paperId: string;
            paperTitle: string;
            year: number;
            instanceId: string | null;
            status: "created" | "exists" | "failed";
            error?: string;
          }>;
        }>;
      };

      if (!setupData.success) {
        throw new Error("Setup failed on examprep");
      }

      // Build full progress from setup response
      const progressPTs: PaperTypeProgress[] = setupData.paperTypes.map(
        (pt) => ({
          name: pt.name,
          stage: pt.stage,
          paperTypeId: pt.paperTypeId,
          status: pt.status,
          error: pt.error,
          instances: pt.instances.map((inst) => ({
            paperId: inst.paperId,
            paperTitle: inst.paperTitle,
            year: inst.year,
            instanceId: inst.instanceId,
            instanceStatus: inst.status,
            instanceError: inst.error,
            uploadStatus: "pending" as const,
          })),
        }),
      );

      const totalPapers = progressPTs.reduce(
        (sum, pt) => sum + pt.instances.length,
        0,
      );
      const errorList: string[] = [];

      // Record instance creation failures
      for (const pt of progressPTs) {
        if (pt.status === "failed") {
          errorList.push(
            `Paper type "${pt.name}" creation failed: ${pt.error ?? "Unknown error"}`,
          );
        }
        for (const inst of pt.instances) {
          if (inst.instanceStatus === "failed") {
            errorList.push(
              `Instance "${inst.paperTitle}" (${pt.name}) creation failed: ${inst.instanceError ?? "Unknown error"}`,
            );
          }
        }
      }

      updateProgress({
        examId: setupData.examId,
        examStatus: setupData.examStatus,
        paperTypes: progressPTs,
        totalPapers,
        currentStep: "Setup complete. Starting uploads...",
        errorList,
      });

      // Step 5: upload each paper sequentially
      for (const pt of progressPTs) {
        for (let i = 0; i < pt.instances.length; i++) {
          const inst = pt.instances[i];

          if (!inst.instanceId || inst.instanceStatus === "failed") {
            updateProgress({
              currentStep: `Skipping "${inst.paperTitle}" (${pt.name}) — instance creation failed`,
            });
            continue;
          }

          // Mark as uploading
          inst.uploadStatus = "uploading";
          updateProgress({
            currentStep: `[${getUploadedCount(progressPTs) + 1}/${totalPapers}] Uploading: ${inst.paperTitle.slice(0, 60)}...`,
          });

          try {
            const uploadResp = await fetch("/api/examprep", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "upload-paper",
                paperId: inst.paperId,
                authToken,
                paperInstanceId: inst.instanceId,
                paperTitle: inst.paperTitle,
              }),
            });

            const uploadData = (await uploadResp.json()) as {
              success: boolean;
              paperTitle?: string;
              questionCount?: number;
              imported?: number;
              errors?: string[];
              message?: string;
            };

            if (uploadData.success) {
              inst.uploadStatus = "success";
              inst.questionCount = uploadData.questionCount;
              inst.imported = uploadData.imported;
              updateProgress({ uploadedCount: getUploadedCount(progressPTs) });
            } else {
              inst.uploadStatus = "failed";
              inst.uploadError = uploadData.message ?? "Upload failed";
              errorList.push(
                `Upload failed: "${inst.paperTitle}" → Paper type "${pt.name}" — ${inst.uploadError}`,
              );
              updateProgress({
                failedCount: getFailedCount(progressPTs),
                errorList: [...errorList],
              });
            }
          } catch (err) {
            inst.uploadStatus = "failed";
            inst.uploadError =
              err instanceof Error ? err.message : "Network error";
            errorList.push(
              `Upload failed: "${inst.paperTitle}" → Paper type "${pt.name}" — ${inst.uploadError}`,
            );
            updateProgress({
              failedCount: getFailedCount(progressPTs),
              errorList: [...errorList],
            });
          }

          updateProgress({ paperTypes: [...progressPTs] });

          if (i < pt.instances.length - 1) {
            await new Promise<void>((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      // Done
      const finalUploaded = getUploadedCount(progressPTs);
      const finalFailed = getFailedCount(progressPTs);

      updateProgress({
        completed: true,
        currentStep: `Done: ${finalUploaded} uploaded, ${finalFailed} failed`,
        uploadedCount: finalUploaded,
        failedCount: finalFailed,
        errorList: [...errorList],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      updateProgress({
        completed: true,
        currentStep: `Failed: ${msg}`,
        examStatus: "failed",
        examError: msg,
      });
    } finally {
      setUploading(false);
    }
  };

  function updateProgress(partial: Partial<UploadProgressState>) {
    setUploadProgress((prev) => {
      if (!prev) return prev;
      return { ...prev, ...partial };
    });
  }

  function getUploadedCount(paperTypes: PaperTypeProgress[]): number {
    return paperTypes.reduce(
      (sum, pt) =>
        sum +
        pt.instances.filter((i) => i.uploadStatus === "success").length,
      0,
    );
  }

  function getFailedCount(paperTypes: PaperTypeProgress[]): number {
    return paperTypes.reduce(
      (sum, pt) =>
        sum +
        pt.instances.filter(
          (i) =>
            i.uploadStatus === "failed" || i.instanceStatus === "failed" || (i.instanceId === null && i.instanceStatus !== "pending"),
        ).length,
      0,
    );
  }

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
              {loadingStates && <span className={styles.loading}>Checking availability…</span>}
              {selectedRoleId && paperTotalOverall > 0 && (
                <div className={styles.bulkDownloadWrap}>
                  <button
                    type="button"
                    className={styles.bulkDownloadButton}
                    onClick={() => void handleBulkDownload()}
                    disabled={bulkDownloading || uploading}
                  >
                    {bulkDownloading
                      ? bulkStatus || "Working…"
                      : statesLoaded
                        ? `Attempt & Download All (${accessibleCount} accessible)`
                        : `Attempt & Download All (${selectedYear === "all" ? paperTotalOverall : paperTotal})`}
                  </button>
                  {!bulkDownloading && bulkStatus && (
                    <span className={styles.bulkStatusMsg}>{bulkStatus}</span>
                  )}
                  <button
                    type="button"
                    className={styles.uploadButton}
                    onClick={() => void handleAttemptAndUpload()}
                    disabled={uploading || bulkDownloading || !authToken}
                    title={!authToken ? "Set your Auth Token first" : "Extract papers and upload to ExamPrep platform"}
                  >
                    {uploading
                      ? uploadProgress?.currentStep || "Uploading…"
                      : statesLoaded
                        ? `Attempt & Upload (${accessibleCount} accessible)`
                        : `Attempt & Upload (${selectedYear === "all" ? paperTotalOverall : paperTotal})`}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Upload Progress Panel ── */}
          {showUploadPanel && uploadProgress && (
            <div className={styles.uploadPanel}>
              <div className={styles.uploadPanelHeader}>
                <h3>
                  Upload Progress: {uploadProgress.examName}
                  {uploadProgress.completed && (
                    <span className={uploadProgress.examStatus === "failed" ? styles.badgeFailed : styles.badgeSuccess}>
                      {uploadProgress.examStatus === "failed" ? "FAILED" : "DONE"}
                    </span>
                  )}
                  {!uploadProgress.completed && (
                    <span className={styles.badgePending}>IN PROGRESS</span>
                  )}
                </h3>
                <button
                  type="button"
                  className={styles.uploadPanelClose}
                  onClick={() => setShowUploadPanel(false)}
                >
                  ✕
                </button>
              </div>

              {/* Exam status */}
              <div className={styles.uploadStatusRow}>
                <span>Exam &quot;{uploadProgress.examName}&quot;</span>
                <span
                  className={
                    uploadProgress.examStatus === "created" || uploadProgress.examStatus === "exists"
                      ? styles.badgeSuccess
                      : uploadProgress.examStatus === "failed"
                        ? styles.badgeFailed
                        : styles.badgePending
                  }
                >
                  {uploadProgress.examStatus}
                </span>
              </div>

              {/* Paper types & instances */}
              {uploadProgress.paperTypes.map((pt) => {
                const uploadedInPt = pt.instances.filter(
                  (i) => i.uploadStatus === "success",
                ).length;
                return (
                <div key={pt.name} className={styles.uploadPaperType}>
                  <div className={styles.uploadPTHeader}>
                    <strong>{pt.name}</strong>
                    <span
                      className={
                        pt.status === "created" || pt.status === "exists"
                          ? styles.badgeSuccess
                          : pt.status === "failed"
                            ? styles.badgeFailed
                            : styles.badgePending
                      }
                    >
                      {pt.status}
                    </span>
                    <span className={styles.uploadPTCount}>
                      {uploadedInPt}/{pt.instances.length} uploaded
                    </span>
                  </div>
                  {pt.error && (
                    <div className={styles.uploadPTError}>{pt.error}</div>
                  )}
                  <div className={styles.uploadInstances}>
                    {pt.instances.map((inst) => (
                      <div
                        key={inst.paperId}
                        className={`${styles.uploadInstance} ${
                          inst.uploadStatus === "uploading"
                            ? styles.uploadInstanceActive
                            : ""
                        }`}
                      >
                        <span className={styles.uploadInstanceName}>
                          {inst.paperTitle.slice(0, 55)}
                          {inst.paperTitle.length > 55 ? "…" : ""}
                        </span>
                        <span className={styles.uploadInstanceYear}>
                          {inst.year}
                        </span>
                        {inst.instanceStatus === "failed" ? (
                          <span className={styles.badgeFailedSmall}>instance failed</span>
                        ) : (
                          <span
                            className={
                              inst.uploadStatus === "success"
                                ? styles.badgeSuccess
                                : inst.uploadStatus === "failed"
                                  ? styles.badgeFailed
                                  : inst.uploadStatus === "uploading"
                                    ? styles.badgePending
                                    : styles.badgePending
                            }
                          >
                            {inst.uploadStatus}
                          </span>
                        )}
                        {inst.questionCount != null && inst.uploadStatus === "success" && (
                          <span className={styles.uploadInstanceQCount}>
                            {inst.imported ?? inst.questionCount} q
                          </span>
                        )}
                        {inst.uploadError && (
                          <span className={styles.uploadInstanceError}>
                            {inst.uploadError}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                );
              })}

              {/* Current step */}
              <div className={styles.uploadCurrentStep}>
                {uploadProgress.currentStep}
              </div>

              {/* Error summary */}
              {uploadProgress.completed && uploadProgress.errorList.length > 0 && (
                <div className={styles.uploadErrorSummary}>
                  <h4>
                    ⚠ {uploadProgress.errorList.length} error
                    {uploadProgress.errorList.length !== 1 ? "s" : ""} occurred
                  </h4>
                  <ul>
                    {uploadProgress.errorList.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                  <p className={styles.uploadErrorHint}>
                    Download the failed papers individually using the
                    &quot;Download&quot; button above and upload them manually at{" "}
                    <code>examprep-web-mu.vercel.app/admin/questions/upload</code>
                  </p>
                </div>
              )}
            </div>
          )}

          {statesLoaded && papers.length > 0 && (
            <div className={styles.availabilityFilterRow}>
              <label className={styles.availabilityToggle}>
                <input
                  type="checkbox"
                  checked={showOnlyAvailable}
                  onChange={(e) => setShowOnlyAvailable(e.target.checked)}
                />
                Show available papers only
                {statesLoaded && (
                  <span className={styles.availabilityCount}>
                    ({accessibleCount} of {papers.length} accessible on this page)
                  </span>
                )}
              </label>
            </div>
          )}

          {!loadingPapers && displayedPapers.length === 0 && (
            <p className={styles.empty}>
              {showOnlyAvailable && papers.length > 0
                ? "No accessible papers on this page. Try turning off the filter or switching year."
                : "No papers found for selected role."}
            </p>
          )}

          {displayedPapers.map((paper) => {
            const state = paperStates[paper.id];
            const isLocked = state !== undefined && !state.accessible;
            const isAvailable = state?.accessible === true;
            return (
              <article key={paper.id} className={`${styles.paperCard} ${isLocked ? styles.paperCardLocked : ""}`}>
                <div className={styles.paperInfo}>
                  <div className={styles.paperTitleRow}>
                    <h3>{paper.title}</h3>
                    {isLocked && <span className={styles.badgeLocked}>Locked</span>}
                    {isAvailable && state.attemptsCompleted > 0 && (
                      <span className={styles.badgeDone}>Attempted</span>
                    )}
                    {isAvailable && state.attemptsCompleted === 0 && (
                      <span className={styles.badgeAvailable}>Available</span>
                    )}
                  </div>
                  <p>
                    Year: {paper.year || "-"} | Date/Time: {formatDate(paper.examDate)} | Duration: {paper.durationMinutes} min
                  </p>
                </div>
                <button
                  className={styles.downloadButton}
                  onClick={() => void handleDownload(paper)}
                  disabled={downloadingPaperId === paper.id || isLocked}
                  title={isLocked ? "This paper is not accessible with your current account" : ""}
                >
                  {downloadingPaperId === paper.id ? "Preparing…" : isLocked ? "Locked" : "Download"}
                </button>
              </article>
            );
          })}

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
