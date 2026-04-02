const { EventEmitter } = require("events");
const fs = require("fs");
const { URL } = require("url");

const STATES = {
  IDLE: "idle",
  LOCATING: "locating-backend",
  LAUNCHING: "launching-backend",
  WAITING: "waiting-for-backend",
  READY: "backend-ready",
  UNREACHABLE: "backend-unreachable",
  PATH_MISSING: "path-missing",
  MANUAL_LOCATE_REQUIRED: "manual-locate-required"
};

class BackendLifecycleController extends EventEmitter {
  constructor({ configStore, resolver, launcher, runtimeLayout, readinessChecker, qbWebUIClient, now = () => new Date().toISOString() }) {
    super();
    this.configStore = configStore;
    this.resolver = resolver;
    this.launcher = launcher;
    this.runtimeLayout = runtimeLayout;
    this.readinessChecker = readinessChecker;
    this.qbWebUIClient = qbWebUIClient;
    this.now = now;
    this.listRefreshIntervalMs = Number(process.env.QBT_TORRENT_REFRESH_INTERVAL_MS || "1000");
    this.listRefreshTimer = null;
    this.listRefreshInFlight = false;

    this.debugScenario = process.env.QBT_LIFECYCLE_SCENARIO || "none";
    this.sequence = 0;
    this.torrentListCache = [];
    this.current = {
      state: STATES.IDLE,
      connected: false,
      lifecycleMessage: "idle",
      activePath: "",
      pathSource: "none",
      backendSourceType: "unresolved",
      backendSourceMode: "developer",
      baseUrl: "",
      qbtVersion: "",
      webuiReachable: false,
      webuiApiReachable: false,
      backendUsable: false,
      lastError: "",
      lastReadyAt: "",
      attemptId: 0,
      simulated: false,
      readinessDetail: "",
      scenario: this.debugScenario,
      candidates: [],
      listLoadState: "idle",
      listLoadError: "",
      listLoadedAt: "",
      listCount: 0,
      speedModeEnabled: false,
      runtimeProfilePath: "",
      runtimeConfigPath: "",
      runtimeLogsPath: "",
      runtimeTempPath: "",
      bundledExpectedPath: "",
      bundledExpectedCandidates: [],
      bundledAssetsPresent: false,
      bundledPrepState: "not-applicable",
      bundledPrepError: "",
      bundledRunnable: false
    };
  }

  getSnapshot() {
    const backend = this.configStore.getBackend();
    return {
      ...this.current,
      rememberedPath: backend.rememberedExecutablePath || "",
      lastSuccessfulLaunchPath: backend.lastSuccessfulLaunchPath || "",
      lastSuccessfulBaseUrl: backend.lastSuccessfulBaseUrl || "",
      lastSuccessfulSourceType: backend.lastSuccessfulSourceType || "",
      lastResolvedSourceMode: backend.lastResolvedSourceMode || ""
    };
  }

  stopAutoRefreshLoop() {
    if (this.listRefreshTimer) {
      clearInterval(this.listRefreshTimer);
      this.listRefreshTimer = null;
    }
    this.listRefreshInFlight = false;
  }

  startAutoRefreshLoop() {
    this.stopAutoRefreshLoop();
    const intervalMs = Number.isFinite(this.listRefreshIntervalMs) && this.listRefreshIntervalMs > 0
      ? this.listRefreshIntervalMs
      : 1000;

    this.listRefreshTimer = setInterval(async () => {
      if (this.listRefreshInFlight || !this.current.connected || !this.current.baseUrl) {
        return;
      }
      this.listRefreshInFlight = true;
      try {
        await this.loadTorrentList({ quiet: true, lifecycleMessage: "connected-and-list-loaded" });
      } catch {
        // keep loop alive on transient failures
      } finally {
        this.listRefreshInFlight = false;
      }
    }, intervalMs);
  }

