const { BrowserWindow, dialog, ipcMain } = require("electron");

function registerBackendIpc({ controller, debugHooksEnabled }) {
  ipcMain.handle("backend:get-status", () => {
    return controller.getSnapshot();
  });

  ipcMain.handle("backend:resolve-source", (_event, payload) => {
    const manualPath = payload && typeof payload.manualPath === "string" ? payload.manualPath : "";
    const mode = payload && typeof payload.mode === "string" ? payload.mode : "";
    return controller.inspectSourceResolution(manualPath, mode);
  });

  ipcMain.handle("backend:retry", async () => {
    return controller.reconnect();
  });

  ipcMain.handle("backend:get-torrents", async () => {
    return controller.getTorrentListSnapshot();
  });

  ipcMain.handle("backend:refresh-torrents", async () => {
    return controller.loadTorrentList();
  });

  ipcMain.handle("backend:apply-visible-scope-action", async (_event, payload) => {
    const action = payload && payload.action ? payload.action : "";
    const hashes = payload && Array.isArray(payload.hashes) ? payload.hashes : [];
    const scope = payload && payload.scope ? payload.scope : null;
    return controller.applyVisibleScopeAction(action, hashes, scope);
  });

  ipcMain.handle("backend:get-speed-mode", async () => {
    return controller.refreshSpeedMode();
  });

  ipcMain.handle("backend:toggle-speed-mode", async () => {
    return controller.toggleSpeedMode();
  });

  ipcMain.handle("backend:get-torrent-details", async (_event, hash) => {
    return controller.getTorrentDetails(hash);
  });

  ipcMain.handle("backend:details-action", async (_event, payload) => {
    const hash = payload && payload.hash ? payload.hash : "";
    const action = payload && payload.action ? payload.action : "";
    return controller.applyTorrentDetailsAction(hash, action);
  });

  ipcMain.handle("backend:get-add-context", async () => {
    return controller.getAddContext();
  });

  ipcMain.handle("backend:add-torrent", async (_event, payload) => {
    return controller.addTorrent(payload || {});
  });

  ipcMain.handle("backend:get-settings-preferences", async () => {
    return controller.getSettingsPreferences();
  });

  ipcMain.handle("backend:update-settings-preferences", async (_event, patch) => {
    return controller.updateSettingsPreferences(patch || {});
  });

  ipcMain.handle("backend:locate", async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(focusedWindow || undefined, {
      title: "Locate qBittorrent executable",
      buttonLabel: "Use this executable",
      properties: ["openFile"],
      filters: [{ name: "Executable", extensions: ["exe"] }]
    });

    if (result.canceled || !result.filePaths || !result.filePaths[0]) {
      return {
        ok: false,
        canceled: true
      };
    }

    const selectedPath = result.filePaths[0];
    if (!controller.isValidExecutablePath(selectedPath)) {
      return {
        ok: false,
        canceled: false,
        error: "Selected file is not a valid executable path."
      };
    }

    controller.rememberManualPath(selectedPath);
    const snapshot = await controller.connect(selectedPath);
    return {
      ok: true,
      canceled: false,
      snapshot
    };
  });

  ipcMain.handle("backend:pick-directory", async (_event, payload) => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const startPath = payload && typeof payload.defaultPath === "string" ? payload.defaultPath : "";
    const result = await dialog.showOpenDialog(focusedWindow || undefined, {
      title: (payload && payload.title) || "Choose folder",
      buttonLabel: (payload && payload.buttonLabel) || "Select folder",
      defaultPath: startPath || undefined,
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || !result.filePaths || !result.filePaths[0]) {
      return {
        ok: false,
        canceled: true
      };
    }

    return {
      ok: true,
      canceled: false,
      path: result.filePaths[0]
    };
  });

  ipcMain.handle("backend:debug:get-info", () => {
    return {
      enabled: debugHooksEnabled,
      scenario: controller.debugScenario || "none"
    };
  });

  ipcMain.handle("backend:debug:set-scenario", (_event, scenario) => {
    if (!debugHooksEnabled) {
      return {
        enabled: false,
        scenario: controller.debugScenario || "none"
      };
    }

    const next = controller.setDebugScenario(scenario);
    return {
      enabled: true,
      scenario: next
    };
  });
}

module.exports = {
  registerBackendIpc
};
