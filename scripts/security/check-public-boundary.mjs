import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyTrackedPaths,
  trackedPathsFromGit,
} from "./classify-repository.mjs";

export function evaluatePublicBoundary(paths) {
  const report = classifyTrackedPaths(paths);
  if (report.PRIVATE_REQUIRED.length > 0) {
    throw new Error(`PRIVATE_REQUIRED_PRESENT:${report.PRIVATE_REQUIRED[0]}`);
  }
  return report;
}

function main() {
  try {
    const report = evaluatePublicBoundary(trackedPathsFromGit());
    console.log(`SAFE_PUBLIC_COUNT=${report.SAFE_PUBLIC.length}`);
    console.log("PRIVATE_REQUIRED_COUNT=0");
    console.log("PUBLIC_BOUNDARY=PASS");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
