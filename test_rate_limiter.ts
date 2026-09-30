import { getQuestionPaperRaw } from './src/lib/testbook-api';

async function run() {
  const authCode = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3Rlc3Rib29rLmNvbSIsInN1YiI6IjY5YzU4YzUyNDJjZGFjNzQzMWJiYjg2OSIsImF1ZCI6IlRCIiwiZXhwIjoiMjAyNi0wOS0zMFQxMjoyMTo1MC44NjYwNTMzNzVaIiwiaWF0IjoiMjAyNi0wOS0yOVQxMjoyMTo1MC44NjYwNTMzNzVaIiwibmFtZSI6InNhZ2FyIiwiZW1haWwiOiJzYWdhci5idXRsYTJAZ21haWwuY29tIiwib3JnSWQiOiIiLCJob21lU3RhdGVJZCI6IjVmOTE2M2E0MmVjODI3YjIxOGRhY2QyZSIsImlzUGFpZFVzZXIiOnRydWUsImlzTE1TVXNlciI6ZmFsc2UsInJvbGVzIjoic3R1ZGVudCIsImp0aSI6ImVkZWQ4ZTZmOGI3OTFiYmZhMzhkZTVlMDA5YzZjNmRiIiwiY2xpZW50Ijoid2ViLDEuNCJ9.fL9H-9mDkQxbV8WA7h4wGkAypBKarP_dxGoURsnxS3Rd1DP6JfDN_8pRY-KSFnqZyvKnyNRKjl4h-m6DNRxkx9vaxK6S0-70h_6f-OfIQOnSnJeGA2sFzRbZKE8RG8EFquoX96XQzN9bIsetopdiPfQQFNAAN12oU1oijNFYdaM";
  const paperId = "5e7b233a7635e1281e85a538"; // Example paperId (can be anything as we just want to see rate limiting)
  
  console.log("Starting multiple concurrent requests...");
  const promises = [];
  
  for (let i = 1; i <= 3; i++) {
    promises.push((async () => {
      const start = Date.now();
      console.log(`[Req ${i}] Queued at ${start}`);
      const res = await getQuestionPaperRaw(paperId, authCode);
      const end = Date.now();
      console.log(`[Req ${i}] Finished at ${end} (took ${end - start}ms) - Status: ${res.status}`);
    })());
  }

  await Promise.all(promises);
  console.log("All requests completed.");
}

run();
