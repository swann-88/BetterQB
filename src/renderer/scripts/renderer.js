import { createStore } from "./modules/store.js";
import { createInitialState, isBackendReady } from "./modules/state-model.js";
import { createActions } from "./modules/actions.js";
import { createRenderer } from "./modules/render.js";
import { resolveVisibleScope } from "./modules/visible-scope.js";
import {
  SETTINGS_BINDINGS,
  createPreferencePatchAsync,
  resolveBindingAvailability,
  SETTING_BINDING_STATE
} from "./modules/settings-mapping.js";

const bridge = window.desktopBridge;
const store = createStore(createInitialState({ preloadAvailable: Boolean(bridge && bridge.available) }));
const actions = createActions(store);
const renderer = createRenderer(store);
let pendingTorrentFile = null;
let wasBackendReady = false;
let feedbackTimers = {
  main: null,
  details: null,
  add: null,
  settings: null
};
let detailsRefreshTimer = null;

function resolveDocumentLocale(preferences) {
  return "zh-CN";
}

function syncDocumentLocale(preferences) {
  document.documentElement.lang = resolveDocumentLocale(preferences);
}

function clearTimer(key) {
  if (feedbackTimers[key]) {
    clearTimeout(feedbackTimers[key]);
    feedbackTimers[key] = null;
  }
}

function scheduleFeedbackClear(key, clearFn, ms = 3200) {
  clearTimer(key);
  feedbackTimers[key] = setTimeout(() => {
    clearFn();
    feedbackTimers[key] = null;
  }, ms);
}

function scheduleDetailsRefresh(hash, delayMs = 240) {
  if (!hash) {
    return;
  }
  if (detailsRefreshTimer) {
    clearTimeout(detailsRefreshTimer);
  }
  detailsRefreshTimer = setTimeout(() => {
    detailsRefreshTimer = null;
    void requestDetailsForTorrent(hash);
  }, delayMs);
}

function isLikelyMagnetOrUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  return /^magnet:\?/i.test(text) || /^https?:\/\//i.test(text);
}

async function toBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const part = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...part);
  }
  return btoa(binary);
}

async function requestDetailsForTorrent(torrentId, options = {}) {
  const { forceOpen = false } = options;
  const state = store.getState();
  const alreadyOpenSameTorrent =
    state.layers.level15 === "torrent-details" &&
    state.sheets.detailsTorrentId === torrentId;

  if (forceOpen || !alreadyOpenSameTorrent) {
    actions.openDetailsSheet(torrentId);
  }

  if (!bridge || typeof bridge.getTorrentDetails !== "function") {
    actions.applyTorrentDetails({ ok: false, error: "details-api-unavailable" }, torrentId);
    return;
  }

  try {
    const payload = await bridge.getTorrentDetails(torrentId);
    actions.applyTorrentDetails(payload, torrentId);
  } catch (error) {
    actions.applyTorrentDetails(
      { ok: false, error: error && error.message ? error.message : "details-request-failed" },
      torrentId
    );
  }
}

async function requestDetailsAction(actionName) {
  const state = store.getState();
  const hash = state.sheets.detailsTorrentId;
  if (!hash) {
    actions.setDetailsActionError("未选择任务。");
    return;
  }

  if (!isBackendReady(state)) {
    actions.setDetailsActionError("后端离线。");
    return;
  }

  if (!bridge || typeof bridge.runDetailsAction !== "function") {
    actions.setDetailsActionError("详情操作接口不可用。");
    return;
  }

  actions.setDetailsActionBusy(actionName, true);
  try {
    const result = await bridge.runDetailsAction({
      hash,
      action: actionName
    });

    if (!result || !result.ok) {
      if (result && result.listSnapshot) {
        actions.applyTorrentList(result.listSnapshot);
      }
      actions.setDetailsActionError((result && result.error) || "详情操作失败。");
      scheduleFeedbackClear("details", () => actions.clearDetailsActionFeedback());
      return;
    }

    if (result.listSnapshot) {
      actions.applyTorrentList(result.listSnapshot);
    }
    if (result.details) {
      actions.applyTorrentDetails(result.details, hash);
    }

    const labelMap = {
      start: "任务已启动。",
      pause: "任务已暂停。",
      recheck: "已加入强制校验队列。",
      "toggle-sequential": "顺序下载已切换。",
      "toggle-firstlast": "首尾分片优先已切换。"
    };
    actions.setDetailsActionSuccess(labelMap[actionName] || "Action completed.");
    scheduleFeedbackClear("details", () => actions.clearDetailsActionFeedback());
  } catch (error) {
    actions.setDetailsActionError(error && error.message ? error.message : "详情操作失败。");
    scheduleFeedbackClear("details", () => actions.clearDetailsActionFeedback());
  }
}

