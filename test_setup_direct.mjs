// Direct test of the examprep setup-batch flow, bypassing the local Next.js server
// This simulates exactly what handleSetupBatch does

const EXAMPPREP_BASE_URL = "https://examprep-web-mu.vercel.app";
const EXAMPPREP_EMAIL = "sagar.butla@gmail.com";
const EXAMPPREP_PASSWORD = "12345678";

let authCookieHeader = "";

async function examprepFetch(path, body) {
  const headers = { "Content-Type": "application/json" };
  if (authCookieHeader) headers["Cookie"] = authCookieHeader;
  
  const url = `${EXAMPPREP_BASE_URL}${path}`;
  const action = body.action || "unknown";
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length > 0) {
      authCookieHeader = setCookie.map(c => c.split(";")[0]).join("; ");
    }
    
    const contentType = res.headers.get("Content-Type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => "");
      console.warn(`[examprepFetch] Non-JSON for ${action}: status=${res.status}, type="${contentType}"`);
      data = text ? { error: text.slice(0, 200) } : null;
    }
    
    if (!res.ok) {
      console.error(`[examprepFetch] HTTP ${res.status} for ${action}:`, JSON.stringify(data).slice(0, 200));
    }
    
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error(`[examprepFetch] Network error for ${action}:`, err.message);
    return { ok: false, status: 502, data: { error: err.message } };
  }
}

async function login() {
  const { ok } = await examprepFetch("/api/auth", {
    action: "login",
    email: EXAMPPREP_EMAIL,
    password: EXAMPPREP_PASSWORD,
  });
  return ok;
}

async function listExams() {
  const { ok, data } = await examprepFetch("/api/admin", { action: "list-exams" });
  if (!ok) throw new Error("Failed to list exams");
  return data?.exams?.map(e => ({ id: e.id, name: e.name, slug: e.slug })) ?? [];
}

async function createExam(name, category) {
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "create-exam",
    name,
    category,
    is_active: true,
    display_order: 0,
  });
  if (!ok) throw new Error(`Failed to create exam: ${JSON.stringify(data)}`);
  return data?.exam?.id;
}

async function listPaperTypes(examId) {
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "list-paper-types",
    exam_id: examId,
  });
  if (!ok) throw new Error("Failed to list paper types");
  return data?.paper_types?.map(pt => ({ id: pt.id, name: pt.name, stage: pt.stage })) ?? [];
}

async function createPaperType(examId, name, stage, durationMinutes = 180) {
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "create-paper-type",
    exam_id: examId,
    name,
    stage,
    duration_minutes: durationMinutes,
    total_marks: 100,
    total_questions: 100,
    negative_marking: 0,
    display_order: 0,
  });
  if (!ok) throw new Error(`Failed to create paper type: ${JSON.stringify(data)}`);
  return data?.paper_type?.id;
}

async function listPaperInstances(paperTypeId) {
  const { ok, data } = await examprepFetch("/api/admin", {
    action: "list-paper-instances",
    paper_type_id: paperTypeId,
  });
  if (!ok) throw new Error("Failed to list paper instances");
  return data?.paper_instances?.map(pi => ({
    id: pi.id,
    year: pi.year,
    session: pi.session ?? null,
    shift: pi.shift ?? null,
    display_name: pi.display_name,
  })) ?? [];
}

async function createPaperInstance(paperTypeId, year, displayName, session, shift) {
  const body = {
    action: "create-paper-instance",
    paper_type_id: paperTypeId,
    year,
    display_name: displayName,
  };
  if (session) body.session = session;
  if (shift) body.shift = shift;
  
  const { ok, data } = await examprepFetch("/api/admin", body);
  if (!ok) throw new Error(`Failed to create paper instance: ${JSON.stringify(data)}`);
  return data?.paper_instance?.id;
}

