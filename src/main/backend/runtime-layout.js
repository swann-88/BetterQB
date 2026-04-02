const fs = require("fs");
const path = require("path");

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function fileExists(targetPath) {
  if (!targetPath) {
    return false;
  }
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

class BackendRuntimeLayout {
  constructor(app, options = {}) {
    this.app = app;
    this.options = options;
  }

  getRuntimeRoot() {
    const customRoot = String(process.env.QBT_RUNTIME_ROOT || "").trim();
    if (customRoot) {
      return customRoot;
    }
    return path.join(this.app.getPath("userData"), "backend-runtime");
  }

  getBundledPaths() {
    const root = path.join(this.getRuntimeRoot(), "bundled");
    return {
      root,
      profileDir: path.join(root, "profile"),
      configDir: path.join(root, "config"),
      logsDir: path.join(root, "logs"),
      tempDir: path.join(root, "temp"),
      iniPath: path.join(root, "config", "qBittorrent.ini")
    };
  }

  getDeveloperPaths() {
    const root = path.join(this.getRuntimeRoot(), "developer");
    return {
      root,
      profileDir: path.join(root, "profile"),
      configDir: path.join(root, "config"),
      logsDir: path.join(root, "logs"),
      tempDir: path.join(root, "temp")
    };
  }

  getBundledExecutableCandidates() {
    const envPrimary = String(process.env.QBT_BUNDLED_PATH || "").trim();
    const envAlt = String(process.env.QBT_BUNDLED_PATH_ALT || "").trim();
    const envRelease = String(process.env.QBT_RELEASE_BUNDLED_PATH || "").trim();
    const configured = this.options.getBundledPath ? this.options.getBundledPath() : "";
    const packagedDefault = this.app && this.app.isPackaged
      ? path.join(process.resourcesPath, "backend", "qbittorrent", "qbittorrent.exe")
      : "";

    return [envPrimary, configured, envAlt, envRelease, packagedDefault]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  getBundledProbe() {
    const candidates = this.getBundledExecutableCandidates();
    const present = candidates.find((candidate) => fileExists(candidate)) || "";
    return {
      expectedCandidates: candidates,
      present: Boolean(present),
      executablePath: present
    };
  }

  buildBundledIniContents() {
    const address = String(process.env.QBT_BUNDLED_WEBUI_ADDRESS || "127.0.0.1").trim();
    const port = String(process.env.QBT_BUNDLED_WEBUI_PORT || "8080").trim();
    const upnp = String(process.env.QBT_BUNDLED_WEBUI_UPNP || "false").trim().toLowerCase();
    const bypassLocalAuth = String(process.env.QBT_BUNDLED_BYPASS_LOCAL_AUTH || "true").trim().toLowerCase();

    return [
      "[Preferences]",
      "WebUI\\Enabled=true",
      `WebUI\\Address=${address || "127.0.0.1"}`,
      `WebUI\\Port=${port || "8080"}`,
      `WebUI\\UPnP=${upnp === "true" ? "true" : "false"}`,
      "WebUI\\HTTPS\\Enabled=false",
      `WebUI\\LocalHostAuth=${bypassLocalAuth === "true" ? "false" : "true"}`,
      "General\\UseRandomPort=false",
      ""
    ].join("\n");
  }

  prepareBundledBootstrap() {
    const paths = this.getBundledPaths();
    try {
      ensureDirectory(paths.profileDir);
      ensureDirectory(paths.configDir);
      ensureDirectory(paths.logsDir);
      ensureDirectory(paths.tempDir);
      fs.writeFileSync(paths.iniPath, this.buildBundledIniContents(), "utf8");

      return {
        ok: true,
        state: "prepared",
        paths,
        note: "bundled-runtime-bootstrap-ready"
      };
    } catch (error) {
      return {
        ok: false,
        state: "prepare-failed",
        paths,
        error: error && error.message ? error.message : "bundled-bootstrap-failed"
      };
    }
  }

  getLaunchContext({ sourceType = "unresolved", executablePath = "", sourceMode = "developer" } = {}) {
    const bundledProbe = this.getBundledProbe();
    const developerPaths = this.getDeveloperPaths();
    const bundledPaths = this.getBundledPaths();

    const base = {
      sourceType,
      sourceMode,
      executablePath: String(executablePath || "").trim(),
      developerPaths,
      bundledPaths,
      bundledProbe,
      launchArgs: [],
      cwd: "",
      env: {},
      bundledPrepState: "not-applicable",
      bundledPrepError: "",
      bundledRunnable: false
    };

    if (sourceType !== "bundled") {
      return base;
    }

    const prepared = this.prepareBundledBootstrap();
    if (!prepared.ok) {
      return {
        ...base,
        bundledPrepState: prepared.state,
        bundledPrepError: prepared.error || "bundled-bootstrap-failed"
      };
    }

    return {
      ...base,
      bundledPrepState: prepared.state,
      bundledPaths: prepared.paths || bundledPaths,
      launchArgs: [`--profile=${prepared.paths.profileDir}`],
      cwd: prepared.paths.root,
      bundledRunnable: true
    };
  }
}

module.exports = {
  BackendRuntimeLayout
};
