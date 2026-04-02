const fs = require("fs");
const path = require("path");

class AppConfigStore {
  constructor(app) {
    this.app = app;
    this.filePath = path.join(this.app.getPath("userData"), "app-config.json");
    this.cache = null;
  }

  getDefaultConfig() {
    return {
      backend: {
        rememberedExecutablePath: "",
        lastSuccessfulLaunchPath: "",
        lastSuccessfulSourceType: "",
        lastSuccessfulBaseUrl: "",
        lastResolvedSourceMode: "",
        lastState: "idle",
        lastError: "",
        lastAttemptAt: "",
        lastReadyAt: "",
        lastScenario: "none"
      }
    };
  }

  ensureLoaded() {
    if (this.cache) {
      return;
    }

    try {
      if (!fs.existsSync(this.filePath)) {
        this.cache = this.getDefaultConfig();
        this.save();
        return;
      }

      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.cache = {
        ...this.getDefaultConfig(),
        ...parsed,
        backend: {
          ...this.getDefaultConfig().backend,
          ...(parsed.backend || {})
        }
      };
    } catch (error) {
      this.cache = this.getDefaultConfig();
      this.save();
    }
  }

  getConfig() {
    this.ensureLoaded();
    return this.cache;
  }

  save() {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2) + "\n", "utf8");
  }

  updateBackend(partial) {
    this.ensureLoaded();
    this.cache = {
      ...this.cache,
      backend: {
        ...this.cache.backend,
        ...partial
      }
    };
    this.save();
    return this.cache.backend;
  }

  getBackend() {
    this.ensureLoaded();
    return this.cache.backend;
  }
}

module.exports = {
  AppConfigStore
};