// Paper type detection (copied from examprep-api.ts)
function detectPaperType(title) {
  const t = title.toLowerCase().trim();
  const romanMap = { i: 1, ii: 2, iii: 3, iv: 4 };
  const romanLabels = ["", "I", "II", "III", "IV"];
  const tierMatch = t.match(/tier\s*[-\s]?\s*(?:([1-4])|(i|ii|iii|iv))\b/i);
  if (tierMatch) {
    const num = tierMatch[1] ? parseInt(tierMatch[1]) : romanMap[tierMatch[2].toLowerCase()] || 1;
    return { stage: `tier${num}`, name: `Tier-${romanLabels[num]}` };
  }
  if (t.match(/\bprelims\b|\bpreliminary\b|pre\s*\.?\s*exam\b/i)) {
    return { stage: "prelims", name: "Prelims" };
  }
  if (t.match(/\bmains\b|\bmain\s*exam\b/i)) {
    return { stage: "mains", name: "Mains" };
  }
  const paperMatch = t.match(/paper\s*[-\s]?\s*(?:([1-4])|(i|ii|iii|iv))\b/i);
  if (paperMatch) {
    const num = paperMatch[1] ? parseInt(paperMatch[1]) : romanMap[paperMatch[2].toLowerCase()] || 1;
    return { stage: "single", name: `Paper-${romanLabels[num]}` };
  }
  return { stage: "single", name: "Single" };
}

function formatPaperTypeName(examName, detectedName, hasMultipleTypes) {
  if (!hasMultipleTypes || detectedName === "Single") return examName;
  return `${examName} ${detectedName}`;
}

const SESSION_ORDINALS = {
  1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth",
  6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth",
  11: "Eleventh", 12: "Twelfth", 13: "Thirteenth", 14: "Fourteenth",
  15: "Fifteenth", 16: "Sixteenth", 17: "Seventeenth", 18: "Eighteenth",
  19: "Nineteenth", 20: "Twentieth",
};

function sessionOrdinal(n) {
  return SESSION_ORDINALS[n] ?? `${n}th`;
}

function formatDisplayName(year, examName, detectedName, hasMultipleTypes, shiftNumber) {
  const suffix = hasMultipleTypes && detectedName !== "Single" ? ` ${detectedName}` : "";
  return `${year} ${examName}${suffix} Shift ${shiftNumber}`;
}

function assignSessionsAndShifts(papers, examName, detectedName, hasMultipleTypes) {
  const byYear = new Map();
  for (const p of papers) {
    const list = byYear.get(p.year);
    if (list) list.push(p);
    else byYear.set(p.year, [p]);
  }

  const result = [];
  const sortedYears = [...byYear.keys()].sort((a, b) => a - b);

  for (const year of sortedYears) {
    const yearPapers = byYear.get(year);
    const byDate = new Map();
    const noDatePapers = [];

    for (const p of yearPapers) {
      if (p.examDate) {
        const dateKey = p.examDate.slice(0, 10);
        const list = byDate.get(dateKey);
        if (list) list.push(p);
        else byDate.set(dateKey, [p]);
      } else {
        noDatePapers.push(p);
      }
    }

    const sortedDates = [...byDate.keys()].sort();
    let sessionNum = 0;
    let shiftNum = 0;

    for (const dateKey of sortedDates) {
      const datePapers = byDate.get(dateKey);
      datePapers.sort((a, b) => a.displayName.localeCompare(b.displayName));

      for (let i = 0; i < datePapers.length; i += 2) {
        sessionNum++;
        const sess = sessionOrdinal(sessionNum);
        shiftNum++;

        result.push({
          paperId: datePapers[i].id,
          year,
          session: sess,
          shift: "Morning",
          shiftNumber: shiftNum,
          durationMinutes: datePapers[i].durationMinutes,
          displayName: formatDisplayName(year, examName, detectedName, hasMultipleTypes, shiftNum),
        });

        if (i + 1 < datePapers.length) {
          shiftNum++;
          result.push({
            paperId: datePapers[i + 1].id,
            year,
            session: sess,
            shift: "Afternoon",
            shiftNumber: shiftNum,
            durationMinutes: datePapers[i + 1].durationMinutes,
            displayName: formatDisplayName(year, examName, detectedName, hasMultipleTypes, shiftNum),
          });
        }
      }
    }

    if (noDatePapers.length > 0) {
      noDatePapers.sort((a, b) => a.displayName.localeCompare(b.displayName));
      for (let i = 0; i < noDatePapers.length; i += 2) {
        sessionNum++;
        const sess = sessionOrdinal(sessionNum);
        shiftNum++;

        result.push({
          paperId: noDatePapers[i].id,
          year,
          session: sess,
          shift: "Morning",
          shiftNumber: shiftNum,
          durationMinutes: noDatePapers[i].durationMinutes,
          displayName: formatDisplayName(year, examName, detectedName, hasMultipleTypes, shiftNum),
        });

        if (i + 1 < noDatePapers.length) {
          shiftNum++;
          result.push({
            paperId: noDatePapers[i + 1].id,
            year,
            session: sess,
            shift: "Afternoon",
            shiftNumber: shiftNum,
            durationMinutes: noDatePapers[i + 1].durationMinutes,
            displayName: formatDisplayName(year, examName, detectedName, hasMultipleTypes, shiftNum),
          });
        }
      }
    }
  }

  return result;
}