async function requestReconnect() {
  if (!bridge || typeof bridge.retryLifecycle !== "function") {
    actions.setBackendActionError("重连接口不可用。");
    return;
  }

  actions.setReconnectRequested();
  try {
    const snapshot = await bridge.retryLifecycle();
    actions.applyBackendLifecycle(snapshot);
  } catch (error) {
    actions.setBackendActionError(error && error.message ? error.message : "重连失败。");
  }
}

async function requestTorrentListRefresh() {
  if (!bridge || typeof bridge.refreshTorrents !== "function") {
    actions.setBackendActionError("任务列表刷新接口不可用。");
    return;
  }

  actions.setTorrentListLoading();
  try {
    const payload = await bridge.refreshTorrents();
    actions.applyTorrentList(payload);
  } catch (error) {
    actions.setBackendActionError(error && error.message ? error.message : "任务列表刷新失败。");
  }
}

async function requestLocate() {
  if (!bridge || typeof bridge.locateBackendExecutable !== "function") {
    actions.setBackendActionError("定位接口不可用。");
    return;
  }

  actions.setLocateRequested();
  try {
    const result = await bridge.locateBackendExecutable();
    if (!result || result.canceled) {
      return;
    }

    if (!result.ok) {
      actions.setBackendActionError(result.error || "定位失败。");
      return;
    }

    if (result.snapshot) {
      actions.applyBackendLifecycle(result.snapshot);
    }
  } catch (error) {
    actions.setBackendActionError(error && error.message ? error.message : "定位操作失败。");
  }
}

function getSettingBinding(settingId) {
  return SETTINGS_BINDINGS.find((item) => item.id === settingId);
}

function formatSettingsUpdateError(errorCode) {
  const code = String(errorCode || "");
  const map = {
    "invalid-rate-input": "速率无效，请输入数字（KiB/s），或输入 0 表示不限速。",
    "invalid-number-input": "数字值无效。",
    "invalid-float-input": "小数值无效。",
    "number-below-min": "低于允许最小值。",
    "number-above-max": "高于允许最大值。",
    "float-above-max": "高于允许最大值。",
    "empty-path-not-allowed": "路径不能为空。",
    "empty-text-not-allowed": "文本不能为空。",
    "prompt-unavailable": "Value editor unavailable in current runtime.",
    "prompt-failed": "Value editor failed to open.",
    "editor-failed": "Value editor failed to open."
  };
  return map[code] || code || "Invalid setting update.";
}