  getRuntimePathsForContext(launchContext, sourceMode = "developer") {
    if (!launchContext) {
      return {
        profileDir: "",
        configDir: "",
        logsDir: "",
        tempDir: ""
      };
    }

    if (launchContext.sourceType === "bundled" || sourceMode === "release") {
      return launchContext.bundledPaths || {
        profileDir: "",
        configDir: "",
        logsDir: "",
        tempDir: ""
      };
    }

    return launchContext.developerPaths || {
      profileDir: "",
      configDir: "",
      logsDir: "",
      tempDir: ""
    };
  }

  inspectSourceResolution(manualPath = "", modeHint = "") {
    const resolved = this.resolver.resolve(manualPath, this.debugScenario, modeHint);
    const launchContext = this.runtimeLayout
      ? this.runtimeLayout.getLaunchContext({
        sourceType: resolved.sourceType || "unresolved",
        executablePath: resolved.path || "",
        sourceMode: resolved.sourceMode || this.current.backendSourceMode || "developer"
      })
      : null;
    return {
      mode: resolved.sourceMode || this.current.backendSourceMode || "developer",
      found: Boolean(resolved.found),
      sourceType: resolved.sourceType || "unresolved",
      executablePath: resolved.path || "",
      candidates: Array.isArray(resolved.candidates) ? resolved.candidates : [],
      scenario: resolved.scenario || this.debugScenario,
      bundledExpectedPath: launchContext && launchContext.bundledProbe ? launchContext.bundledProbe.executablePath || "" : "",
      bundledExpectedCandidates: launchContext && launchContext.bundledProbe ? launchContext.bundledProbe.expectedCandidates || [] : [],
      bundledAssetsPresent: Boolean(launchContext && launchContext.bundledProbe && launchContext.bundledProbe.present),
      bundledPrepState: launchContext ? launchContext.bundledPrepState : "not-applicable",
      bundledPrepError: launchContext ? launchContext.bundledPrepError : "",
      bundledRunnable: Boolean(launchContext && launchContext.bundledRunnable),
      runtimePaths: (() => {
        const runtimePaths = this.getRuntimePathsForContext(
          launchContext,
          resolved.sourceMode || this.current.backendSourceMode || "developer"
        );
        return {
          profilePath: runtimePaths.profileDir,
          configPath: runtimePaths.configDir,
          logsPath: runtimePaths.logsDir,
          tempPath: runtimePaths.tempDir
        };
      })()
    };
  }

  getTorrentListSnapshot() {
    return {
      items: this.torrentListCache,
      state: this.current.listLoadState,
      error: this.current.listLoadError
    };
  }

  setDebugScenario(scenario) {
    this.debugScenario = scenario || "none";
    this.configStore.updateBackend({
      lastScenario: this.debugScenario
    });
    this.pushState({ scenario: this.debugScenario }, "debug-scenario-updated");
    return this.debugScenario;
  }

  pushState(next, lifecycleMessage) {
    this.current = {
      ...this.current,
      ...next,
      lifecycleMessage,
      scenario: this.debugScenario
    };

    this.configStore.updateBackend({
      lastState: this.current.state,
      lastError: this.current.lastError || "",
      lastAttemptAt: this.now(),
      lastScenario: this.debugScenario,
      lastResolvedSourceMode: this.current.backendSourceMode || "",
      ...(this.current.lastReadyAt ? { lastReadyAt: this.current.lastReadyAt } : {}),
      ...(this.current.baseUrl ? { lastSuccessfulBaseUrl: this.current.baseUrl } : {})
    });

    this.emit("state", this.getSnapshot());
  }

  emitTorrentList() {
    this.emit("torrent-list", this.getTorrentListSnapshot());
  }

  async startup() {
    return this.connect();
  }

  async reconnect() {
    return this.connect();
  }

  rememberManualPath(executablePath) {
    this.configStore.updateBackend({
      rememberedExecutablePath: executablePath
    });
  }

