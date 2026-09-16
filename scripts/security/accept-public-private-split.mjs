import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyTrackedPaths,
  trackedPathsFromGit,
} from "./classify-repository.mjs";
import { scanDistributionArtifacts } from "./check-distribution-artifact.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const PUBLIC_PACKAGE_NAMES = new Set([
  "@xauusd/copy-protocol",
  "@xauusd/license-service",
  "@xauusd/installation-proof",
]);
const PUBLIC_PACKAGE_DIRS = [
  "copy-protocol",
  "license-service",
  "installation-proof",
];

const REQUIRED_GREEN = Object.freeze({
  PUBLIC_BUILD: "PASS",
  PRIVATE_SOURCE_PRESENT: "FALSE",
  PRIVATE_IMPORT_PRESENT: "FALSE",
  PUBLIC_CI_NEEDS_PRIVATE_REPO: "FALSE",
  DISTRIBUTION_ARTIFACT_PRIVATE_REF: "FALSE",
  P3_CANONICAL: "INSTALLATION_PROOF",
  P3_DUPLICATE_IMPLEMENTATION: "FALSE",
});

export function evaluatePublicAcceptance({
  buildPassed,
  privateSourcePaths,
  privateImports,
  ciPrivateRepoReferences,
  distributionArtifactPrivateRef,
  p3Canonical,
  p3DuplicateImplementation,
}) {
  return {
    PUBLIC_BUILD: buildPassed ? "PASS" : "FAIL",
    PRIVATE_SOURCE_PRESENT: privateSourcePaths.length === 0 ? "FALSE" : "TRUE",
    PRIVATE_IMPORT_PRESENT: privateImports.length === 0 ? "FALSE" : "TRUE",
    PUBLIC_CI_NEEDS_PRIVATE_REPO:
      ciPrivateRepoReferences.length === 0 ? "FALSE" : "TRUE",
    DISTRIBUTION_ARTIFACT_PRIVATE_REF: distributionArtifactPrivateRef
      ? "TRUE"
      : "FALSE",
    P3_CANONICAL: p3Canonical ? "INSTALLATION_PROOF" : "INVALID",
    P3_DUPLICATE_IMPLEMENTATION: p3DuplicateImplementation ? "TRUE" : "FALSE",
  };
}

export function assertPublicAcceptance(verdicts) {
  for (const [key, expected] of Object.entries(REQUIRED_GREEN)) {
    if (verdicts[key] !== expected) {
      throw new Error(`M7_PUBLIC_ACCEPTANCE_FAILED:${key}=${verdicts[key]}`);
    }
  }
}

function readTrackedText(root, trackedPath) {
  return readFileSync(path.join(root, trackedPath), "utf8");
}

function findPrivateImports(root, trackedPaths) {
  const candidates = trackedPaths.filter(
    (trackedPath) =>
      /^packages\/[^/]+\/(?:src\/.*|package\.json)$/.test(trackedPath) ||
      trackedPath === "package.json",
  );
  const findings = [];

  for (const trackedPath of candidates) {
    const text = readTrackedText(root, trackedPath);
    for (const match of text.matchAll(/@xauusd\/[A-Za-z0-9._-]+/g)) {
      if (!PUBLIC_PACKAGE_NAMES.has(match[0])) {
        findings.push(`${trackedPath}:${match[0]}`);
      }
    }
  }

  return findings;
}

function findCiPrivateRepoReferences(root, trackedPaths) {
  const workflowPaths = trackedPaths.filter((trackedPath) =>
    /^\.github\/workflows\/.*\.ya?ml$/i.test(trackedPath),
  );
  const findings = [];

  for (const trackedPath of workflowPaths) {
    const text = readTrackedText(root, trackedPath);
    if (/xauusd-ai-master-core/i.test(text)) {
      findings.push(trackedPath);
    }
  }

  return findings;
}

function hasBuiltPublicArtifacts(root) {
  return PUBLIC_PACKAGE_DIRS.every((packageDir) =>
    existsSync(path.join(root, "packages", packageDir, "dist")),
  );
}

function hasCanonicalP3(root, trackedPaths) {
  if (!trackedPaths.some((trackedPath) => trackedPath.startsWith("packages/installation-proof/"))) {
    return false;
  }

  try {
    const manifest = JSON.parse(
      readFileSync(path.join(root, "packages/installation-proof/package.json"), "utf8"),
    );
    return manifest.name === "@xauusd/installation-proof";
  } catch {
    return false;
  }
}

export async function acceptPublicPrivateSplit(root = REPO_ROOT) {
  const trackedPaths = trackedPathsFromGit();
  const classifications = classifyTrackedPaths(trackedPaths);
  const privateImports = findPrivateImports(root, trackedPaths);
  const ciPrivateRepoReferences = findCiPrivateRepoReferences(root, trackedPaths);
  const p3DuplicateImplementation = trackedPaths.some((trackedPath) =>
    trackedPath.startsWith("packages/installation-identity/"),
  );

  let distributionArtifactPrivateRef = false;
  let artifactScanPassed = false;
  try {
    await scanDistributionArtifacts(root);
    artifactScanPassed = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("FORBIDDEN_PRIVATE_REFERENCE") ||
      message.includes("FORBIDDEN_PRIVATE_PATH")
    ) {
      distributionArtifactPrivateRef = true;
    }
  }

  const verdicts = evaluatePublicAcceptance({
    buildPassed: hasBuiltPublicArtifacts(root) && artifactScanPassed,
    privateSourcePaths: classifications.PRIVATE_REQUIRED,
    privateImports,
    ciPrivateRepoReferences,
    distributionArtifactPrivateRef,
    p3Canonical: hasCanonicalP3(root, trackedPaths),
    p3DuplicateImplementation,
  });

  assertPublicAcceptance(verdicts);
  return verdicts;
}

function printVerdicts(verdicts) {
  for (const key of Object.keys(REQUIRED_GREEN)) {
    console.log(`${key}=${verdicts[key]}`);
  }
  console.log("M7_PUBLIC_ACCEPTANCE=PASS");
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    printVerdicts(await acceptPublicPrivateSplit());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
