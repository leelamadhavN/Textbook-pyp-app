const API1_URL =
  "https://api.testbook.com/api/v1/target-family-details?pageType=pyp&type=%5Bapp%5D%20Get%20Pyp%20Target%20SuperGroup&__projection=%7B%22superGroup%22:%7B%22_id%22:1,%22properties%22:1,%22targetsCount%22:1%7D%7D&language=English";

async function run() {
  const res = await fetch(API1_URL);
  const data = await res.json();
  const upsc = data.data.superGroup.find(g => g.properties.title.includes('UPSC'));
  
  const rolesUrl = `https://api.testbook.com/api/v1/previous-year-papers/${encodeURIComponent(upsc._id)}/targets?pageType=pyp&__projection=%7B%22targets%22:1%7D&language=English`;
  const rolesRes = await fetch(rolesUrl);
  const rolesData = await rolesRes.json();
  const civil = rolesData.data.targets.find(r => r.properties.title.includes('Civil Services') || r.properties.title.includes('Civil'));
  
  const papersUrl = `https://api.testbook.com/api/v1/previous-year-papers/target/${encodeURIComponent(civil._id)}?id=${encodeURIComponent(civil._id)}&skip=0&limit=50&year=2021&stage=&type=[Target+Page]+getPypTargetTests&language=English`;
  const papersRes = await fetch(papersUrl);
  const papersData = await papersRes.json();
  console.log(JSON.stringify(papersData.data.yearWiseTests, null, 2));
}

run().catch(console.error);
