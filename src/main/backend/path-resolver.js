const fs = require("fs");

const BACKEND_SOURCE_TYPES = {
  INSTALLED: "installed",
  BUNDLED: "bundled",
  EXTERNAL: "external",
  UNRESOLVED: "unresolved"
};

const BACKEND_SOURCE_MODES = {
  DEVELOPER: "developer",
  RELEASE: "release"
};

function fileExists(filePath) {
  if (!filePath) {
    return false;
  }

  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function unique(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const normalized = String(item || "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

class BackendPathResolver {
  constructor(configStore, options = {}) {
    this.configStore = configStore;
    this.options = options;
  }

  normalizeMode(modeHint = "") {
    const mode = String(modeHint || "").trim().toLowerCase();
    if (mode === BACKEND_SOURCE_MODES.RELEASE) {
      return BACKEND_SOURCE_MODES.RELEASE;
    }
    if (mode === BACKEND_SOURCE_MODES.DEVELOPER) {
      return BACKEND_SOURCE_MODES.DEVELOPER;
    }

    const envMode = String(
      process.env.QBT_BACKEND_RUNTIME_MODE
      || process.env.QBT_BACKEND_SOURCE_MODE
      || ""
    ).trim().toLowerCase();
    if (envMode === BACKEND_SOURCE_MODES.RELEASE || envMode === BACKEND_SOURCE_MODES.DEVELOPER) {
      return envMode;
    }

    if (this.options.isPackaged === true) {
      return BACKEND_SOURCE_MODES.RELEASE;
    }

    return BACKEND_SOURCE_MODES.DEVELOPER;
  }

  getInstalledCandidates() {
    return unique([
      "C:\\Program Files\\qBittorrent\\qbittorrent.exe",
      "C:\\Program Files (x86)\\qBittorrent\\qbittorrent.exe"
    ]);
  }

  getBundledCandidates() {
    const bundledCandidate = this.options.getBundledPath ? this.options.getBundledPath() : "";
    const bundledCandidates = this.options.getBundledCandidates
      ? this.options.getBundledCandidates()
      : [];
    return unique([
      bundledCandidate,
      ...(Array.isArray(bundledCandidates) ? bundledCandidates : [])
    ]);
  }

  getExternalCandidates(manualPath) {
    const backend = this.configStore.getBackend();
    return unique([
      manualPath,
      process.env.QBT_MANUAL_PATH,
      process.env.QBT_EXTERNAL_PATH,
      backend.rememberedExecutablePath,
      backend.lastSuccessfulLaunchPath,
      process.env.QBITTORRENT_PATH
    ]);
  }

  buildCandidateChain(manualPath, modeHint = "") {
    const mode = this.normalizeMode(modeHint);
    const installed = this.getInstalledCandidates().map((path) => ({
      path,
      sourceType: BACKEND_SOURCE_TYPES.INSTALLED
    }));
    const bundled = this.getBundledCandidates().map((path) => ({
      path,
      sourceType: BACKEND_SOURCE_TYPES.BUNDLED
    }));
    const external = this.getExternalCandidates(manualPath).map((path) => ({
      path,
      sourceType: BACKEND_SOURCE_TYPES.EXTERNAL
    }));

    const manualDirect = String(manualPath || "").trim();
    if (manualDirect) {
      return {
        mode,
        candidates: unique([
          ...external.map((item) => `${item.sourceType}:${item.path}`),
          ...installed.map((item) => `${item.sourceType}:${item.path}`),
          ...bundled.map((item) => `${item.sourceType}:${item.path}`)
        ]),
        ordered: [{ path: manualDirect, sourceType: BACKEND_SOURCE_TYPES.EXTERNAL }]
      };
    }

    let ordered = [];
    if (mode === BACKEND_SOURCE_MODES.RELEASE) {
      ordered = [...bundled, ...installed, ...external];
    } else {
      ordered = [...installed, ...external, ...bundled];
    }

    const dedupedByPath = [];
    const seenPath = new Set();
    for (const item of ordered) {
      const normalized = String(item.path || "").trim();
      if (!normalized || seenPath.has(normalized)) {
        continue;
      }
      seenPath.add(normalized);
      dedupedByPath.push({
        path: normalized,
        sourceType: item.sourceType
      });
    }

    return {
      mode,
      candidates: dedupedByPath.map((item) => `${item.sourceType}:${item.path}`),
      ordered: dedupedByPath
    };
  }

  resolve(manualPath, scenario = "none", modeHint = "") {
    const chain = this.buildCandidateChain(manualPath, modeHint);

    if (scenario === "force-path-missing") {
      return {
        path: "",
        source: BACKEND_SOURCE_TYPES.UNRESOLVED,
        sourceType: BACKEND_SOURCE_TYPES.UNRESOLVED,
        sourceMode: chain.mode,
        candidates: chain.candidates,
        scenario,
        found: false
      };
    }

    for (const candidate of chain.ordered) {
      if (fileExists(candidate.path)) {
        return {
          path: candidate.path,
          source: candidate.sourceType,
          sourceType: candidate.sourceType,
          sourceMode: chain.mode,
          candidates: chain.candidates,
          scenario,
          found: true
        };
      }
    }

    return {
      path: "",
      source: BACKEND_SOURCE_TYPES.UNRESOLVED,
      sourceType: BACKEND_SOURCE_TYPES.UNRESOLVED,
      sourceMode: chain.mode,
      candidates: chain.candidates,
      scenario,
      found: false
    };
  }
}

module.exports = {
  BackendPathResolver,
  BACKEND_SOURCE_TYPES,
  BACKEND_SOURCE_MODES
};
