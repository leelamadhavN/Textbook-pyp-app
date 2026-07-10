// End-to-end test for the SSC CGL setup-batch flow
// Simulates exactly what the frontend does

const BASE = "http://127.0.0.1:3000";

async function main() {
  console.log("Step 1: Fetching super groups...");
  const sgResp = await fetch(`${BASE}/api/super-groups`);
  if (!sgResp.ok) { console.error("Failed to fetch super groups:", sgResp.status); return; }
  const sgData = await sgResp.json();
  console.log("Super groups:", sgData.items?.length, "groups");

  const sscGroup = sgData.items?.find(g => g.title?.toLowerCase().includes("ssc"));
  if (!sscGroup) { console.log("No SSC group found. Available:", sgData.items?.map(g => g.title)); return; }
  console.log("SSC group:", sscGroup.id, sscGroup.title);

  console.log("\nStep 2: Fetching roles...");
  const rolesResp = await fetch(`${BASE}/api/roles?categoryId=${sscGroup.id}`);
  const rolesData = await rolesResp.json();
  console.log("Roles:", rolesData.items?.length, "roles");

  const cglRole = rolesData.items?.find(r => r.title?.toLowerCase().includes("cgl"));
  if (!cglRole) { console.log("No CGL role found. Available:", rolesData.items?.map(r => r.title)); return; }
  console.log("SSC CGL role:", cglRole.id, cglRole.title);

  console.log("\nStep 3: Fetching all papers...");
  const papersResp = await fetch(`${BASE}/api/all-papers?examId=${cglRole.id}&year=all`);
  const papersData = await papersResp.json();
  console.log("Papers:", papersData.papers?.length, "total");

  if (!papersData.papers?.length) { console.log("No papers found"); return; }

  // Deduplicate by ID
  const seenIds = new Set();
  const allPapers = papersData.papers.filter(p => {
    if (!p.id || seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });
  console.log("After ID dedup:", allPapers.length, "papers");

  // Deduplicate by title
  const seenTitles = new Set();
  const toUpload = allPapers.filter(p => {
    const key = p.title.trim().toLowerCase();
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
  console.log("After title dedup:", toUpload.length, "papers");

  // Detect paper types (copy logic from examprep-api.ts)
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
    const stageMatch = t.match(/stage\s*[-\s]?\s*([1-4])\b/i);
    if (stageMatch) {
      return { stage: "single", name: `Stage-${romanLabels[parseInt(stageMatch[1])]}` };
    }
    return { stage: "single", name: "Single" };
  }

  const groupMap = new Map();
  for (const paper of toUpload) {
    const pt = detectPaperType(paper.title);
    const key = pt.name;
    if (!groupMap.has(key)) {
      groupMap.set(key, { stage: pt.stage, name: pt.name, papers: [] });
    }
    groupMap.get(key).papers.push(paper);
  }

  const paperTypeGroups = Array.from(groupMap.values()).map(g => ({
    stage: g.stage,
    name: g.name,
    papers: g.papers.map(p => ({
      id: p.id,
      year: p.year,
      examDate: p.examDate ?? "",
      durationMinutes: p.durationMinutes ?? 0,
      displayName: p.title,
    })),
  }));

  console.log("\nPaper type groups:");
  for (const ptg of paperTypeGroups) {
    console.log(`  ${ptg.name} (${ptg.stage}): ${ptg.papers.length} papers`);
    // Show first few paper titles
    for (const p of ptg.papers.slice(0, 3)) {
      console.log(`    - ${p.displayName} (year=${p.year})`);
    }
    if (ptg.papers.length > 3) console.log(`    ... and ${ptg.papers.length - 3} more`);
  }

  const requestBody = {
    action: "setup-batch",
    examName: cglRole.title,
    superGroupName: sscGroup.title,
    paperTypeGroups,
  };

  const bodySize = JSON.stringify(requestBody).length;
  console.log(`\nRequest body size: ${bodySize} bytes (${(bodySize/1024).toFixed(1)} KB)`);

  console.log("\nStep 4: Calling setup-batch...");
  const startTime = Date.now();
  try {
    const setupResp = await fetch(`${BASE}/api/examprep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nSetup response received after ${elapsed}s`);
    console.log("Status:", setupResp.status);
    console.log("OK:", setupResp.ok);

    const contentType = setupResp.headers.get("content-type");
    console.log("Content-Type:", contentType);

    if (contentType?.includes("application/json")) {
      const data = await setupResp.json();
      console.log("\nResponse success:", data.success);
      if (data.message) console.log("Message:", data.message);
      if (data.examId) console.log("Exam ID:", data.examId, `(${data.examStatus})`);
      if (data.paperTypes) {
        console.log("\nPaper types in response:", data.paperTypes.length);
        for (const pt of data.paperTypes) {
          const created = pt.instances?.filter(i => i.status === "created").length || 0;
          const existing = pt.instances?.filter(i => i.status === "exists").length || 0;
          const failed = pt.instances?.filter(i => i.status === "failed").length || 0;
          console.log(`  ${pt.name}: ptStatus=${pt.status}, instances=${pt.instances?.length} (created=${created}, exists=${existing}, failed=${failed})`);
          if (pt.error) console.log(`    PT Error: ${pt.error}`);
          const failedInstances = pt.instances?.filter(i => i.status === "failed") || [];
          for (const fi of failedInstances.slice(0, 5)) {
            console.log(`    FAILED: ${fi.paperTitle} — ${fi.error}`);
          }
          if (failedInstances.length > 5) console.log(`    ... and ${failedInstances.length - 5} more failures`);
        }
      }
    } else {
      const text = await setupResp.text();
      console.log("Non-JSON response (first 500 chars):", text.slice(0, 500));
    }
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`Fetch error after ${elapsed}s:`, err.message);
  }

  console.log("\nDone!");
}

main().catch(err => console.error("Fatal:", err.message));
