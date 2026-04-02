const { AppConfigStore } = require("./config-store");
const { BackendPathResolver } = require("./path-resolver");
const { BackendLauncher } = require("./launcher");
const { BackendRuntimeLayout } = require("./runtime-layout");
const { QBWebUIClient } = require("./qb-webui-client");
const { BackendReadinessChecker } = require("./readiness-checker");
const { BackendLifecycleController, STATES } = require("./lifecycle-controller");
const { registerBackendIpc } = require("./ipc");
const path = require("path");

function createBackendStack(app) {
  const runtimeLayout = new BackendRuntimeLayout(app, {
    getBundledPath: () => process.env.QBT_BUNDLED_PATH || ""
  });

  const bundledProbe = runtimeLayout.getBundledProbe();
  const packagedBundledPath = bundledProbe.executablePath || (app && app.isPackaged
    ? path.join(process.resourcesPath, "backend", "qbittorrent", "qbittorrent.exe")
    : "");

  const configStore = new AppConfigStore(app);
  const resolver = new BackendPathResolver(configStore, {
    getBundledPath: () => process.env.QBT_BUNDLED_PATH || packagedBundledPath,
    getBundledCandidates: () => [
      process.env.QBT_BUNDLED_PATH_ALT || "",
      process.env.QBT_RELEASE_BUNDLED_PATH || ""
    ],
    isPackaged: Boolean(app && app.isPackaged)
  });
  const launcher = new BackendLauncher();
  const qbWebUIClient = new QBWebUIClient(configStore, {
    requestTimeoutMs: Number(process.env.QBT_WEBUI_REQUEST_TIMEOUT_MS || "1800"),
    bootstrapTimeoutMs: Number(process.env.QBT_WEBUI_BOOTSTRAP_TIMEOUT_MS || "18000"),
    pollIntervalMs: Number(process.env.QBT_WEBUI_POLL_INTERVAL_MS || "1000")
  });
  const readinessChecker = new BackendReadinessChecker(qbWebUIClient);

  const controller = new BackendLifecycleController({
    configStore,
    resolver,
    launcher,
    runtimeLayout,
    readinessChecker,
    qbWebUIClient
  });

  return {
    controller,
    configStore,
    registerIpc(debugHooksEnabled) {
      registerBackendIpc({ controller, debugHooksEnabled });
    },
    STATES
  };
}

module.exports = {
  createBackendStack,
  STATES
};
