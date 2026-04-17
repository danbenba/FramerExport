export async function pool(tasks: Array<() => Promise<void>>, n: number): Promise<void> {
  let i = 0;
  const run = async (): Promise<void> => {
    while (i < tasks.length) {
      const j = i++;
      await tasks[j]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, () => run()));
}
