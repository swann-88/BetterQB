const fs = require("fs");
const path = require("path");

function exists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function removeDir(targetPath) {
  if (exists(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyDir(source, destination) {
  fs.cpSync(source, destination, { recursive: true, force: true, dereference: true });
}

function getSourceCandidates() {
  const envSource = String(process.env.QBT_BUNDLE_SOURCE_PATH || "").trim();
  const primary = "C:\\Program Files\\qBittorrent";
  const secondary = "C:\\Program Files (x86)\\qBittorrent";
  return [envSource, primary, secondary].filter(Boolean);
}

function resolveSourceDir() {
  const candidates = getSourceCandidates();
  for (const candidate of candidates) {
    const exe = path.join(candidate, "qbittorrent.exe");
    if (exists(exe)) {
      return { sourceDir: candidate, executablePath: exe, candidates };
    }
  }
  return { sourceDir: "", executablePath: "", candidates };
}

function collectManifestEntries(rootDir) {
  const list = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const rel = path.relative(rootDir, fullPath);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        list.push({
          path: rel.replace(/\\/g, "/"),
          size: fs.statSync(fullPath).size
        });
      }
    }
  }
  return list.sort((a, b) => a.path.localeCompare(b.path));
}

function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const releaseRoot = path.join(projectRoot, "release-assets");
  const bundledRoot = path.join(releaseRoot, "qbittorrent");

  const resolved = resolveSourceDir();
  if (!resolved.sourceDir) {
    throw new Error(
      [
        "Unable to find a local qBittorrent installation for bundling.",
        "Checked candidates:",
        ...resolved.candidates.map((item) => `- ${item}`)
      ].join("\n")
    );
  }

  removeDir(bundledRoot);
  ensureDir(releaseRoot);
  copyDir(resolved.sourceDir, bundledRoot);

  const exclusions = [
    path.join(bundledRoot, "qbittorrent.pdb"),
    path.join(bundledRoot, "uninst.exe")
  ];
  for (const excluded of exclusions) {
    if (exists(excluded)) {
      fs.rmSync(excluded, { force: true });
    }
  }

  const executablePath = path.join(bundledRoot, "qbittorrent.exe");
  if (!exists(executablePath)) {
    throw new Error(`Bundled backend missing executable after copy: ${executablePath}`);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceDir: resolved.sourceDir,
    executable: "backend/qbittorrent/qbittorrent.exe",
    fileCount: 0,
    files: []
  };
  manifest.files = collectManifestEntries(bundledRoot);
  manifest.fileCount = manifest.files.length;

  const manifestPath = path.join(releaseRoot, "bundled-backend-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`[prepare:bundled-backend] Source: ${resolved.sourceDir}`);
  console.log(`[prepare:bundled-backend] Output: ${bundledRoot}`);
  console.log(`[prepare:bundled-backend] Files: ${manifest.fileCount}`);
  console.log(`[prepare:bundled-backend] Manifest: ${manifestPath}`);
}

main();