// Fetch SSC CGL papers from Testbook
async function fetchAllSSCCGLPapers() {
  const examId = "5e6189da5f66e94f14a21f58"; // SSC CGL on Testbook
  
  // Get year filters
  const initUrl = `https://api.testbook.com/api/v1/previous-year-papers/target/${examId}?id=${examId}&skip=0&limit=1&year=&stage=&type=%5BTarget+Page%5D+getPypTargetTests&language=English`;
  const initResp = await fetch(initUrl);
  const initData = await initResp.json();
  const yearFilters = initData?.data?.yearFilters ?? [];
  
  console.log(`Found ${yearFilters.length} years, total papers: ${yearFilters.reduce((s, y) => s + y.count, 0)}`);
  
  // Fetch papers for each year
  const allPapers = [];
  const seenIds = new Set();
  
  for (const yf of yearFilters) {
    const url = `https://api.testbook.com/api/v1/previous-year-papers/target/${examId}?id=${examId}&skip=0&limit=${Math.min(yf.count, 50)}&year=${yf.year}&stage=&type=%5BTarget+Page%5D+getPypTargetTests&language=English`;
    const resp = await fetch(url);
    const data = await resp.json();
    
    const yearWiseTests = data?.data?.yearWiseTests ?? [];
    for (const block of yearWiseTests) {
      for (const test of (block.tests ?? [])) {
        const title = test.title || "";
        // Skip non-PYP titles
        const blockedPhrases = ["last 12 months report", "report and index", "practice questions", "important government schemes", "government schemes", "current affairs", "editorial"];
        if (blockedPhrases.some(phrase => title.toLowerCase().includes(phrase))) continue;
        
        if (test.id && !seenIds.has(test.id)) {
          seenIds.add(test.id);
          allPapers.push({
            id: test.id,
            title,
            year: block.year,
            examDate: test.examDate || "",
            durationMinutes: Math.round(test.duration || 0),
          });
        }
      }
    }
  }
  
  return allPapers;
}