function requestSettingsValueInput({ message, initialValue, binding }) {
  return new Promise((resolve) => {
    const host = document.body;
    if (!host) {
      resolve({ ok: false, error: "editor-failed" });
      return;
    }

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "1200";
    overlay.style.background = "rgba(15, 23, 42, 0.32)";
    overlay.style.display = "grid";
    overlay.style.placeItems = "center";
    overlay.style.backdropFilter = "blur(2px)";

    const panel = document.createElement("div");
    panel.style.width = "min(440px, calc(100vw - 24px))";
    panel.style.background = "#ffffff";
    panel.style.border = "1px solid #d8dee6";
    panel.style.borderRadius = "12px";
    panel.style.padding = "14px";
    panel.style.display = "grid";
    panel.style.gap = "10px";
    panel.style.boxShadow = "0 18px 32px rgba(15, 23, 42, 0.18)";

    const title = document.createElement("div");
    title.textContent = message || (binding && binding.label) || "Edit value";
    title.style.fontSize = "14px";
    title.style.fontWeight = "600";
    title.style.color = "#2f4257";

    const input = document.createElement("input");
    input.type = "text";
    input.value = String(initialValue ?? "");
    input.style.height = "34px";
    input.style.border = "1px solid #cad5e0";
    input.style.borderRadius = "8px";
    input.style.padding = "0 10px";
    input.style.fontSize = "14px";
    input.style.color = "#33475b";
    input.style.background = "#f8fafc";

    const foot = document.createElement("div");
    foot.style.display = "flex";
    foot.style.justifyContent = "flex-end";
    foot.style.gap = "8px";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.minHeight = "30px";
    cancel.style.padding = "0 10px";
    cancel.style.borderRadius = "8px";
    cancel.style.border = "1px solid #cad5e0";
    cancel.style.background = "#f4f7fb";
    cancel.style.color = "#4d6075";

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save";
    save.style.minHeight = "30px";
    save.style.padding = "0 12px";
    save.style.borderRadius = "8px";
    save.style.border = "1px solid #2a74e5";
    save.style.background = "#2a74e5";
    save.style.color = "#fff";

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    cancel.addEventListener("click", () => cleanup({ ok: false, canceled: true }));
    save.addEventListener("click", () => cleanup({ ok: true, value: input.value }));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        cleanup({ ok: false, canceled: true });
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        cleanup({ ok: true, value: input.value });
      } else if (event.key === "Escape") {
        event.preventDefault();
        cleanup({ ok: false, canceled: true });
      }
    });

    foot.append(cancel, save);
    panel.append(title, input, foot);
    overlay.append(panel);
    host.append(overlay);
    input.focus();
    input.select();
  });
}

async function requestSettingsPathInput({ message, initialValue, binding }) {
  if (bridge && typeof bridge.pickDirectory === "function") {
    try {
      const picked = await bridge.pickDirectory({
        title: message || `Set ${binding && binding.label ? binding.label : "folder"}`,
        buttonLabel: "Use this folder",
        defaultPath: String(initialValue || "")
      });

      if (picked && picked.ok && picked.path) {
        return {
          ok: true,
          value: picked.path
        };
      }

      if (picked && picked.canceled) {
        return {
          ok: false,
          canceled: true
        };
      }
    } catch {
      // Fallback to in-app editor below.
    }
  }

  return requestSettingsValueInput({ message, initialValue, binding });
}

async function requestSettingsPreferences() {
  const state = store.getState();
  if (!isBackendReady(state)) {
    actions.setSettingsError("Backend offline. Cannot load preferences.");
    scheduleFeedbackClear("settings", () => actions.clearSettingsFeedback(), 3600);
    return;
  }

  if (!bridge || typeof bridge.getSettingsPreferences !== "function") {
    actions.setSettingsError("Settings preferences API unavailable.");
    scheduleFeedbackClear("settings", () => actions.clearSettingsFeedback(), 3600);
    return;
  }

  actions.setSettingsLoading(true);
  try {
    const result = await bridge.getSettingsPreferences();
    if (!result || !result.ok) {
      actions.setSettingsError((result && result.error) || "Preferences fetch failed.");
      scheduleFeedbackClear("settings", () => actions.clearSettingsFeedback(), 3600);
      return;
    }
    const preferences = result.preferences || {};
    actions.applySettingsPreferences(preferences);
    syncDocumentLocale(preferences);
  } catch (error) {
    actions.setSettingsError(error && error.message ? error.message : "Preferences fetch failed.");
    scheduleFeedbackClear("settings", () => actions.clearSettingsFeedback(), 3600);
  }
}

