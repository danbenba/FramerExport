export async function pool(tasks, n) {
  let i = 0;
  const run = async () => {
    while (i < tasks.length) {
      const j = i++;
      await tasks[j]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, () => run()));
}