async function main() {
  console.log("=== SSC CGL Setup-Batch Direct Test ===\n");
  
  // Step 1: Fetch papers from Testbook
  console.log("Step 1: Fetching SSC CGL papers from Testbook...");
  const allPapers = await fetchAllSSCCGLPapers();
  console.log(`Fetched ${allPapers.length} papers total`);
  
  // Dedup by title
  const seenTitles = new Set();
  const toUpload = allPapers.filter(p => {
    const key = p.title.trim().toLowerCase();
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
  console.log(`After title dedup: ${toUpload.length} papers`);
  
  // Group by paper type
  const groupMap = new Map();
  for (const paper of toUpload) {
    const pt = detectPaperType(paper.title);
    if (!groupMap.has(pt.name)) {
      groupMap.set(pt.name, { stage: pt.stage, name: pt.name, papers: [] });
    }
    groupMap.get(pt.name).papers.push(paper);
  }
  
  const paperTypeGroups = Array.from(groupMap.values());
  console.log(`\nPaper type groups:`);
  for (const g of paperTypeGroups) {
    console.log(`  ${g.name} (${g.stage}): ${g.papers.length} papers`);
  }
  
  const examName = "SSC CGL";
  const superGroupName = "SSC Exams";
  const hasMultipleTypes = paperTypeGroups.length > 1;
  
  // Step 2: Login to examprep
  console.log("\nStep 2: Logging in to examprep...");
  const loggedIn = await login();
  console.log(`Login: ${loggedIn ? "OK" : "FAILED"}`);
  if (!loggedIn) return;
  
  // Step 3: Ensure exam
  console.log("\nStep 3: Ensuring exam exists...");
  let examId;
  try {
    const exams = await listExams();
    const existing = exams.find(e => e.name.toLowerCase() === examName.toLowerCase());
    if (existing) {
      examId = existing.id;
      console.log(`Exam exists: ${examId}`);
    } else {
      examId = await createExam(examName, "state_psc");
      console.log(`Exam created: ${examId}`);
    }
  } catch (err) {
    console.error("Exam setup failed:", err.message);
    return;
  }
  
  // Step 4: Process each paper type
  console.log("\nStep 4: Processing paper types...");
  let totalCreated = 0;
  let totalFailed = 0;
  let totalExisted = 0;
  
  for (const ptGroup of paperTypeGroups) {
    const formattedPtName = formatPaperTypeName(examName, ptGroup.name, hasMultipleTypes);
    console.log(`\n  Processing: "${formattedPtName}" (${ptGroup.papers.length} papers)`);
    
    let ptId;
    try {
      const existingPTs = await listPaperTypes(examId);
      const match = existingPTs.find(e => e.name.toLowerCase() === formattedPtName.toLowerCase());
      if (match) {
        ptId = match.id;
        console.log(`  Paper type exists: ${ptId}`);
      } else {
        const durs = ptGroup.papers.map(p => p.durationMinutes ?? 0).filter(d => d > 0);
        const duration = durs.length > 0 ? Math.max(...durs) : 180;
        ptId = await createPaperType(examId, formattedPtName, ptGroup.stage, duration);
        console.log(`  Paper type created: ${ptId}`);
      }
    } catch (err) {
      console.error(`  Paper type FAILED: ${err.message}`);
      continue;
    }
    
    // Assign sessions and shifts
    const paperInputs = ptGroup.papers.map(p => ({
      id: p.id,
      year: p.year,
      examDate: p.examDate ?? "",
      displayName: p.title,
      durationMinutes: p.durationMinutes ?? 0,
    }));
    
    const assigned = assignSessionsAndShifts(paperInputs, examName, ptGroup.name, hasMultipleTypes);
    console.log(`  Assigned ${assigned.length} papers to sessions/shifts`);
    
    // Check for duplicate session/shift combinations
    const sessionShiftKeys = new Map();
    for (const a of assigned) {
      const key = `${a.year}|${a.session}|${a.shift}`;
      if (sessionShiftKeys.has(key)) {
        console.warn(`  ⚠️ DUPLICATE session/shift: ${key} for "${a.displayName}" (already used by "${sessionShiftKeys.get(key)}")`);
      }
      sessionShiftKeys.set(key, a.displayName);
    }
    
    // Get existing instances
    let existingInstances = [];
    try {
      existingInstances = await listPaperInstances(ptId);
      console.log(`  Existing instances: ${existingInstances.length}`);
    } catch (err) {
      console.error(`  Failed to list instances: ${err.message}`);
    }
    
    // Create instances
    for (let i = 0; i < assigned.length; i++) {
      const a = assigned[i];
      const existing = existingInstances.find(
        inst => inst.year === a.year &&
          (inst.session ?? null) === a.session &&
          (inst.shift ?? null) === a.shift
      );
      
      if (existing) {
        totalExisted++;
        if (i < 3 || i === assigned.length - 1) {
          console.log(`  [${i+1}/${assigned.length}] EXISTS: "${a.displayName}"`);
        } else if (i === 3) {
          console.log(`  ... (skipping middle entries for brevity)`);
        }
      } else {
        try {
          const startTime = Date.now();
          const piId = await createPaperInstance(ptId, a.year, a.displayName, a.session, a.shift);
          const elapsed = Date.now() - startTime;
          totalCreated++;
          if (i < 5 || i === assigned.length - 1 || elapsed > 2000) {
            console.log(`  [${i+1}/${assigned.length}] CREATED: "${a.displayName}" (${elapsed}ms) → ${piId}`);
          } else if (i === 5) {
            console.log(`  ... (continuing silently for brevity)`);
          }
        } catch (err) {
          totalFailed++;
          console.error(`  [${i+1}/${assigned.length}] FAILED: "${a.displayName}" — ${err.message}`);
        }
      }
    }
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${totalCreated}`);
  console.log(`Existed: ${totalExisted}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Total: ${totalCreated + totalExisted + totalFailed}`);
}

main().catch(err => console.error("FATAL:", err.message, err.stack));