async function requestSettingsUpdate(settingId) {
  const state = store.getState();
  if (!isBackendReady(state)) {
    actions.setSettingsError("Backend offline. Cannot update setting.");
    scheduleFeedbackClear("settings", () => actions.clearSettingsFeedback(), 3600);
    return;
  }

  const binding = getSettingBinding(settingId);
  if (!binding) {
    actions.setSettingsError("Unsupported setting row.");
    scheduleFeedbackClear("settings", () => actions.clearSettingsFeedback(), 3600);
    return;
  }

  const availability = resolveBindingAvailability(binding, state.settings.preferences || {});
  if (availability !== SETTING_BINDING_STATE.FULL) {
    const message = availability === SETTING_BINDING_STATE.READ_ONLY
      ? "This setting is read-only in this round."
      : availability === SETTING_BINDING_STATE.DEFERRED
        ? "This setting is deferred in this round."
        : "This setting is unsupported by the current qB version.";
    actions.setSettingsError(message);
    scheduleFeedbackClear("settings", () => actions.clearSettingsFeedback(), 3600);
    return;
  }

  const currentValue = binding.read(state.settings.preferences || {});
  const inputRequester = binding.type === "path" ? requestSettingsPathInput : requestSettingsValueInput;
  const update = await createPreferencePatchAsync(binding, currentValue, inputRequester, {
    preferences: state.settings.preferences || {}
  });
  if (!update.ok) {
    if (!update.canceled) {
      actions.setSettingsError(formatSettingsUpdateError(update.error));
      scheduleFeedbackClear("settings", () => actions.clearSettingsFeedback(), 3600);
    }
    return;
  }

  if (!bridge || typeof bridge.updateSettingsPreferences !== "function") {
    actions.setSettingsError("Settings update API unavailable.");
    scheduleFeedbackClear("settings", () => actions.clearSettingsFeedback(), 3600);
    return;
  }

  actions.setSettingsUpdatePending(settingId);
  try {
    const result = await bridge.updateSettingsPreferences(update.patch);
    if (!result || !result.ok) {
      actions.setSettingsError((result && result.error) || "设置更新失败。");
      scheduleFeedbackClear("settings", () => actions.clearSettingsFeedback(), 3600);
      return;
    }
    const preferences = result.preferences || {};
    actions.applySettingsPreferences(preferences);
    syncDocumentLocale(preferences);
    actions.setSettingsSuccess("Preference saved.");
    scheduleFeedbackClear("settings", () => actions.clearSettingsFeedback(), 2800);
  } catch (error) {
    actions.setSettingsError(error && error.message ? error.message : "设置更新失败。");
    scheduleFeedbackClear("settings", () => actions.clearSettingsFeedback(), 3600);
  }
}

async function requestVisibleScopeAction(actionName) {
  const state = store.getState();
  if (!isBackendReady(state)) {
    actions.setMainActionError("后端离线。");
    scheduleFeedbackClear("main", () => actions.clearMainActionFeedback());
    return;
  }

  if (!bridge || typeof bridge.applyVisibleScopeAction !== "function") {
    actions.setMainActionError("Visible-scope action API unavailable.");
    scheduleFeedbackClear("main", () => actions.clearMainActionFeedback());
    return;
  }

  const scope = resolveVisibleScope(state);
  actions.setMainActionScope(scope);
  if (!scope.hashes.length) {
    actions.setMainActionError("No visible items in the current scope.");
    scheduleFeedbackClear("main", () => actions.clearMainActionFeedback());
    return;
  }

  actions.setMainActionBusy(actionName, true);
  try {
    const result = await bridge.applyVisibleScopeAction({
      action: actionName,
      hashes: scope.hashes,
      scope
    });

    actions.setMainActionBusy(actionName, false);
    if (!result || !result.ok) {
      actions.setMainActionError((result && result.error) || `${actionName} failed.`);
      scheduleFeedbackClear("main", () => actions.clearMainActionFeedback());
      return;
    }

    if (result.listSnapshot) {
      actions.applyTorrentList(result.listSnapshot);
    }
    actions.setMainActionSuccess(
      result.noOp
        ? "No visible items to update."
        : `${actionName === "start" ? "Started" : "Paused"} ${result.affectedCount} visible item(s).`
    );
    scheduleFeedbackClear("main", () => actions.clearMainActionFeedback());
  } catch (error) {
    actions.setMainActionBusy(actionName, false);
    actions.setMainActionError(error && error.message ? error.message : `${actionName} action failed.`);
    scheduleFeedbackClear("main", () => actions.clearMainActionFeedback());
  }
}

