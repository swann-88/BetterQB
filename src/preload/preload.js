const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", {
  available: true,
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  onAppBooted: (callback) => {
    if (typeof callback !== "function") {
      return;
    }

    ipcRenderer.on("app:booted", (_event, payload) => {
      callback(payload);
    });
  },
  getLifecycleStatus: () => ipcRenderer.invoke("backend:get-status"),
  resolveBackendSource: (payload) => ipcRenderer.invoke("backend:resolve-source", payload),
  retryLifecycle: () => ipcRenderer.invoke("backend:retry"),
  getTorrents: () => ipcRenderer.invoke("backend:get-torrents"),
  refreshTorrents: () => ipcRenderer.invoke("backend:refresh-torrents"),
  applyVisibleScopeAction: (payload) => ipcRenderer.invoke("backend:apply-visible-scope-action", payload),
  getSpeedMode: () => ipcRenderer.invoke("backend:get-speed-mode"),
  toggleSpeedMode: () => ipcRenderer.invoke("backend:toggle-speed-mode"),
  getTorrentDetails: (hash) => ipcRenderer.invoke("backend:get-torrent-details", hash),
  runDetailsAction: (payload) => ipcRenderer.invoke("backend:details-action", payload),
  getAddContext: () => ipcRenderer.invoke("backend:get-add-context"),
  addTorrent: (payload) => ipcRenderer.invoke("backend:add-torrent", payload),
  getSettingsPreferences: () => ipcRenderer.invoke("backend:get-settings-preferences"),
  updateSettingsPreferences: (patch) => ipcRenderer.invoke("backend:update-settings-preferences", patch),
  locateBackendExecutable: () => ipcRenderer.invoke("backend:locate"),
  pickDirectory: (payload) => ipcRenderer.invoke("backend:pick-directory", payload),
  getDebugInfo: () => ipcRenderer.invoke("backend:debug:get-info"),
  setDebugScenario: (scenario) => ipcRenderer.invoke("backend:debug:set-scenario", scenario),
  onLifecycleState: (callback) => {
    if (typeof callback !== "function") {
      return;
    }

    ipcRenderer.on("backend:lifecycle", (_event, payload) => {
      callback(payload);
    });
  },
  onTorrentList: (callback) => {
    if (typeof callback !== "function") {
      return;
    }

    ipcRenderer.on("backend:torrent-list", (_event, payload) => {
      callback(payload);
    });
  }
});
