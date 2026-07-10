async function run() {
  const p = [];
  for (let i = 0; i < 20; i++) {
    p.push((async () => {
      const s = Date.now();
      await new Promise(r => setTimeout(r, 1000));
      return Date.now() - s;
    })());
  }
  const res = await Promise.all(p);
  console.log(res);
}
run();