  isValidExecutablePath(executablePath) {
    if (!executablePath || !String(executablePath).toLowerCase().endsWith(".exe")) {
      return false;
    }

    try {
      return fs.existsSync(executablePath);
    } catch {
      return false;
    }
  }

  async loadTorrentList(options = {}) {
    const quiet = Boolean(options.quiet);
    const readyMessage = options.lifecycleMessage || "connected-and-list-loaded";
    if (!this.current.baseUrl) {
      this.pushState(
        {
          listLoadState: "failed",
          listLoadError: "missing-base-url"
        },
        "connected-list-load-failed"
      );
      return this.getTorrentListSnapshot();
    }

    if (!quiet) {
      this.pushState(
        {
          listLoadState: "loading",
          listLoadError: ""
        },
        "loading-main-torrent-list"
      );
    }

    const response = await this.qbWebUIClient.fetchTorrents(this.current.baseUrl);
    if (!response.ok) {
      this.torrentListCache = [];
      this.pushState(
        {
          listLoadState: "failed",
          listLoadError: response.error || "unknown-list-load-error",
          listCount: 0
        },
        "connected-list-load-failed"
      );
      this.emitTorrentList();
      return this.getTorrentListSnapshot();
    }

    this.torrentListCache = response.items;
    this.pushState(
      {
        listLoadState: "success",
        listLoadError: "",
        listCount: response.items.length,
        listLoadedAt: this.now()
      },
      readyMessage
    );
    this.emitTorrentList();
    return this.getTorrentListSnapshot();
  }

  async refreshSpeedMode() {
    if (!this.current.baseUrl) {
      return {
        ok: false,
        error: "missing-base-url"
      };
    }

    const mode = await this.qbWebUIClient.getAlternativeSpeedMode(this.current.baseUrl);
    if (!mode.ok) {
      return mode;
    }

    this.pushState(
      {
        speedModeEnabled: Boolean(mode.enabled)
      },
      "speed-mode-snapshot"
    );
    return mode;
  }

  async applyVisibleScopeAction(action, hashes, scope = null) {
    if (!this.current.connected || !this.current.baseUrl) {
      return {
        ok: false,
        error: "backend-offline",
        scope
      };
    }

    const list = Array.isArray(hashes) ? hashes.filter(Boolean) : [];
    if (!list.length) {
      return {
        ok: true,
        noOp: true,
        affectedCount: 0,
        scope,
        listSnapshot: this.getTorrentListSnapshot()
      };
    }

    let operation = null;
    if (action === "start") {
      operation = await this.qbWebUIClient.resumeTorrents(this.current.baseUrl, list);
    } else if (action === "pause") {
      operation = await this.qbWebUIClient.pauseTorrents(this.current.baseUrl, list);
    } else {
      return {
        ok: false,
        error: "unsupported-visible-scope-action",
        scope
      };
    }

    if (!operation.ok) {
      return {
        ok: false,
        error: operation.error || "visible-scope-action-failed",
        scope
      };
    }

    const listSnapshot = await this.loadTorrentList();
    return {
      ok: true,
      noOp: Boolean(operation.noOp),
      affectedCount: operation.affectedCount || list.length,
      scope,
      listSnapshot
    };
  }

  async toggleSpeedMode() {
    if (!this.current.connected || !this.current.baseUrl) {
      return {
        ok: false,
        error: "backend-offline"
      };
    }

    const toggled = await this.qbWebUIClient.toggleAlternativeSpeedMode(this.current.baseUrl);
    if (!toggled.ok) {
      return {
        ok: false,
        error: toggled.error || "toggle-speed-mode-failed"
      };
    }

    this.pushState(
      {
        speedModeEnabled: Boolean(toggled.enabled)
      },
      "speed-mode-toggled"
    );

    return {
      ok: true,
      enabled: Boolean(toggled.enabled)
    };
  }

