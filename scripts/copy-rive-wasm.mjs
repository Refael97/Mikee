// The Rive runtime is served from our own origin (the CSP allows no external scripts), so its WASM is
// copied from the installed package on every install: it always matches the runtime's version.
import { copyFileSync, existsSync, mkdirSync } from "fs";

const from = "node_modules/@rive-app/canvas/rive.wasm";
if (existsSync(from)) {
  mkdirSync("public/rive", { recursive: true });
  copyFileSync(from, "public/rive/rive.wasm");
}
