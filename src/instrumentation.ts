export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.MIKEE_WORKER !== "off") {
    const { startWorker } = await import("./lib/worker");
    startWorker();
  }
}
