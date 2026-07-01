import { getSuperGroupsRaw, getRolesRaw, getPapersRaw } from './src/lib/testbook-api';

async function run() {
  const groupsRes = await getSuperGroupsRaw();
  const groups = groupsRes.body.data.superGroup;
  let upscGroupId = groups.find((g: any) => g.properties.title.includes('UPSC'))._id;
  
  const rolesRes = await getRolesRaw(upscGroupId);
  const roles = rolesRes.body.data.targets;
  let civilServicesRole = roles.find((r: any) => r.properties.title.includes('Civil Services') || r.properties.title.includes('UPSC CSE') || r.properties.title.includes('Civil'));
  
  const papersRes = await getPapersRaw(civilServicesRole._id, { start: 0, limit: 10, year: '2021' });
  const yearWise = papersRes.body.data.yearWiseTests;
  console.log(JSON.stringify(yearWise, null, 2));
}

run().catch(console.error);
