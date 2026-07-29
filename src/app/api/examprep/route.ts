import { NextRequest, NextResponse } from "next/server";
import { getQuestionPaperRaw, getQuestionAnswersRaw, getServerAuthCode, initTestAttempt, parseJwtInfo } from "@/lib/testbook-api";
import { mapExportRows, mapAnswerLookup } from "@/lib/testbook-mappers";
import {
  loginExamprep,
  listExams,
  createExam,
  listPaperTypes,
  createPaperType,
  listPaperInstances,
  createPaperInstance,
  createQuestion,
  mapSuperGroupToCategory,
  assignSessionsAndShifts,
  formatPaperTypeName,
  listSubjects,
  createSubject,
  listChapters,
  createChapter,
  listTopics,
  createTopic,
  type CsvQuestion,
  type PaperInput,
} from "@/lib/examprep-api";

// ─── Request types ───────────────────────────────────────────

interface SetupRequest {
  action: "setup" | "setup-batch";
  examName: string;
  superGroupName?: string;
  paperTypeGroups: Array<{
    stage: string;
    name: string;
    papers: Array<{ id: string; year: number; examDate?: string; durationMinutes?: number; displayName: string }>;
  }>;
}

interface EnsureExamRequest {
  action: "ensure-exam";
  examName: string;
  superGroupName?: string;
}

interface EnsurePaperTypeRequest {
  action: "ensure-paper-type";
  examId: string;
  name: string;
  stage: string;
}

interface EnsureInstanceRequest {
  action: "ensure-instance";
  paperTypeId: string;
  paperId: string;
  year: number;
  displayName: string;
}

interface UploadPaperRequest {
  action: "upload-paper";
  paperId: string;
  authToken: string;
  paperInstanceId: string;
  paperTitle: string;
  examId: string;
}

type ExamPrepRequest =
  | SetupRequest
  | EnsureExamRequest
  | EnsurePaperTypeRequest
  | EnsureInstanceRequest
  | UploadPaperRequest;

// ─── Helpers ────────────────────────────────────────────────

function getErrorMessage(details: unknown): string {
  if (!details || typeof details !== "object") return "Failed";
  const typed = details as Record<string, unknown>;
  return (typed.message as string) || (typed.error as string) || "Failed";
}

async function downloadPaperQuestions(
  paperId: string,
  authToken: string,
): Promise<CsvQuestion[]> {
  const authCode = getServerAuthCode(authToken || null);

  const jwtInfo = parseJwtInfo(authCode);
  if (jwtInfo.isExpired) {
    throw new Error("Auth token expired. Please refresh your Testbook auth_code.");
  }

  const result = await getQuestionPaperRaw(paperId, authCode);
  if (!result.success) {
    const errorMsg = getErrorMessage(result.body);
    if (errorMsg.includes("redis") || errorMsg.includes("Test in Redis") || errorMsg.includes("fetch question paper")) {
      console.warn(`[upload] Skipping paper ${paperId} due to Testbook backend error (likely subjective or missing): ${errorMsg}`);
      return [];
    }
    throw new Error(`Failed to download paper: ${errorMsg}`);
  }

  const payload = result.body as Record<string, unknown>;

  let answersResult = await getQuestionAnswersRaw(paperId, authCode);
  const answersData = answersResult.success
    ? ((answersResult.body as Record<string, unknown>)?.data as Record<string, unknown> | null)
    : null;
  const answersEmpty = !answersData || Object.keys(answersData).length === 0;

  if (answersEmpty) {
    await initTestAttempt(paperId, authCode);
    answersResult = await getQuestionAnswersRaw(paperId, authCode);
  }

  const answersLookup = answersResult.success
    ? mapAnswerLookup(answersResult.body as Record<string, unknown>)
    : {};

  const rows = mapExportRows(payload, answersLookup);

  return rows.map((row) => ({
    question_number: row.question_number,
    question_text: row.question_text,
    option_a: row.option_a || null,
    option_b: row.option_b || null,
    option_c: row.option_c || null,
    option_d: row.option_d || null,
    correct_option: row.correct_option || "",
    solution_text: row.solution_text || "",
    topic_subject: row.topic_subject || "",
    topic_category: row.topic_category || "",
    topic_type: row.topic_type || "",
    difficulty: row.difficulty || undefined,
    marks: typeof row.marks === "number" ? row.marks : undefined,
    negative_marks: typeof row.negative_marks === "number" ? row.negative_marks : undefined,
  }));
}

