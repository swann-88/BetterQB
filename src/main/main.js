const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");
const { createBackendStack } = require("./backend");

const debugHooksEnabled = process.env.QBT_ENABLE_DEBUG_HOOKS === "1";
let backendStack = null;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#0f1419",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#eef1f5",
      symbolColor: "#3b4e62",
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    console.log("[main] renderer did-finish-load");
    mainWindow.webContents.send("app:booted", {
      bootedAt: new Date().toISOString()
    });
    if (backendStack) {
      mainWindow.webContents.send("backend:lifecycle", backendStack.controller.getSnapshot());
      mainWindow.webContents.send("backend:torrent-list", backendStack.controller.getTorrentListSnapshot());
    }

    if (process.env.ELECTRON_SMOKE_TEST === "1") {
      console.log("[main] smoke test passed, quitting");
      setTimeout(() => app.quit(), 300);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`[main] renderer failed to load: ${code} ${description}`);
  });

  mainWindow.on("ready-to-show", () => {
    console.log("[main] window ready-to-show");
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    backendStack = createBackendStack(app);
    backendStack.registerIpc(debugHooksEnabled);
    backendStack.controller.on("state", (snapshot) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("backend:lifecycle", snapshot);
      }
    });
    backendStack.controller.on("torrent-list", (payload) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("backend:torrent-list", payload);
      }
    });

    backendStack.controller.startup().catch((error) => {
      console.error("[main] backend startup failed", error);
    });

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