  async getAddContext() {
    if (!this.current.baseUrl) {
      return {
        ok: false,
        connected: false,
        savePathState: "unavailable",
        note: "Backend is offline."
      };
    }

    const response = await this.qbWebUIClient.fetchDefaultSavePath(this.current.baseUrl);
    if (!response.ok) {
      return {
        ok: false,
        connected: true,
        savePathState: "pending",
        note: response.error || "default-save-path-unavailable"
      };
    }

    return {
      ok: true,
      connected: true,
      savePathState: "ready",
      savePath: response.savePath,
      note: response.savePath ? "" : "default-save-path-empty"
    };
  }

  parseNameHintFromMagnet(rawMagnet) {
    try {
      const parsed = new URL(String(rawMagnet || "").trim());
      return parsed.searchParams.get("dn") || "";
    } catch {
      return "";
    }
  }

  parseHashHintFromMagnet(rawMagnet) {
    try {
      const parsed = new URL(String(rawMagnet || "").trim());
      const xt = parsed.searchParams.get("xt") || "";
      const match = xt.match(/urn:btih:([A-Za-z0-9]{32,40})/i);
      return match ? match[1].toLowerCase() : "";
    } catch {
      return "";
    }
  }

  pickBestAddedMatch(items, payload, beforeEpochSec) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return null;
    }

    const hashHint = payload.sourceType === "magnet" ? this.parseHashHintFromMagnet(payload.url) : "";
    if (hashHint) {
      const hashMatch = list.find((item) => String(item.hash || "").toLowerCase() === hashHint);
      if (hashMatch) {
        return {
          id: hashMatch.hash,
          reason: "exact-hash-match",
          confidence: "high"
        };
      }
    }

    const nameHint = payload.sourceType === "file"
      ? String(payload.fileName || "").replace(/\.torrent$/i, "").trim().toLowerCase()
      : String(this.parseNameHintFromMagnet(payload.url) || "").trim().toLowerCase();

    const recent = list
      .filter((item) => Number(item.added_on || 0) >= beforeEpochSec - 8)
      .sort((a, b) => Number(b.added_on || 0) - Number(a.added_on || 0));

    if (nameHint) {
      const byName = recent.find((item) => String(item.name || "").trim().toLowerCase() === nameHint)
        || recent.find((item) => String(item.name || "").trim().toLowerCase().includes(nameHint));
      if (byName) {
        return {
          id: byName.hash,
          reason: "recent-name-match",
          confidence: "medium"
        };
      }
    }

    if (recent.length === 1) {
      return {
        id: recent[0].hash,
        reason: "single-recent-candidate",
        confidence: "low"
      };
    }

    return null;
  }

  async addTorrent(payload = {}) {
    if (!this.current.connected || !this.current.baseUrl) {
      return {
        ok: false,
        error: "backend-offline"
      };
    }

    const beforeEpochSec = Math.floor(Date.now() / 1000);
    const submitted = await this.qbWebUIClient.addTorrent(this.current.baseUrl, payload);
    if (!submitted.ok) {
      return {
        ok: false,
        error: submitted.error || "add-request-failed"
      };
    }

    let latestItems = this.torrentListCache;
    let matched = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const refreshed = await this.loadTorrentList();
      latestItems = refreshed.items || [];
      matched = this.pickBestAddedMatch(latestItems, payload, beforeEpochSec);
      if (matched) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    return {
      ok: true,
      accepted: true,
      selectedId: matched ? matched.id : null,
      selectedReason: matched ? matched.reason : "",
      selectedConfidence: matched ? matched.confidence : "",
      visible: Boolean(matched),
      message: matched
        ? "Torrent added and highlighted."
        : "Torrent add accepted. It may appear in the list shortly."
    };
  }

  async getSettingsPreferences() {
    if (!this.current.connected || !this.current.baseUrl) {
      return {
        ok: false,
        error: "backend-offline"
      };
    }

    const prefs = await this.qbWebUIClient.getPreferences(this.current.baseUrl);
    if (!prefs.ok) {
      return {
        ok: false,
        error: prefs.error || "preferences-read-failed"
      };
    }

    return {
      ok: true,
      preferences: prefs.data || {}
    };
  }

  async updateSettingsPreferences(patch = {}) {
    if (!this.current.connected || !this.current.baseUrl) {
      return {
        ok: false,
        error: "backend-offline"
      };
    }

    const write = await this.qbWebUIClient.setPreferences(this.current.baseUrl, patch);
    if (!write.ok) {
      return {
        ok: false,
        error: write.error || "preferences-write-failed"
      };
    }

    const readback = await this.getSettingsPreferences();
    if (!readback.ok) {
      return {
        ok: false,
        error: readback.error || "preferences-readback-failed"
      };
    }

    const mismatch = this.findPreferencePatchMismatch(patch, readback.preferences || {});
    if (mismatch) {
      return {
        ok: false,
        error: `preferences-readback-mismatch-${mismatch.key}`,
        expected: mismatch.expected,
        actual: mismatch.actual
      };
    }

    return {
      ok: true,
      preferences: readback.preferences
    };
  }

  findPreferencePatchMismatch(patch, preferences) {
    const source = patch && typeof patch === "object" ? patch : {};
    for (const [key, expectedRaw] of Object.entries(source)) {
      if (!(key in preferences)) {
        return {
          key,
          expected: expectedRaw,
          actual: undefined
        };
      }

      const actualRaw = preferences[key];
      const expectedNorm = this.normalizePreferenceValue(expectedRaw);
      const actualNorm = this.normalizePreferenceValue(actualRaw);
      if (expectedNorm !== actualNorm) {
        return {
          key,
          expected: expectedNorm,
          actual: actualNorm
        };
      }
    }

    return null;
  }

  normalizePreferenceValue(value) {
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? String(value) : "nan";
    }
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).trim();
  }

  findNextAutoCandidate(sourceMode, attemptedPaths = []) {
    if (!this.resolver || typeof this.resolver.buildCandidateChain !== "function") {
      return "";
    }

    const attempted = new Set(
      (Array.isArray(attemptedPaths) ? attemptedPaths : [])
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    );

    const chain = this.resolver.buildCandidateChain("", sourceMode);
    const ordered = Array.isArray(chain.ordered) ? chain.ordered : [];
    for (const candidate of ordered) {
      const normalized = String(candidate && candidate.path ? candidate.path : "").trim();
      if (!normalized) {
        continue;
      }
      if (attempted.has(normalized.toLowerCase())) {
        continue;
      }
      if (!this.isValidExecutablePath(normalized)) {
        continue;
      }
      return normalized;
    }

    return "";
  }

  async getTorrentDetails(hash) {
    if (!this.current.baseUrl) {
      return {
        ok: false,
        state: "offline",
        error: "backend-offline",
        simulated: Boolean(this.current.simulated),
        hash
      };
    }

    const details = await this.qbWebUIClient.fetchTorrentDetails(this.current.baseUrl, hash);
    return {
      ...details,
      state: this.current.state,
      connected: this.current.connected,
      simulated: Boolean(this.current.simulated),
      baseUrl: this.current.baseUrl,
      qbtVersion: this.current.qbtVersion
    };
  }

  async applyTorrentDetailsAction(hash, action) {
    if (!hash) {
      return {
        ok: false,
        error: "missing-hash"
      };
    }

    if (!this.current.connected || !this.current.baseUrl) {
      return {
        ok: false,
        error: "backend-offline",
        hash,
        action
      };
    }

    const single = [hash];
    let result = null;
    if (action === "start") {
      result = await this.qbWebUIClient.resumeTorrents(this.current.baseUrl, single);
    } else if (action === "pause") {
      result = await this.qbWebUIClient.pauseTorrents(this.current.baseUrl, single);
    } else if (action === "recheck") {
      result = await this.qbWebUIClient.recheckTorrents(this.current.baseUrl, single);
    } else if (action === "toggle-sequential") {
      result = await this.qbWebUIClient.toggleSequentialDownload(this.current.baseUrl, single);
    } else if (action === "toggle-firstlast") {
      result = await this.qbWebUIClient.toggleFirstLastPiecePrio(this.current.baseUrl, single);
    } else {
      return {
        ok: false,
        error: "unsupported-details-action",
        action,
        hash
      };
    }

    if (!result || !result.ok) {
      return {
        ok: false,
        error: (result && result.error) || "details-action-failed",
        action,
        hash
      };
    }

    const listSnapshot = await this.loadTorrentList();
    const details = await this.getTorrentDetails(hash);
    if (!details.ok) {
      return {
        ok: false,
        error: details.error || "details-readback-failed",
        action,
        hash,
        listSnapshot,
        readbackUncertain: true
      };
    }

    return {
      ok: true,
      action,
      hash,
      listSnapshot,
      details
    };
  }

  async connect(manualPath = "", options = {}) {
    this.stopAutoRefreshLoop();
    const attemptedPaths = Array.isArray(options.attemptedPaths) ? options.attemptedPaths : [];
    const autoFallbackEnabled = options.autoFallback !== false;
    const attemptId = ++this.sequence;
    const sourceMode = this.resolver.normalizeMode(
      process.env.QBT_BACKEND_RUNTIME_MODE || ""
    );

    this.pushState(
      {
        state: STATES.LOCATING,
        connected: false,
        backendUsable: false,
        attemptId,
        lastError: "",
        readinessDetail: "",
        webuiReachable: false,
        webuiApiReachable: false,
        simulated: false,
        listLoadState: "idle",
        listLoadError: "",
        listCount: 0,
        backendSourceMode: sourceMode,
        bundledPrepState: "not-applicable",
        bundledPrepError: ""
      },
      "locating-candidate-path"
    );

    const resolved = this.resolver.resolve(manualPath, this.debugScenario, sourceMode);
    const unresolvedContext = this.runtimeLayout
      ? this.runtimeLayout.getLaunchContext({
        sourceType: resolved.sourceType || "unresolved",
        executablePath: resolved.path || "",
        sourceMode: resolved.sourceMode || sourceMode
      })
      : null;
    if (!resolved.found) {
      if (autoFallbackEnabled) {
        const fallbackPath = this.findNextAutoCandidate(
          resolved.sourceMode || sourceMode,
          attemptedPaths
        );
        if (fallbackPath) {
          return this.connect(fallbackPath, {
            attemptedPaths: [...attemptedPaths, fallbackPath],
            autoFallback: true
          });
        }
      }

      this.torrentListCache = [];
      this.pushState(
        {
          state: STATES.PATH_MISSING,
          connected: false,
          backendUsable: false,
          activePath: "",
          pathSource: resolved.sourceType || "unresolved",
          backendSourceType: resolved.sourceType || "unresolved",
          backendSourceMode: resolved.sourceMode || sourceMode,
          webuiReachable: false,
          webuiApiReachable: false,
          lastError: "No qBittorrent executable path found.",
          candidates: resolved.candidates,
          simulated: resolved.scenario !== "none",
          bundledAssetsPresent: Boolean(unresolvedContext && unresolvedContext.bundledProbe && unresolvedContext.bundledProbe.present),
          bundledExpectedPath: unresolvedContext && unresolvedContext.bundledProbe ? unresolvedContext.bundledProbe.executablePath || "" : "",
          bundledExpectedCandidates: unresolvedContext && unresolvedContext.bundledProbe ? unresolvedContext.bundledProbe.expectedCandidates || [] : [],
          bundledPrepState: unresolvedContext ? unresolvedContext.bundledPrepState : "not-applicable",
          bundledPrepError: unresolvedContext ? unresolvedContext.bundledPrepError : "",
          bundledRunnable: Boolean(unresolvedContext && unresolvedContext.bundledRunnable),
          runtimeProfilePath: this.getRuntimePathsForContext(unresolvedContext, resolved.sourceMode || sourceMode).profileDir,
          runtimeConfigPath: this.getRuntimePathsForContext(unresolvedContext, resolved.sourceMode || sourceMode).configDir,
          runtimeLogsPath: this.getRuntimePathsForContext(unresolvedContext, resolved.sourceMode || sourceMode).logsDir,
          runtimeTempPath: this.getRuntimePathsForContext(unresolvedContext, resolved.sourceMode || sourceMode).tempDir
        },
        "path-missing"
      );

      this.pushState(
        {
          state: STATES.MANUAL_LOCATE_REQUIRED,
          connected: false,
          backendUsable: false
        },
        "manual-locate-required"
      );

      this.emitTorrentList();
      return this.getSnapshot();
    }

    const activePath = resolved.path;
    const pathSource = resolved.sourceType || resolved.source;
    const launchContext = this.runtimeLayout
      ? this.runtimeLayout.getLaunchContext({
        sourceType: pathSource || "unresolved",
        executablePath: activePath,
        sourceMode: resolved.sourceMode || sourceMode
      })
      : null;

    const runtimePaths = this.getRuntimePathsForContext(launchContext, resolved.sourceMode || sourceMode);

    if (launchContext && launchContext.sourceType === "bundled" && launchContext.bundledPrepState === "prepare-failed") {
      this.torrentListCache = [];
      this.pushState(
        {
          state: STATES.UNREACHABLE,
          connected: false,
          backendUsable: false,
          lastError: launchContext.bundledPrepError || "Bundled runtime bootstrap failed.",
          bundledPrepState: launchContext.bundledPrepState,
          bundledPrepError: launchContext.bundledPrepError || "",
          bundledRunnable: Boolean(launchContext.bundledRunnable),
          bundledAssetsPresent: Boolean(launchContext.bundledProbe && launchContext.bundledProbe.present),
          bundledExpectedPath: launchContext.bundledProbe ? launchContext.bundledProbe.executablePath || "" : "",
          bundledExpectedCandidates: launchContext.bundledProbe ? launchContext.bundledProbe.expectedCandidates || [] : [],
          runtimeProfilePath: runtimePaths.profileDir,
          runtimeConfigPath: runtimePaths.configDir,
          runtimeLogsPath: runtimePaths.logsDir,
          runtimeTempPath: runtimePaths.tempDir,
          webuiReachable: false,
          webuiApiReachable: false
        },
        "bundled-runtime-bootstrap-failed"
      );
      this.emitTorrentList();
      return this.getSnapshot();
    }

    if (manualPath) {
      this.rememberManualPath(activePath);
    }

    this.pushState(
      {
        state: STATES.LAUNCHING,
        connected: false,
        backendUsable: false,
        activePath,
        pathSource,
        backendSourceType: resolved.sourceType || "unresolved",
        backendSourceMode: resolved.sourceMode || sourceMode,
        candidates: resolved.candidates,
        lastError: "",
        simulated: resolved.scenario !== "none",
        baseUrl: "",
        qbtVersion: "",
        webuiReachable: false,
        webuiApiReachable: false,
        bundledPrepState: launchContext ? launchContext.bundledPrepState : "not-applicable",
        bundledPrepError: launchContext ? launchContext.bundledPrepError : "",
        bundledRunnable: Boolean(launchContext && launchContext.bundledRunnable),
        bundledAssetsPresent: Boolean(launchContext && launchContext.bundledProbe && launchContext.bundledProbe.present),
        bundledExpectedPath: launchContext && launchContext.bundledProbe ? launchContext.bundledProbe.executablePath || "" : "",
        bundledExpectedCandidates: launchContext && launchContext.bundledProbe ? launchContext.bundledProbe.expectedCandidates || [] : [],
        runtimeProfilePath: runtimePaths.profileDir,
        runtimeConfigPath: runtimePaths.configDir,
        runtimeLogsPath: runtimePaths.logsDir,
        runtimeTempPath: runtimePaths.tempDir
      },
      "launching-backend"
    );

    const launch = this.launcher.launch(
      activePath,
      this.debugScenario,
      launchContext
        ? {
          args: launchContext.launchArgs,
          cwd: launchContext.cwd,
          env: launchContext.env
        }
        : {}
    );
    if (!launch.ok) {
      if (autoFallbackEnabled) {
        const fallbackPath = this.findNextAutoCandidate(
          resolved.sourceMode || sourceMode,
          [...attemptedPaths, activePath]
        );
        if (fallbackPath) {
          return this.connect(fallbackPath, {
            attemptedPaths: [...attemptedPaths, activePath, fallbackPath],
            autoFallback: true
          });
        }
      }

      this.torrentListCache = [];
      this.pushState(
        {
          state: STATES.UNREACHABLE,
          connected: false,
          backendUsable: false,
          lastError: launch.error || "Failed to launch backend process.",
          simulated: Boolean(launch.simulated),
          webuiReachable: false,
          webuiApiReachable: false
        },
        "backend-launch-failed"
      );
      this.emitTorrentList();
      return this.getSnapshot();
    }

    this.pushState(
      {
        state: STATES.WAITING,
        connected: false,
        backendUsable: false,
        lastError: "",
        simulated: Boolean(launch.simulated),
        webuiReachable: false,
        webuiApiReachable: false
      },
      "waiting-for-qb-webui"
    );

    const readiness = await this.readinessChecker.waitForReady(this.debugScenario);
    if (readiness.ready) {
      const lastReadyAt = this.now();
      this.configStore.updateBackend({
        lastSuccessfulLaunchPath: activePath,
        lastSuccessfulSourceType: resolved.sourceType || "",
        ...(readiness.baseUrl ? { lastSuccessfulBaseUrl: readiness.baseUrl } : {})
      });

      this.pushState(
        {
          state: STATES.READY,
          connected: true,
          backendUsable: true,
          lastReadyAt,
          readinessDetail: readiness.detail,
          simulated: Boolean(readiness.simulated),
          baseUrl: readiness.baseUrl || "",
          qbtVersion: readiness.qbtVersion || "",
          webuiReachable: true,
          webuiApiReachable: true
        },
        "backend-ready-webui-usable"
      );

      await this.refreshSpeedMode();
      await this.loadTorrentList();
      this.startAutoRefreshLoop();
      return this.getSnapshot();
    }

    if (autoFallbackEnabled) {
      const fallbackPath = this.findNextAutoCandidate(
        resolved.sourceMode || sourceMode,
        [...attemptedPaths, activePath]
      );
      if (fallbackPath) {
        return this.connect(fallbackPath, {
          attemptedPaths: [...attemptedPaths, activePath, fallbackPath],
          autoFallback: true
        });
      }
    }

    this.torrentListCache = [];
    const unreachableReasonMap = {
      "webui-reachable-unusable": "qB WebUI reachable but session/auth not established.",
      "invalid-backend-target": "Target responded but does not match qB WebUI contract.",
      timeout: "qB WebUI did not become usable before timeout."
    };

    this.pushState(
      {
        state: STATES.UNREACHABLE,
        connected: false,
        backendUsable: false,
        lastError: unreachableReasonMap[readiness.state] || `Backend readiness failed: ${readiness.detail}`,
        readinessDetail: readiness.detail,
        simulated: Boolean(readiness.simulated),
        webuiReachable: readiness.state === "webui-reachable-unusable" || readiness.state === "invalid-backend-target",
        webuiApiReachable: readiness.state === "webui-reachable-unusable" || readiness.state === "invalid-backend-target"
      },
      readiness.state === "webui-reachable-unusable"
        ? "qb-webui-reachable-unusable"
        : readiness.state === "invalid-backend-target"
          ? "invalid-backend-target"
          : "backend-unreachable"
    );
    this.emitTorrentList();

    return this.getSnapshot();
  }
}

module.exports = {
  STATES,
  BackendLifecycleController
};