async function requestToggleSpeedMode() {
  const state = store.getState();
  if (!isBackendReady(state)) {
    actions.setMainActionError("后端离线。");
    scheduleFeedbackClear("main", () => actions.clearMainActionFeedback());
    return;
  }

  if (!bridge || typeof bridge.toggleSpeedMode !== "function") {
    actions.setMainActionError("Speed mode API unavailable.");
    scheduleFeedbackClear("main", () => actions.clearMainActionFeedback());
    return;
  }

  actions.setSpeedModeLoading(true);
  try {
    const result = await bridge.toggleSpeedMode();
    actions.setSpeedModeLoading(false);
    if (!result || !result.ok) {
      actions.setMainActionError((result && result.error) || "Speed mode toggle failed.");
      scheduleFeedbackClear("main", () => actions.clearMainActionFeedback());
      return;
    }

    actions.setSpeedModeEnabled(Boolean(result.enabled));
    actions.setMainActionSuccess(`Alternative speed mode ${result.enabled ? "enabled" : "disabled"}.`);
    scheduleFeedbackClear("main", () => actions.clearMainActionFeedback());
  } catch (error) {
    actions.setSpeedModeLoading(false);
    actions.setMainActionError(error && error.message ? error.message : "Speed mode toggle failed.");
    scheduleFeedbackClear("main", () => actions.clearMainActionFeedback());
  }
}

async function loadAddConfirmationContext() {
  if (!bridge || typeof bridge.getAddContext !== "function") {
    actions.setAddConfirmationContext({
      savePathState: "pending",
      note: "Add context API unavailable."
    });
    return;
  }

  actions.setAddConfirmationLoading();
  try {
    const context = await bridge.getAddContext();
    if (!context || !context.ok) {
      actions.setAddConfirmationContext({
        savePathState: context && context.connected ? "pending" : "unavailable",
        savePath: "",
        note: (context && context.note) || "Unable to load save path."
      });
      return;
    }

    actions.setAddConfirmationContext({
      savePathState: context.savePathState || "ready",
      savePath: context.savePath || "",
      note: context.note || ""
    });
  } catch (error) {
    actions.setAddConfirmationContext({
      savePathState: "pending",
      savePath: "",
      note: error && error.message ? error.message : "Unable to load save path."
    });
  }
}

async function requestConfirmAdd() {
  const state = store.getState();
  const add = state.sheets.add;
  if (!isBackendReady(state)) {
    actions.setAddError("Backend is not connected.");
    scheduleFeedbackClear("add", () => actions.clearAddFeedback());
    return;
  }

  if (!bridge || typeof bridge.addTorrent !== "function") {
    actions.setAddError("Add API unavailable.");
    scheduleFeedbackClear("add", () => actions.clearAddFeedback());
    return;
  }

  const sourceType = add.fileName ? "file" : add.magnet.trim() ? "magnet" : null;
  if (!sourceType) {
    actions.setAddError("No add source provided.");
    scheduleFeedbackClear("add", () => actions.clearAddFeedback());
    return;
  }

  if (sourceType === "magnet" && !isLikelyMagnetOrUrl(add.magnet)) {
    actions.setAddError("Invalid magnet/URL. Use magnet:? or http(s)://.");
    scheduleFeedbackClear("add", () => actions.clearAddFeedback());
    return;
  }

  if (sourceType === "file" && !pendingTorrentFile) {
    actions.setAddError("Selected .torrent file is unavailable. Please choose again.");
    scheduleFeedbackClear("add", () => actions.clearAddFeedback());
    return;
  }

  const payload = {
    sourceType,
    savePath: add.confirmation && add.confirmation.savePathState === "ready"
      ? add.confirmation.savePath
      : ""
  };

  if (sourceType === "magnet") {
    payload.url = add.magnet.trim();
  } else {
    payload.fileName = pendingTorrentFile.name;
    payload.mimeType = pendingTorrentFile.mimeType || "application/x-bittorrent";
    payload.contentBase64 = pendingTorrentFile.contentBase64;
    payload.fileSize = pendingTorrentFile.size;
  }

  actions.setAddSubmitting(true);
  try {
    const result = await bridge.addTorrent(payload);
    if (!result || !result.ok) {
      actions.setAddSubmitting(false);
      actions.setAddError((result && result.error) || "qB add submission failed.");
      scheduleFeedbackClear("add", () => actions.clearAddFeedback());
      return;
    }

    pendingTorrentFile = null;
    actions.confirmAddTorrentSuccess({
      selectedId: result.selectedId || null,
      message: result.message || ""
    });
    actions.setMainActionSuccess(result.message || "Add accepted.");
    scheduleFeedbackClear("main", () => actions.clearMainActionFeedback());
  } catch (error) {
    actions.setAddSubmitting(false);
    actions.setAddError(error && error.message ? error.message : "qB add request failed.");
    scheduleFeedbackClear("add", () => actions.clearAddFeedback());
  }
}