// ─── Response types ─────────────────────────────────────────

interface InstanceResult {
  paperId: string;
  paperTitle: string;
  year: number;
  session: string | null;
  shift: string | null;
  instanceId: string | null;
  status: "created" | "exists" | "failed";
  error?: string;
}

interface PaperTypeResult {
  name: string;
  stage: string;
  paperTypeId: string | null;
  status: "created" | "exists" | "failed";
  error?: string;
  instances: InstanceResult[];
}

// ─── Main handler ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: ExamPrepRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "setup":
      case "setup-batch":
        return await handleSetupBatch(body);
      case "ensure-exam":
        return await handleEnsureExam(body);
      case "ensure-paper-type":
        return await handleEnsurePaperType(body);
      case "ensure-instance":
        return await handleEnsureInstance(body);
      case "upload-paper":
        return await handleUploadPaper(body);
      default:
        return NextResponse.json(
          { success: false, message: `Unknown action: ${(body as Record<string, unknown>).action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error(`[examprep/POST] Unhandled error for action="${body.action}":`, err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

// ─── Individual ensure actions (for live progress) ──────────

async function handleEnsureExam(req: EnsureExamRequest) {
  await loginExamprep();
  const exams = await listExams();
  const existing = exams.find((e) => e.name.toLowerCase() === req.examName.toLowerCase());

  if (existing) {
    return NextResponse.json({ success: true, examId: existing.id, status: "exists" });
  }

  const category = req.superGroupName
    ? mapSuperGroupToCategory(req.superGroupName)
    : "other";
  const examId = await createExam(req.examName, category);
  return NextResponse.json({ success: true, examId, status: "created" });
}

async function handleEnsurePaperType(req: EnsurePaperTypeRequest) {
  await loginExamprep();
  const existing = await listPaperTypes(req.examId);
  const match = existing.find((pt) => pt.name.toLowerCase() === req.name.toLowerCase());

  if (match) {
    return NextResponse.json({ success: true, paperTypeId: match.id, status: "exists" });
  }

  const paperTypeId = await createPaperType(req.examId, req.name, req.stage);
  return NextResponse.json({ success: true, paperTypeId, status: "created" });
}

async function handleEnsureInstance(req: EnsureInstanceRequest) {
  await loginExamprep();
  const existing = await listPaperInstances(req.paperTypeId);
  const match = existing.find(
    (pi) => pi.display_name.toLowerCase() === req.displayName.toLowerCase(),
  );

  if (match) {
    return NextResponse.json({
      success: true,
      instanceId: match.id,
      paperId: req.paperId,
      paperTitle: req.displayName,
      year: req.year,
      status: "exists",
    });
  }

  const instanceId = await createPaperInstance(req.paperTypeId, req.year, req.displayName);
  return NextResponse.json({
    success: true,
    instanceId,
    paperId: req.paperId,
    paperTitle: req.displayName,
    year: req.year,
    status: "created",
  });
}

// ─── Batch setup ────────────────────────────────────────────

async function processWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array(limit).fill(0).map(async () => {
    while (i < items.length) {
      const index = i++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function handleSetupBatch(req: SetupRequest) {
  const { examName, superGroupName, paperTypeGroups } = req;

  console.log(`[setup-batch] Starting setup for exam="${examName}", superGroup="${superGroupName}", paperTypeGroups=${paperTypeGroups.length}`);
  for (const ptg of paperTypeGroups) {
    console.log(`[setup-batch]   Paper type group: name="${ptg.name}", stage="${ptg.stage}", papers=${ptg.papers.length}`);
  }

  console.log(`[setup-batch] Logging in to examprep...`);
  await loginExamprep();
  console.log(`[setup-batch] Login complete.`);

  const category = superGroupName
    ? mapSuperGroupToCategory(superGroupName)
    : "other";
  console.log(`[setup-batch] Mapped category: "${category}"`);

  // Step 1: ensure exam
  let examId: string;
  let examStatus: "created" | "exists";
  try {
    console.log(`[setup-batch] Listing existing exams...`);
    const exams = await listExams();
    console.log(`[setup-batch] Found ${exams.length} existing exams.`);
    const existing = exams.find((e) => e.name.toLowerCase() === examName.toLowerCase());
    if (existing) {
      examId = existing.id;
      examStatus = "exists";
      console.log(`[setup-batch] Exam already exists: id=${examId}`);
    } else {
      console.log(`[setup-batch] Creating new exam: name="${examName}", category="${category}"`);
      examId = await createExam(examName, category);
      examStatus = "created";
      console.log(`[setup-batch] Exam created: id=${examId}`);
    }
  } catch (err) {
    console.error(`[setup-batch] Exam creation failed:`, err);
    return NextResponse.json(
      {
        success: false,
        message: `Exam creation failed: ${err instanceof Error ? err.message : "Unknown"}`,
      },
      { status: 500 },
    );
  }

  const hasMultipleTypes = paperTypeGroups.length > 1;
  const paperTypes: PaperTypeResult[] = [];

  for (const ptGroup of paperTypeGroups) {
    const formattedPtName = formatPaperTypeName(examName, ptGroup.name, hasMultipleTypes);
    console.log(`[setup-batch] Processing paper type: "${formattedPtName}" (detected: "${ptGroup.name}", stage: "${ptGroup.stage}"), ${ptGroup.papers.length} papers`);
    let ptId: string | null = null;
    let ptStatus: "created" | "exists" | "failed" = "failed";
    let ptError: string | undefined;
    let createdDuration = 180;

    try {
      console.log(`[setup-batch]   Listing existing paper types for exam ${examId}...`);
      const existingPTs = await listPaperTypes(examId);
      console.log(`[setup-batch]   Found ${existingPTs.length} existing paper types: ${existingPTs.map(pt => pt.name).join(', ')}`);
      const match = existingPTs.find(
        (e) => e.name.toLowerCase() === formattedPtName.toLowerCase(),
      );
      if (match) {
        ptId = match.id;
        ptStatus = "exists";
        console.log(`[setup-batch]   Paper type exists: id=${ptId}`);
      } else {
        // Use max duration from papers in this group
        const durs = ptGroup.papers.map((p) => p.durationMinutes ?? 0).filter((d) => d > 0);
        createdDuration = durs.length > 0 ? Math.max(...durs) : 180;
        console.log(`[setup-batch]   Creating paper type: "${formattedPtName}", stage="${ptGroup.stage}", duration=${createdDuration}`);
        ptId = await createPaperType(examId, formattedPtName, ptGroup.stage, createdDuration);
        ptStatus = "created";
        console.log(`[setup-batch]   Paper type created: id=${ptId}`);
      }
    } catch (err) {
      ptError = err instanceof Error ? err.message : "Failed to create paper type";
      console.error(`[setup-batch]   Paper type creation failed:`, ptError);
    }

    const instances: InstanceResult[] = [];

    if (ptId) {
      const paperInputs: PaperInput[] = ptGroup.papers.map((p) => ({
        id: p.id,
        year: p.year,
        examDate: p.examDate ?? "",
        displayName: p.displayName,
        durationMinutes: p.durationMinutes ?? 0,
      }));

      console.log(`[setup-batch]   Assigning sessions/shifts for ${paperInputs.length} papers...`);
      const assigned = assignSessionsAndShifts(
        paperInputs,
        examName,
        ptGroup.name,
        hasMultipleTypes,
      );
      console.log(`[setup-batch]   ${assigned.length} papers assigned to sessions/shifts`);

      let existingInstances: Array<{
        id: string;
        year: number;
        session: string | null;
        shift: string | null;
        display_name: string;
      }> = [];
      try {
        console.log(`[setup-batch]   Listing existing instances for paper type ${ptId}...`);
        existingInstances = await listPaperInstances(ptId);
        console.log(`[setup-batch]   Found ${existingInstances.length} existing instances`);
      } catch (err) {
        console.error(`[setup-batch]   Failed to list existing instances:`, err);
        // continue
      }

      const instanceResults = await processWithConcurrency(assigned, 10, async (a, idx) => {
        const existing = existingInstances.find(
          (i) =>
            i.year === a.year &&
            (i.session ?? null) === a.session &&
            (i.shift ?? null) === a.shift,
        );

        if (existing) {
          console.log(`[setup-batch]   [${idx + 1}/${assigned.length}] Instance exists: "${a.displayName}" (year=${a.year}, session=${a.session}, shift=${a.shift}) → id=${existing.id}`);
          return {
            paperId: a.paperId,
            paperTitle: a.displayName,
            year: a.year,
            session: a.session,
            shift: a.shift,
            instanceId: existing.id,
            status: "exists" as const,
          };
        } else {
          try {
            console.log(`[setup-batch]   [${idx + 1}/${assigned.length}] Creating instance: "${a.displayName}" (year=${a.year}, session=${a.session}, shift=${a.shift})`);
            const piId = await createPaperInstance(
              ptId!,
              a.year,
              a.displayName,
              a.session,
              a.shift,
            );
            console.log(`[setup-batch]   [${idx + 1}/${assigned.length}] Instance created: id=${piId}`);
            return {
              paperId: a.paperId,
              paperTitle: a.displayName,
              year: a.year,
              session: a.session,
              shift: a.shift,
              instanceId: piId,
              status: "created" as const,
            };
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Failed to create instance";
            console.error(`[setup-batch]   [${idx + 1}/${assigned.length}] Instance creation FAILED: "${a.displayName}" — ${errMsg}`);
            return {
              paperId: a.paperId,
              paperTitle: a.displayName,
              year: a.year,
              session: a.session,
              shift: a.shift,
              instanceId: null,
              status: "failed" as const,
              error: errMsg,
            };
          }
        }
      });
      
      instances.push(...instanceResults);
    }

    const createdCount = instances.filter(i => i.status === 'created').length;
    const existsCount = instances.filter(i => i.status === 'exists').length;
    const failedCount = instances.filter(i => i.status === 'failed').length;
    console.log(`[setup-batch]   Paper type "${formattedPtName}" summary: ${createdCount} created, ${existsCount} existing, ${failedCount} failed`);

    paperTypes.push({
      name: formattedPtName,
      stage: ptGroup.stage,
      paperTypeId: ptId,
      status: ptStatus,
      error: ptError,
      instances,
    });
  }

  const totalInstances = paperTypes.reduce((s, pt) => s + pt.instances.length, 0);
  const totalFailed = paperTypes.reduce((s, pt) => s + pt.instances.filter(i => i.status === 'failed').length, 0);
  console.log(`[setup-batch] Setup complete: exam=${examId}, paperTypes=${paperTypes.length}, totalInstances=${totalInstances}, totalFailed=${totalFailed}`);

  return NextResponse.json({
    success: true,
    examId,
    examStatus,
    examName,
    paperTypes,
  });
}

// ─── Upload paper ───────────────────────────────────────────

async function handleUploadPaper(req: UploadPaperRequest) {
  const { paperId, authToken, paperInstanceId, paperTitle, examId } = req;

  console.log(`[upload] Received upload-paper: paperId=${paperId}, paperInstanceId=${paperInstanceId}, examId=${examId}, title="${paperTitle}"`);

  if (!paperId || !authToken || !paperInstanceId) {
    return NextResponse.json(
      { success: false, message: "paperId, authToken, and paperInstanceId are required" },
      { status: 400 },
    );
  }

  let questions: CsvQuestion[];
  try {
    questions = await downloadPaperQuestions(paperId, authToken);
  } catch (err) {
    return NextResponse.json({
      success: false,
      paperTitle,
      message: `Download failed: ${err instanceof Error ? err.message : "Unknown"}`,
    });
  }

  if (questions.length === 0) {
    return NextResponse.json({
      success: true,
      paperTitle,
      questionCount: 0,
      imported: 0,
      errors: [],
      message: "Skipped (no objective questions found - likely subjective paper)",
    });
  }

  try {
    await loginExamprep();

    if (examId) {
      console.log(`[upload] Resolving subjects/chapters/topics for examId=${examId}, paper="${paperTitle}"`);
      // ── Resolve subjects, chapters, and topics ──────────────
      const subjectCache = new Map<string, string>(); // name → id
      const chapterCache = new Map<string, string>(); // "subjectId::chapterName" → id
      const topicCache = new Map<string, string>();   // "chapterId::topicName" → id

      // Fetch existing subjects for this exam once
      let existingSubjects = await listSubjects(examId);
      for (const s of existingSubjects) {
        subjectCache.set(s.name.toLowerCase(), s.id);
      }

      for (const q of questions) {
        const subjectName = q.topic_subject?.trim();
        const categoryName = q.topic_category?.trim();
        const typeName = q.topic_type?.trim();

        if (!subjectName) continue;

        // 1. Ensure subject exists
        let subjectId = subjectCache.get(subjectName.toLowerCase());
        if (!subjectId) {
          const newSubject = await createSubject(subjectName, examId);
          subjectId = newSubject.id;
          subjectCache.set(subjectName.toLowerCase(), subjectId);
        }
        q.subject_id = subjectId;

        if (!categoryName) continue;

        // 2. Ensure chapter exists under subject
        const chapterKey = `${subjectId}::${categoryName.toLowerCase()}`;
        let chapterId = chapterCache.get(chapterKey);
        if (!chapterId) {
          // Fetch chapters for this subject (cache on first access)
          if (!chapterCache.has(`__fetched__${subjectId}`)) {
            try {
              const existingChapters = await listChapters(subjectId);
              for (const c of existingChapters) {
                chapterCache.set(`${subjectId}::${c.name.toLowerCase()}`, c.id);
              }
            } catch {
              // list may fail for new subjects, that's ok
            }
            chapterCache.set(`__fetched__${subjectId}`, "1");
          }
          chapterId = chapterCache.get(chapterKey);
        }
        if (!chapterId) {
          try {
            const newChapter = await createChapter(categoryName, subjectId);
            chapterId = newChapter.id;
            chapterCache.set(chapterKey, chapterId);
            console.log(`[upload] Chapter created: name="${newChapter.name}", id="${chapterId}"`);
          } catch (chapterErr) {
            console.error(`[upload] createChapter FAILED: name="${categoryName}", subjectId="${subjectId}", error="${chapterErr instanceof Error ? chapterErr.message : chapterErr}"`);
            continue;
          }
        }

        // 3. Ensure topic exists under chapter (fallback: use category name if type is empty)
        const topicName = typeName || categoryName;
        const topicKey = `${chapterId}::${topicName.toLowerCase()}`;
        let topicId = topicCache.get(topicKey);
        if (!topicId) {
          if (!topicCache.has(`__fetched__${chapterId}`)) {
            try {
              const existingTopics = await listTopics(chapterId);
              for (const t of existingTopics) {
                topicCache.set(`${chapterId}::${t.name.toLowerCase()}`, t.id);
              }
            } catch {
              console.warn(`[upload] listTopics failed for chapterId=${chapterId}, will create fresh`);
            }
            topicCache.set(`__fetched__${chapterId}`, "1");
          }
          topicId = topicCache.get(topicKey);
        }
        if (!topicId) {
          console.log(`[upload] Creating topic: name="${topicName}", chapterId="${chapterId}" (typeName="${typeName}", categoryName="${categoryName}")`);
          try {
            const newTopic = await createTopic(topicName, chapterId);
            topicId = newTopic.id;
            topicCache.set(topicKey, topicId);
            console.log(`[upload] Topic created: id="${topicId}", name="${newTopic.name}"`);
          } catch (topicErr) {
            console.error(`[upload] createTopic FAILED: name="${topicName}", chapterId="${chapterId}", error="${topicErr instanceof Error ? topicErr.message : topicErr}"`);
            // Don't throw — skip this topic but continue importing
          }
        }
        if (topicId) {
          q.topic_id = topicId;
        }
      }
      console.log(`[upload] Resolution complete for "${paperTitle}": ${subjectCache.size} subjects, ${chapterCache.size - [...chapterCache.keys()].filter(k => k.startsWith('__fetched__')).length} chapters, ${topicCache.size - [...topicCache.keys()].filter(k => k.startsWith('__fetched__')).length} topics`);
    } else {
      console.log(`[upload] Skipping subject/topic resolution — no examId provided for "${paperTitle}"`);
    }

    // ── Import questions individually (create-question properly stores topic_id) ──
    let imported = 0;
    let withTopic = 0;
    const importErrors: string[] = [];
    await processWithConcurrency(questions, 10, async (q, idx) => {
      try {
        await createQuestion(q, paperInstanceId);
        imported++;
        if (q.topic_id) withTopic++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown";
        importErrors.push(`Q${q.question_number}: ${msg}`);
        console.error(`[upload] createQuestion failed for Q${q.question_number}: ${msg}`);
      }
    });

    console.log(`[upload] Paper "${paperTitle}": ${imported}/${questions.length} questions imported, ${withTopic} with topic_id`);
    if (imported > 0 && withTopic === 0) {
      console.warn(`[upload] ⚠ ZERO questions have topic_id set — resolution may have failed or examId is missing`);
    }

    return NextResponse.json({
      success: true,
      paperTitle,
      questionCount: questions.length,
      imported,
      errors: importErrors,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      paperTitle,
      questionCount: questions.length,
      message: `Upload failed: ${err instanceof Error ? err.message : "Unknown"}`,
    });
  }
}
