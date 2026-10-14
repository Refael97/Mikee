export async function register() {
  // The imports stay inside this check so the edge bundle never includes Node-only code.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrapOwner, missingSettings, resetPasswordFromEnv } = await import("./lib/setup");
    const missing = missingSettings();
    if (missing.length) console.error(`[setup] Missing or invalid settings: ${missing.join(", ")}`);
    await bootstrapOwner().catch((e) => console.error("[setup] could not create the owner:", (e as Error).message));
    await resetPasswordFromEnv().catch((e) => console.error("[setup] could not reset the password:", (e as Error).message));
    if (process.env.MIKEE_WORKER !== "off") {
      const { startWorker } = await import("./lib/worker");
      startWorker();
    }
  }
}