async function requestAdvanceAdd() {
  const state = store.getState();
  const add = state.sheets.add;
  const hasFile = Boolean(add.fileName);
  const hasMagnet = Boolean(add.magnet.trim());

  if (!hasFile && !hasMagnet) {
    actions.setAddError("Provide a magnet/URL or choose a .torrent file first.");
    scheduleFeedbackClear("add", () => actions.clearAddFeedback());
    return;
  }

  if (!hasFile && hasMagnet && !isLikelyMagnetOrUrl(add.magnet)) {
    actions.setAddError("Invalid magnet/URL. Use magnet:? or http(s)://.");
    scheduleFeedbackClear("add", () => actions.clearAddFeedback());
    return;
  }

  if (hasFile && !pendingTorrentFile) {
    actions.setAddError("Selected .torrent file is unreadable. Please choose again.");
    scheduleFeedbackClear("add", () => actions.clearAddFeedback());
    return;
  }

  actions.advanceAddSheet();
  await loadAddConfirmationContext();
}

async function captureTorrentFile(file) {
  if (!file) {
    return;
  }

  if (!/\.torrent$/i.test(file.name || "")) {
    actions.setAddError("Unsupported file. Please choose a .torrent file.");
    scheduleFeedbackClear("add", () => actions.clearAddFeedback());
    return;
  }

  if (!file.size) {
    actions.setAddError("The selected file is empty.");
    scheduleFeedbackClear("add", () => actions.clearAddFeedback());
    return;
  }

  try {
    const contentBase64 = await toBase64(file);
    pendingTorrentFile = {
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/x-bittorrent",
      contentBase64
    };
    actions.setAddFile(file.name, file.size);
  } catch (error) {
    pendingTorrentFile = null;
    actions.setAddError(error && error.message ? error.message : "Unable to read .torrent file.");
    scheduleFeedbackClear("add", () => actions.clearAddFeedback());
  }
}

