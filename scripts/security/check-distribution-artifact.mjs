import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const PUBLIC_PACKAGES = [
  "copy-protocol",
  "license-service",
  "installation-proof",
];
const PUBLIC_PACKAGE_NAMES = new Set(
  PUBLIC_PACKAGES.map((name) => `@xauusd/${name}`),
);
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".cjs",
  ".mjs",
  ".json",
  ".map",
  ".ts",
  ".cts",
  ".mts",
]);

function fail(code, detail, label) {
  const suffix = [detail, label].filter(Boolean).join(":");
  throw new Error(suffix ? `${code}:${suffix}` : code);
}

export function inspectTextArtifact(text, label = "<memory>") {
  const content = String(text);
  const normalized = content.replaceAll("\\", "/");

  if (/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/.test(content)) {
    fail("FORBIDDEN_SECRET_MATERIAL", "PRIVATE_KEY", label);
  }
  if (/-----BEGIN OPENSSH PRIVATE KEY-----/.test(content)) {
    fail("FORBIDDEN_SECRET_MATERIAL", "OPENSSH_PRIVATE_KEY", label);
  }
  if (/\bgithub_pat_[A-Za-z0-9_]{20,}\b/.test(content) || /\bghp_[A-Za-z0-9]{20,}\b/.test(content)) {
    fail("FORBIDDEN_SECRET_MATERIAL", "GITHUB_TOKEN", label);
  }

  for (const match of content.matchAll(/@xauusd\/[A-Za-z0-9._-]+/g)) {
    if (!PUBLIC_PACKAGE_NAMES.has(match[0])) {
      fail("FORBIDDEN_PRIVATE_REFERENCE", match[0], label);
    }
  }

  const privatePathPatterns = [
    /(?:^|[^A-Za-z0-9._-])apps\/[A-Za-z0-9._-]+\//,
    /(?:^|[^A-Za-z0-9._-])scripts\/(?:lib\/)?phase7[bc][^A-Za-z0-9._-]/i,
  ];
  for (const pattern of privatePathPatterns) {
    if (pattern.test(normalized)) {
      fail("FORBIDDEN_PRIVATE_PATH", pattern.source, label);
    }
  }

  for (const match of normalized.matchAll(/packages\/([A-Za-z0-9._-]+)\//g)) {
    if (!PUBLIC_PACKAGES.includes(match[1])) {
      fail("FORBIDDEN_PRIVATE_PATH", `packages/${match[1]}/`, label);
    }
  }

  return true;
}

async function listFilesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function requireDirectory(directory) {
  try {
    if (!(await stat(directory)).isDirectory()) {
      fail("DISTRIBUTION_ARTIFACT_MISSING", path.relative(ROOT, directory));
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail("DISTRIBUTION_ARTIFACT_MISSING", path.relative(ROOT, directory));
    }
    throw error;
  }
}

export async function collectDistributionArtifactFiles(root = ROOT) {
  const files = [path.join(root, "package.json")];

  for (const packageName of PUBLIC_PACKAGES) {
    const packageDir = path.join(root, "packages", packageName);
    const manifest = path.join(packageDir, "package.json");
    const distDir = path.join(packageDir, "dist");
    await requireDirectory(distDir);
    files.push(manifest);

    for (const file of await listFilesRecursively(distDir)) {
      const extension = path.extname(file).toLowerCase();
      if (TEXT_EXTENSIONS.has(extension) || file.endsWith(".d.ts") || file.endsWith(".d.cts") || file.endsWith(".d.mts")) {
        files.push(file);
      }
    }
  }

  return [...new Set(files)].sort();
}

export async function scanDistributionArtifacts(root = ROOT) {
  const files = await collectDistributionArtifactFiles(root);
  for (const file of files) {
    const content = await readFile(file, "utf8");
    inspectTextArtifact(content, path.relative(root, file).replaceAll("\\", "/"));
  }
  return { scannedFiles: files.length };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const result = await scanDistributionArtifacts();
    console.log("DISTRIBUTION_ARTIFACT_BOUNDARY=PASS");
    console.log(`DISTRIBUTION_ARTIFACT_FILES_SCANNED=${result.scannedFiles}`);
    console.log("PRIVATE_REFERENCE=NONE");
    console.log("PRIVATE_PATH=NONE");
    console.log("SECRET_MATERIAL=NONE");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
