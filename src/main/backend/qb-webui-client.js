function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unique(values) {
  const seen = new Set();
  const list = [];
  for (const value of values) {
    const normalized = String(value || "").trim().replace(/\/+$/, "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    list.push(normalized);
  }
  return list;
}

function withTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    }
  };
}

class QBWebUIClient {
  constructor(configStore, options = {}) {
    this.configStore = configStore;
    this.requestTimeoutMs = options.requestTimeoutMs || 1800;
    this.bootstrapTimeoutMs = options.bootstrapTimeoutMs || 18000;
    this.pollIntervalMs = options.pollIntervalMs || 1000;
    this.cookieByBaseUrl = new Map();
  }

  getCredentials() {
    const username = process.env.QBT_WEBUI_USERNAME || "";
    const password = process.env.QBT_WEBUI_PASSWORD || "";
    return {
      username,
      password,
      available: Boolean(username) || Boolean(password)
    };
  }

  getCandidateBaseUrls() {
    const backend = this.configStore.getBackend();
    const envBase = process.env.QBT_WEBUI_BASE_URL || "";
    const envPorts = (process.env.QBT_WEBUI_PORTS || "8080,8081")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => `http://127.0.0.1:${item}`);

    return unique([
      envBase,
      backend.lastSuccessfulBaseUrl || "",
      ...envPorts
    ]);
  }

  getCookieHeader(baseUrl) {
    const cookie = this.cookieByBaseUrl.get(baseUrl);
    return cookie || "";
  }

  setCookieFromResponse(baseUrl, response) {
    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) {
      return;
    }

    const firstToken = setCookie.split(";")[0].trim();
    if (firstToken) {
      this.cookieByBaseUrl.set(baseUrl, firstToken);
    }
  }

  async request(baseUrl, endpoint, options = {}) {
    const timeout = withTimeoutSignal(options.timeoutMs || this.requestTimeoutMs);
    const headers = {
      Accept: "application/json,text/plain,*/*",
      ...(options.headers || {})
    };

    const cookie = this.getCookieHeader(baseUrl);
    if (cookie) {
      headers.Cookie = cookie;
    }

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: options.method || "GET",
        headers,
        body: options.body,
        signal: timeout.signal
      });
      this.setCookieFromResponse(baseUrl, response);
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        text,
        headers: response.headers
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        text: "",
        networkError: error && error.message ? error.message : "network-error"
      };
    } finally {
      timeout.clear();
    }
  }

  getTorrentActionEndpoints(actionKey) {
    const map = {
      start: ["/api/v2/torrents/start", "/api/v2/torrents/resume"],
      pause: ["/api/v2/torrents/stop", "/api/v2/torrents/pause"],
      recheck: ["/api/v2/torrents/recheck"],
      "toggle-sequential": ["/api/v2/torrents/toggleSequentialDownload"],
      "toggle-firstlast": ["/api/v2/torrents/toggleFirstLastPiecePrio"]
    };
    return map[actionKey] || [];
  }

  async attemptLogin(baseUrl) {
    const credentials = this.getCredentials();
    if (!credentials.available) {
      return {
        ok: false,
        reason: "credentials-missing"
      };
    }

    const body = new URLSearchParams({
      username: credentials.username,
      password: credentials.password
    }).toString();

    const response = await this.request(baseUrl, "/api/v2/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (response.ok) {
      return {
        ok: true,
        reason: "login-ok"
      };
    }

    return {
      ok: false,
      reason: `login-failed-${response.status || "network"}`
    };
  }

  isVersionLike(text) {
    return /^v?\d+\.\d+(\.\d+)?/i.test(String(text || "").trim());
  }

  async probeBaseUrl(baseUrl) {
    const webApi = await this.request(baseUrl, "/api/v2/app/webapiVersion");
    if (webApi.status === 0) {
      return {
        stage: "unreachable",
        detail: webApi.networkError || "connection-refused"
      };
    }

    if (webApi.status === 401 || webApi.status === 403) {
      const loginAttempt = await this.attemptLogin(baseUrl);
      if (!loginAttempt.ok) {
        return {
          stage: "auth-required",
          detail: loginAttempt.reason
        };
      }

      const retry = await this.request(baseUrl, "/api/v2/app/webapiVersion");
      if (!(retry.ok && this.isVersionLike(retry.text))) {
        return {
          stage: "unusable",
          detail: `webapi-version-after-login-${retry.status}`
        };
      }
    } else if (webApi.ok) {
      if (!this.isVersionLike(webApi.text)) {
        return {
          stage: "invalid-target",
          detail: "webapi-version-invalid-body"
        };
      }
    } else if (webApi.status === 404) {
      return {
        stage: "invalid-target",
        detail: "webapi-endpoint-not-found"
      };
    } else {
      return {
        stage: "unusable",
        detail: `webapi-version-status-${webApi.status}`
      };
    }

    const appVersion = await this.request(baseUrl, "/api/v2/app/version");
    if (!(appVersion.ok && this.isVersionLike(appVersion.text))) {
      return {
        stage: "invalid-target",
        detail: `app-version-invalid-${appVersion.status}`
      };
    }

    return {
      stage: "usable",
      detail: "webui-contract-ok",
      baseUrl,
      version: appVersion.text.trim()
    };
  }

  async waitForUsable() {
    const started = Date.now();
    const candidates = this.getCandidateBaseUrls();
    let lastReachableButUnusable = "";
    let sawAuthRequired = false;
    let sawInvalidTarget = false;

    if (!candidates.length) {
      return {
        ok: false,
        state: "invalid-backend-target",
        detail: "no-webui-candidates",
        candidates
      };
    }

    while (Date.now() - started < this.bootstrapTimeoutMs) {
      for (const baseUrl of candidates) {
        const probe = await this.probeBaseUrl(baseUrl);

        if (probe.stage === "usable") {
          return {
            ok: true,
            state: "webui-usable",
            detail: probe.detail,
            baseUrl,
            version: probe.version,
            candidates
          };
        }

        if (probe.stage === "auth-required") {
          sawAuthRequired = true;
          lastReachableButUnusable = probe.detail;
        } else if (probe.stage === "invalid-target") {
          sawInvalidTarget = true;
          lastReachableButUnusable = probe.detail;
        } else if (probe.stage === "unusable") {
          lastReachableButUnusable = probe.detail;
        }
      }

      await sleep(this.pollIntervalMs);
    }

    if (sawInvalidTarget) {
      return {
        ok: false,
        state: "invalid-backend-target",
        detail: lastReachableButUnusable || "invalid-target",
        candidates
      };
    }

    if (sawAuthRequired) {
      return {
        ok: false,
        state: "webui-reachable-unusable",
        detail: lastReachableButUnusable || "session-auth-not-established",
        candidates
      };
    }

    return {
      ok: false,
      state: "timeout",
      detail: lastReachableButUnusable || "webui-not-ready-before-timeout",
      candidates
    };
  }

  async fetchTorrents(baseUrl) {
    const response = await this.request(baseUrl, "/api/v2/torrents/info");
    if (!response.ok) {
      return {
        ok: false,
        error: `torrents-info-status-${response.status || "network"}`
      };
    }

    try {
      const parsed = JSON.parse(response.text || "[]");
      if (!Array.isArray(parsed)) {
        return {
          ok: false,
          error: "torrents-info-invalid-json"
        };
      }

      return {
        ok: true,
        items: parsed
      };
    } catch {
      return {
        ok: false,
        error: "torrents-info-parse-failed"
      };
    }
  }

  isLikelyMagnetOrUrl(input) {
    const value = String(input || "").trim();
    if (!value) {
      return false;
    }
    return /^magnet:\?/i.test(value) || /^https?:\/\//i.test(value);
  }

  async fetchDefaultSavePath(baseUrl) {
    const response = await this.request(baseUrl, "/api/v2/app/defaultSavePath");
    if (!response.ok) {
      return {
        ok: false,
        error: `default-save-path-status-${response.status || "network"}`
      };
    }

    return {
      ok: true,
      savePath: String(response.text || "").trim()
    };
  }

  async submitAddRequest(baseUrl, formData) {
    const response = await this.request(baseUrl, "/api/v2/torrents/add", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `add-status-${response.status || "network"}`,
        status: response.status
      };
    }

    const body = String(response.text || "").trim();
    if (body && /^fails?\./i.test(body)) {
      return {
        ok: false,
        error: body
      };
    }

    return {
      ok: true,
      message: body || "Ok."
    };
  }

  async addTorrentByUrl(baseUrl, payload) {
    const urls = String(payload && payload.url ? payload.url : "").trim();
    if (!this.isLikelyMagnetOrUrl(urls)) {
      return {
        ok: false,
        error: "invalid-magnet-or-url"
      };
    }

    const formData = new FormData();
    formData.append("urls", urls);
    if (payload && payload.savePath) {
      formData.append("savepath", payload.savePath);
    }

    const submitted = await this.submitAddRequest(baseUrl, formData);
    return {
      ...submitted,
      sourceType: "magnet",
      sourceValue: urls
    };
  }

  async addTorrentByFile(baseUrl, payload) {
    const fileName = String(payload && payload.fileName ? payload.fileName : "").trim();
    const contentBase64 = String(payload && payload.contentBase64 ? payload.contentBase64 : "").trim();

    if (!fileName || !/\.torrent$/i.test(fileName)) {
      return {
        ok: false,
        error: "invalid-torrent-file-name"
      };
    }

    if (!contentBase64) {
      return {
        ok: false,
        error: "missing-torrent-file-content"
      };
    }

    let fileBuffer = null;
    try {
      fileBuffer = Buffer.from(contentBase64, "base64");
    } catch {
      return {
        ok: false,
        error: "torrent-file-base64-decode-failed"
      };
    }

    if (!fileBuffer || !fileBuffer.length) {
      return {
        ok: false,
        error: "empty-torrent-file"
      };
    }

    const formData = new FormData();
    formData.append(
      "torrents",
      new Blob([fileBuffer], { type: payload.mimeType || "application/x-bittorrent" }),
      fileName
    );
    if (payload && payload.savePath) {
      formData.append("savepath", payload.savePath);
    }

    const submitted = await this.submitAddRequest(baseUrl, formData);
    return {
      ...submitted,
      sourceType: "file",
      sourceValue: fileName
    };
  }

  async addTorrent(baseUrl, payload = {}) {
    if (!payload || !payload.sourceType) {
      return {
        ok: false,
        error: "missing-add-source-type"
      };
    }

    if (payload.sourceType === "magnet") {
      return this.addTorrentByUrl(baseUrl, payload);
    }

    if (payload.sourceType === "file") {
      return this.addTorrentByFile(baseUrl, payload);
    }

    return {
      ok: false,
      error: "unsupported-add-source-type"
    };
  }

  async postHashesAction(baseUrl, actionKey, hashes) {
    const list = Array.isArray(hashes) ? hashes.filter(Boolean) : [];
    if (!list.length) {
      return {
        ok: true,
        noOp: true,
        affectedCount: 0
      };
    }

    const endpoints = this.getTorrentActionEndpoints(actionKey);
    if (!endpoints.length) {
      return {
        ok: false,
        error: `action-${actionKey}-unsupported`
      };
    }

    const body = new URLSearchParams({
      hashes: list.join("|")
    }).toString();

    let lastError = "";
    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index];
      const response = await this.request(baseUrl, endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });

      if (response.ok) {
        return {
          ok: true,
          noOp: false,
          affectedCount: list.length,
          endpointUsed: endpoint
        };
      }

      lastError = `action-${actionKey}-http-${response.status || "network"}`;
      const shouldTryFallback = response.status === 404 && index < endpoints.length - 1;
      if (!shouldTryFallback) {
        return {
          ok: false,
          error: lastError
        };
      }
    }

    return {
      ok: false,
      error: lastError || `action-${actionKey}-failed`
    };
  }

  async resumeTorrents(baseUrl, hashes) {
    return this.postHashesAction(baseUrl, "start", hashes);
  }

  async pauseTorrents(baseUrl, hashes) {
    return this.postHashesAction(baseUrl, "pause", hashes);
  }

  async recheckTorrents(baseUrl, hashes) {
    return this.postHashesAction(baseUrl, "recheck", hashes);
  }

  async toggleSequentialDownload(baseUrl, hashes) {
    return this.postHashesAction(baseUrl, "toggle-sequential", hashes);
  }

  async toggleFirstLastPiecePrio(baseUrl, hashes) {
    return this.postHashesAction(baseUrl, "toggle-firstlast", hashes);
  }

  async getAlternativeSpeedMode(baseUrl) {
    const response = await this.request(baseUrl, "/api/v2/transfer/speedLimitsMode");
    if (!response.ok) {
      return {
        ok: false,
        error: `speedLimitsMode-status-${response.status || "network"}`
      };
    }

    const raw = String(response.text || "").trim();
    return {
      ok: true,
      enabled: raw === "1"
    };
  }

  async toggleAlternativeSpeedMode(baseUrl) {
    const response = await this.request(baseUrl, "/api/v2/transfer/toggleSpeedLimitsMode", {
      method: "POST"
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `toggleSpeedLimitsMode-status-${response.status || "network"}`
      };
    }

    return this.getAlternativeSpeedMode(baseUrl);
  }

  async requestJson(baseUrl, endpoint, options = {}) {
    const response = await this.request(baseUrl, endpoint, options);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `status-${response.status || "network"}`
      };
    }

    try {
      return {
        ok: true,
        status: response.status,
        data: JSON.parse(response.text || "null")
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        error: "json-parse-failed"
      };
    }
  }

  async getPreferences(baseUrl) {
    return this.requestJson(baseUrl, "/api/v2/app/preferences");
  }

  async setPreferences(baseUrl, patch = {}) {
    const body = new URLSearchParams({
      json: JSON.stringify(patch || {})
    }).toString();
    const response = await this.request(baseUrl, "/api/v2/app/setPreferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `set-preferences-status-${response.status || "network"}`
      };
    }

    return {
      ok: true
    };
  }

  async fetchTorrentProperties(baseUrl, hash) {
    return this.requestJson(baseUrl, `/api/v2/torrents/properties?hash=${encodeURIComponent(hash)}`);
  }

  async fetchTorrentInfoRow(baseUrl, hash) {
    const response = await this.requestJson(
      baseUrl,
      `/api/v2/torrents/info?hashes=${encodeURIComponent(hash)}`
    );
    if (!response.ok) {
      return response;
    }

    const list = Array.isArray(response.data) ? response.data : [];
    const item = list[0] || null;
    return {
      ok: true,
      status: response.status,
      data: item
    };
  }

  async fetchTorrentFiles(baseUrl, hash) {
    return this.requestJson(baseUrl, `/api/v2/torrents/files?hash=${encodeURIComponent(hash)}`);
  }

  async fetchTorrentTrackers(baseUrl, hash) {
    return this.requestJson(baseUrl, `/api/v2/torrents/trackers?hash=${encodeURIComponent(hash)}`);
  }

  async fetchTorrentPeers(baseUrl, hash) {
    return this.requestJson(
      baseUrl,
      `/api/v2/sync/torrentPeers?hash=${encodeURIComponent(hash)}&rid=0`
    );
  }

  async fetchTorrentDetails(baseUrl, hash) {
    if (!hash) {
      return {
        ok: false,
        notFound: false,
        error: "missing-hash",
        sections: {}
      };
    }

    const properties = await this.fetchTorrentProperties(baseUrl, hash);
    if (!properties.ok && properties.status === 404) {
      return {
        ok: false,
        notFound: true,
        error: "torrent-not-found",
        sections: {
          overview: {
            status: "not-found",
            error: "Torrent no longer exists."
          }
        }
      };
    }

    if (!properties.ok) {
      return {
        ok: false,
        notFound: false,
        error: `properties-${properties.error || "failed"}`,
        sections: {
          overview: {
            status: "failed",
            error: `Unable to load overview (${properties.error || "unknown"}).`
          }
        }
      };
    }

    const [infoRow, files, trackers, peers] = await Promise.all([
      this.fetchTorrentInfoRow(baseUrl, hash),
      this.fetchTorrentFiles(baseUrl, hash),
      this.fetchTorrentTrackers(baseUrl, hash),
      this.fetchTorrentPeers(baseUrl, hash)
    ]);

    const infoData = infoRow.ok ? (infoRow.data || {}) : {};
    const mergedSummary = {
      ...(properties.data || {}),
      ...(infoData || {}),
      total_size:
        typeof (properties.data && properties.data.total_size) !== "undefined"
          ? properties.data.total_size
          : infoData.size
    };

    const sections = {
      overview: {
        status: "ok",
        data: mergedSummary
      },
      files: files.ok
        ? { status: "ok", data: Array.isArray(files.data) ? files.data : [] }
        : { status: "failed", error: files.error || "files-unavailable" },
      trackers: trackers.ok
        ? { status: "ok", data: Array.isArray(trackers.data) ? trackers.data : [] }
        : { status: "failed", error: trackers.error || "trackers-unavailable" },
      peers: peers.ok
        ? {
            status: "ok",
            data: peers.data && peers.data.peers && typeof peers.data.peers === "object"
              ? Object.entries(peers.data.peers).map(([key, value]) => ({ id: key, ...value }))
              : []
          }
        : { status: "failed", error: peers.error || "peers-unavailable" },
      meta: {
        status: "ok",
        data: {
          hash,
          infohash_v1: properties.data.infohash_v1 || "",
          infohash_v2: properties.data.infohash_v2 || "",
          save_path: properties.data.save_path || "",
          download_path: properties.data.download_path || "",
          created_by: properties.data.created_by || "",
          comment: properties.data.comment || "",
          creation_date: properties.data.creation_date || 0,
          completion_date: properties.data.completion_date || 0,
          addition_date: properties.data.addition_date || 0
        }
      },
      quickActions: {
        status: "deferred",
        message: "Read-only in this round. Write operations are deferred."
      }
    };

    const forcedFailSection = (process.env.QBT_DEBUG_DETAILS_FAIL_SECTION || "").trim();
    if (forcedFailSection && sections[forcedFailSection] && sections[forcedFailSection].status === "ok") {
      sections[forcedFailSection] = {
        status: "failed",
        error: `forced-failure-${forcedFailSection}`
      };
    }

    return {
      ok: true,
      notFound: false,
      summary: mergedSummary,
      sections
    };
  }
}

module.exports = {
  QBWebUIClient
};