async function setDebugScenario(scenario) {
  if (!bridge || typeof bridge.setDebugScenario !== "function") {
    return;
  }

  try {
    const debugInfo = await bridge.setDebugScenario(scenario);
    actions.setDebugInfo(debugInfo);
    await requestReconnect();
  } catch (error) {
    actions.setBackendActionError(error && error.message ? error.message : "设置调试场景失败。");
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  document.documentElement.lang = "zh-CN";

  renderer.mount(document.getElementById("app-root"));
  actions.markShellPreloaded();

  if (bridge && bridge.versions) {
    actions.setRuntimeInfo(
      `Electron ${bridge.versions.electron} | Chromium ${bridge.versions.chrome} | Node ${bridge.versions.node}`
    );
  }

  if (bridge && typeof bridge.onAppBooted === "function") {
    bridge.onAppBooted((payload) => {
      actions.markAppBooted(payload && payload.bootedAt ? payload.bootedAt : "unknown");
    });
  } else {
    actions.markAppBooted("mock");
  }

  if (bridge && typeof bridge.onLifecycleState === "function") {
    bridge.onLifecycleState((payload) => {
      const readyBefore = wasBackendReady;
      actions.applyBackendLifecycle(payload);
      const readyNow = isBackendReady(store.getState());
      wasBackendReady = readyNow;

      if (!readyBefore && readyNow) {
        if (store.getState().layers.level2 === "settings") {
          void requestSettingsPreferences();
        }
        if (store.getState().layers.level15 === "torrent-details" && store.getState().sheets.detailsTorrentId) {
          void requestDetailsForTorrent(store.getState().sheets.detailsTorrentId);
        }
      }
    });
  }

  if (bridge && typeof bridge.onTorrentList === "function") {
    bridge.onTorrentList((payload) => {
      actions.applyTorrentList(payload);
      const latest = store.getState();
      if (
        latest.layers.level15 === "torrent-details" &&
        latest.sheets.detailsTorrentId &&
        isBackendReady(latest) &&
        latest.sheets.details.loadState !== "loading"
      ) {
        scheduleDetailsRefresh(latest.sheets.detailsTorrentId);
      }
    });
  }

  if (bridge && typeof bridge.getLifecycleStatus === "function") {
    try {
      const snapshot = await bridge.getLifecycleStatus();
      actions.applyBackendLifecycle(snapshot);
      wasBackendReady = isBackendReady(store.getState());
    } catch {
      actions.setBackendActionError("获取初始生命周期状态失败。");
    }
  }

  if (bridge && typeof bridge.getSpeedMode === "function") {
    try {
      const speedMode = await bridge.getSpeedMode();
      if (speedMode && speedMode.ok) {
        actions.setSpeedModeEnabled(Boolean(speedMode.enabled));
      }
    } catch {
      actions.setMainActionError("读取限速模式状态失败。");
    }
  }

  if (bridge && typeof bridge.getTorrents === "function") {
    try {
      const listPayload = await bridge.getTorrents();
      actions.applyTorrentList(listPayload);
    } catch {
      actions.setBackendActionError("获取初始任务列表快照失败。");
    }
  }

  if (bridge && typeof bridge.getDebugInfo === "function") {
    try {
      const debugInfo = await bridge.getDebugInfo();
      actions.setDebugInfo(debugInfo);
    } catch {
      actions.setDebugInfo({ enabled: false, scenario: "none" });
    }
  }

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      actions.closeContextMenu();
      return;
    }

    const { action } = actionTarget.dataset;
    const torrentId = actionTarget.dataset.torrentId;

    switch (action) {
      case "toggle-debug-panel":
        renderer.toggleDebugPanel();
        break;
      case "enter-app":
        actions.enterApp();
        break;
      case "select-filter":
        actions.selectPrimaryFilter(actionTarget.dataset.filter);
        break;
      case "open-settings":
        actions.openSettings();
        requestSettingsPreferences();
        break;
      case "close-settings":
        actions.closeSettings();
        break;
      case "settings-back":
        actions.settingsBack();
        break;
      case "settings-forward":
        actions.settingsForward();
        break;
      case "select-settings":
        actions.selectSettingsCategory(actionTarget.dataset.category, true);
        break;
      case "settings-update":
        requestSettingsUpdate(actionTarget.dataset.settingId || "");
        break;
      case "toggle-speed-mode":
        requestToggleSpeedMode();
        break;
      case "toggle-speed-drawer":
        actions.toggleSpeedDrawer();
        break;
      case "open-add-sheet":
        pendingTorrentFile = null;
        actions.openAddSheet();
        break;
      case "close-sheet":
        pendingTorrentFile = null;
        actions.closeSheet();
        break;
      case "open-details":
        requestDetailsForTorrent(torrentId, { forceOpen: true });
        break;
      case "details-start":
        requestDetailsAction("start");
        break;
      case "details-pause":
        requestDetailsAction("pause");
        break;
      case "details-recheck":
        requestDetailsAction("recheck");
        break;
      case "details-toggle-sequential":
        requestDetailsAction("toggle-sequential");
        break;
      case "details-toggle-firstlast":
        requestDetailsAction("toggle-firstlast");
        break;
      case "start-visible":
        requestVisibleScopeAction("start");
        break;
      case "pause-visible":
        requestVisibleScopeAction("pause");
        break;
      case "reconnect":
        requestReconnect();
        break;
      case "locate-qb":
        requestLocate();
        break;
      case "refresh-list":
        requestTorrentListRefresh();
        break;
      case "set-debug-scenario":
        setDebugScenario(actionTarget.dataset.scenario || "none");
        break;
      case "add-next":
        requestAdvanceAdd();
        break;
      case "add-back":
        actions.returnToAddInput();
        break;
      case "confirm-add":
        requestConfirmAdd();
        break;
      case "choose-file":
        document.getElementById("torrent-file-input").click();
        break;
      case "clear-magnet":
        actions.updateAddMagnet("");
        if (!store.getState().sheets.add.fileName) {
          pendingTorrentFile = null;
        }
        break;
      case "pick-search-result":
        actions.pickSearchResult(torrentId);
        break;
      case "jump-details-section":
        renderer.jumpDetailsSection(actionTarget.dataset.anchor || "");
        break;
      default:
        break;
    }
  });

  document.addEventListener("dblclick", (event) => {
    const row = event.target.closest("[data-row-id]");
    if (!row || store.getState().main.mode !== "list" || !isBackendReady(store.getState())) {
      return;
    }
    requestDetailsForTorrent(row.dataset.rowId);
  });

  document.addEventListener("contextmenu", (event) => {
    const row = event.target.closest("[data-row-id]");
    if (!row || store.getState().main.mode !== "list" || !isBackendReady(store.getState())) {
      return;
    }

    event.preventDefault();
    actions.openContextMenu(row.dataset.rowId, event.clientX, event.clientY);
  });

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      renderer.toggleDebugPanel();
      return;
    }

    if (event.key === "Escape") {
      actions.closeContextMenu();
      actions.closeSheet();
      return;
    }

    if (event.key === "F9" && store.getState().debug.hooksEnabled) {
      setDebugScenario("force-path-missing");
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "main-search") {
      actions.updateMainSearch(event.target.value);
    }

    if (event.target.id === "settings-search") {
      actions.updateSettingsSearch(event.target.value);
    }

    if (event.target.id === "magnet-input") {
      actions.updateAddMagnet(event.target.value);
    }
  });

  document.addEventListener("focusin", (event) => {
    if (event.target.id === "main-search") {
      actions.setMainSearchFocus(true);
    }
  });

  document.addEventListener("focusout", (event) => {
    if (event.target.id === "main-search") {
      actions.setMainSearchFocus(false);
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.id !== "torrent-file-input") {
      return;
    }

    const file = event.target.files && event.target.files[0];
    if (file) {
      void captureTorrentFile(file);
    }

    event.target.value = "";
  });

  document.addEventListener("dragover", (event) => {
    const dropZone = event.target.closest("[data-drop-zone='torrent']");
    if (!dropZone) {
      return;
    }

    event.preventDefault();
    dropZone.classList.add("dragging");
  });

  document.addEventListener("dragleave", (event) => {
    const dropZone = event.target.closest("[data-drop-zone='torrent']");
    if (!dropZone) {
      return;
    }

    dropZone.classList.remove("dragging");
  });

  document.addEventListener("drop", (event) => {
    const dropZone = event.target.closest("[data-drop-zone='torrent']");
    if (!dropZone) {
      return;
    }

    event.preventDefault();
    dropZone.classList.remove("dragging");

    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) {
      return;
    }

    void captureTorrentFile(file);
  });

  document.addEventListener("mousedown", (event) => {
    const row = event.target.closest("[data-row-id]");
    if (!row || store.getState().main.mode !== "list" || !isBackendReady(store.getState())) {
      return;
    }

    if (event.target.closest("[data-action='open-details']")) {
      return;
    }

    actions.selectTorrent(row.dataset.rowId, {
      ctrl: event.ctrlKey || event.metaKey,
      shift: event.shiftKey
    });
  });
});

