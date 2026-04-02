import { getFilteredTorrents, isBackendReady } from "./state-model.js";

function insertHistory(settings, nextCategory) {
  const left = settings.history.slice(0, settings.historyIndex + 1);
  left.push(nextCategory);
  return {
    ...settings,
    history: left,
    historyIndex: left.length - 1
  };
}

function nextModeFromState(state) {
  if (!isBackendReady(state)) {
    return "offline";
  }
  return state.main.searchQuery.trim() ? "search" : "list";
}

export function createActions(store) {
  return {
    markShellPreloaded() {
      store.setState((state) => ({
        ...state,
        preload: {
          ...state.preload,
          shellReady: true
        }
      }), "shell-preloaded");
    },

    setRuntimeInfo(runtimeText) {
      store.setState((state) => ({
        ...state,
        status: {
          ...state.status,
          runtime: runtimeText
        }
      }), "runtime-info");
    },

    markAppBooted(bootedAt) {
      store.setState((state) => ({
        ...state,
        status: {
          ...state.status,
          appBooted: true,
          bootedAt
        }
      }), "app-booted");
    },

    setDebugInfo(debugInfo) {
      if (!debugInfo) {
        return;
      }

      store.setState((state) => ({
        ...state,
        debug: {
          ...state.debug,
          hooksEnabled: Boolean(debugInfo.enabled),
          scenario: debugInfo.scenario || "none"
        }
      }), "debug-info");
    },

    applyBackendLifecycle(snapshot) {
      if (!snapshot) {
        return;
      }

      store.setState((state) => {
        const backend = {
          ...state.backend,
          ...snapshot,
          lifecycleState: snapshot.state || snapshot.lifecycleState || state.backend.lifecycleState
        };
        const connected = backend.lifecycleState === "backend-ready" && backend.connected;

        const next = {
          ...state,
          backend: {
            ...backend,
            connected
          },
          mainActions: {
            ...state.mainActions,
            speedModeEnabled: typeof snapshot.speedModeEnabled === "boolean"
              ? snapshot.speedModeEnabled
              : state.mainActions.speedModeEnabled
          },
          main: {
            ...state.main,
            mode: connected ? (state.main.searchQuery.trim() ? "search" : "list") : "offline",
            contextMenu: connected ? state.main.contextMenu : null,
            selectedIds: connected ? state.main.selectedIds : [],
            anchorId: connected ? state.main.anchorId : null
          },
          data: {
            ...state.data,
            listLoadState: snapshot.listLoadState || state.data.listLoadState,
            listLoadError: snapshot.listLoadError || (snapshot.listLoadState === "success" ? "" : state.data.listLoadError)
          }
        };

        if (!connected) {
          return {
            ...next,
            mainActions: {
              ...next.mainActions,
              busy: false,
              busyAction: "",
              speedModeLoading: false
            },
            sheets: {
              ...next.sheets,
              details: {
                ...next.sheets.details,
                actionBusy: false,
                actionName: ""
              },
              add: {
                ...next.sheets.add,
                submitting: false
              }
            },
            settings: {
              ...next.settings,
              updateState: next.settings.updateState === "pending" ? "failed" : next.settings.updateState,
              pendingId: next.settings.updateState === "pending" ? "" : next.settings.pendingId,
              lastError: next.settings.updateState === "pending" ? "Connection lost while saving." : next.settings.lastError
            }
          };
        }

        return next;
      }, "backend-lifecycle");
    },

    applyTorrentList(payload) {
      if (!payload) {
        return;
      }

      store.setState((state) => {
        const items = Array.isArray(payload.items) ? payload.items : [];
        const mapped = items.map((item) => ({
          id: item.hash || item.id || "",
          name: item.name || "Unnamed torrent",
          state: item.state || "unknown",
          progress: Number(item.progress || 0),
          size: Number(item.size || item.total_size || 0),
          downSpeed: Number(item.dlspeed || 0),
          upSpeed: Number(item.upspeed || 0),
          eta: Number(item.eta || -1),
          addedAt: Number(item.added_on || 0)
        }));
        const knownIds = new Set(mapped.map((item) => item.id).filter(Boolean));
        const selectedIds = state.main.selectedIds.filter((id) => knownIds.has(id));
        const anchorId = state.main.anchorId && knownIds.has(state.main.anchorId) ? state.main.anchorId : null;
        const detailsTarget = state.sheets.detailsTorrentId;
        const detailsMissing = Boolean(
          detailsTarget &&
            state.layers.level15 === "torrent-details" &&
            state.backend.connected &&
            !knownIds.has(detailsTarget)
        );

        return {
          ...state,
          main: {
            ...state.main,
            selectedIds,
            anchorId
          },
          sheets: {
            ...state.sheets,
            details: detailsMissing
              ? {
                  ...state.sheets.details,
                  loadState: "failed",
                  notFound: true,
                  error: "torrent-not-found",
                  actionBusy: false,
                  actionName: "",
                  actionError: "Torrent no longer exists in qBittorrent.",
                  actionSuccess: ""
                }
              : state.sheets.details
          },
          data: {
            ...state.data,
            torrents: mapped,
            source: "real",
            listLoadState: payload.state || state.data.listLoadState,
            listLoadError: payload.error || ""
          }
        };
      }, "apply-torrent-list");
    },

    setMainActionBusy(actionName, busy) {
      store.setState((state) => ({
        ...state,
        mainActions: {
          ...state.mainActions,
          busy: Boolean(busy),
          busyAction: busy ? actionName : "",
          lastError: busy ? "" : state.mainActions.lastError
        }
      }), "main-action-busy");
    },

    setMainActionError(message) {
      store.setState((state) => ({
        ...state,
        mainActions: {
          ...state.mainActions,
          lastError: message || "Action failed.",
          lastSuccess: ""
        }
      }), "main-action-error");
    },

    setMainActionSuccess(message) {
      store.setState((state) => ({
        ...state,
        mainActions: {
          ...state.mainActions,
          lastSuccess: message || "",
          lastError: ""
        }
      }), "main-action-success");
    },

    setMainActionScope(scope) {
      store.setState((state) => ({
        ...state,
        mainActions: {
          ...state.mainActions,
          lastScope: scope || null
        }
      }), "main-action-scope");
    },

    setSpeedModeLoading(loading) {
      store.setState((state) => ({
        ...state,
        mainActions: {
          ...state.mainActions,
          speedModeLoading: Boolean(loading)
        }
      }), "speed-mode-loading");
    },

    setSpeedModeEnabled(enabled) {
      store.setState((state) => ({
        ...state,
        mainActions: {
          ...state.mainActions,
          speedModeEnabled: Boolean(enabled)
        }
      }), "speed-mode-enabled");
    },

    enterApp() {
      store.setState((state) => ({
        ...state,
        layers: {
          ...state.layers,
          level0: "hidden"
        }
      }), "enter-app");
    },

    selectPrimaryFilter(filter) {
      store.setState((state) => ({
        ...state,
        main: {
          ...state.main,
          primaryFilter: filter,
          mode: isBackendReady(state) ? "list" : "offline",
          searchQuery: "",
          searchFocused: false,
          contextMenu: null
        }
      }), "select-primary-filter");
    },

    updateMainSearch(searchQuery) {
      store.setState((state) => ({
        ...state,
        main: {
          ...state.main,
          searchQuery,
          mode: isBackendReady(state) ? (searchQuery.trim().length > 0 ? "search" : "list") : "offline",
          contextMenu: null
        }
      }), "main-search-input");
    },

    setMainSearchFocus(searchFocused) {
      store.setState((state) => ({
        ...state,
        main: {
          ...state.main,
          searchFocused,
          mode: nextModeFromState(state)
        }
      }), "main-search-focus");
    },

    pickSearchResult(torrentId) {
      store.setState((state) => ({
        ...state,
        main: {
          ...state.main,
          primaryFilter: "All",
          mode: isBackendReady(state) ? "list" : "offline",
          searchQuery: "",
          searchFocused: false,
          selectedIds: [torrentId],
          anchorId: torrentId,
          contextMenu: null
        }
      }), "pick-search-result");
    },

    selectTorrent(torrentId, modifier = { ctrl: false, shift: false }) {
      store.setState((state) => {
        if (!isBackendReady(state)) {
          return state;
        }

        const visibleIds = getFilteredTorrents(state).map((item) => item.id);
        const selected = new Set(state.main.selectedIds);
        const isCtrl = modifier.ctrl;
        const isShift = modifier.shift;

        if (isShift && state.main.anchorId && visibleIds.includes(state.main.anchorId)) {
          const a = visibleIds.indexOf(state.main.anchorId);
          const b = visibleIds.indexOf(torrentId);
          if (b !== -1) {
            const min = Math.min(a, b);
            const max = Math.max(a, b);
            selected.clear();
            for (let i = min; i <= max; i += 1) {
              selected.add(visibleIds[i]);
            }
          }
        } else if (isCtrl) {
          if (selected.has(torrentId)) {
            selected.delete(torrentId);
          } else {
            selected.add(torrentId);
          }
        } else {
          selected.clear();
          selected.add(torrentId);
        }

        return {
          ...state,
          main: {
            ...state.main,
            selectedIds: Array.from(selected),
            anchorId: torrentId,
            contextMenu: null
          }
        };
      }, "select-torrent");
    },

    openContextMenu(torrentId, x, y) {
      store.setState((state) => {
        if (!isBackendReady(state)) {
          return state;
        }

        return {
          ...state,
          main: {
            ...state.main,
            selectedIds: state.main.selectedIds.includes(torrentId) ? state.main.selectedIds : [torrentId],
            anchorId: torrentId,
            contextMenu: {
              torrentId,
              x,
              y
            }
          }
        };
      }, "open-context-menu");
    },

    closeContextMenu() {
      const state = store.getState();
      if (!state.main.contextMenu) {
        return;
      }

      store.setState({
        ...state,
        main: {
          ...state.main,
          contextMenu: null
        }
      }, "close-context-menu");
    },

    openDetailsSheet(torrentId) {
      store.setState((state) => ({
        ...state,
        layers: {
          ...state.layers,
          level15: "torrent-details"
        },
        sheets: {
          ...state.sheets,
          type: "details",
          detailsTorrentId: torrentId,
          details: {
            loadState: "loading",
            error: "",
            notFound: false,
            simulated: false,
            summary: null,
            sections: {},
            actionBusy: false,
            actionName: "",
            actionError: "",
            actionSuccess: "",
            flags: {
              sequential: false,
              firstLastPiecePrio: false
            },
            flagsKnown: false
          }
        },
        main: {
          ...state.main,
          selectedIds: [torrentId],
          anchorId: torrentId,
          contextMenu: null
        }
      }), "open-details-sheet");
    },

    applyTorrentDetails(payload, requestedId) {
      store.setState((state) => {
        if (state.sheets.detailsTorrentId !== requestedId) {
          return state;
        }

        if (!payload || !payload.ok) {
          const notFound = Boolean(payload && payload.notFound);
          const hadStableDetails =
            state.sheets.details.loadState === "success" &&
            Boolean(state.sheets.details.summary);

          // Keep current details surface stable on transient refresh failures.
          // Only switch to failed view when the torrent is really gone.
          if (hadStableDetails && !notFound) {
            return {
              ...state,
              sheets: {
                ...state.sheets,
                details: {
                  ...state.sheets.details,
                  simulated: Boolean(payload && payload.simulated),
                  actionBusy: false,
                  actionName: ""
                }
              }
            };
          }

          return {
            ...state,
            sheets: {
              ...state.sheets,
              details: {
                ...state.sheets.details,
                loadState: "failed",
                error: payload && payload.error ? payload.error : "details-load-failed",
                notFound,
                simulated: Boolean(payload && payload.simulated),
                actionBusy: false,
                actionName: "",
                actionError: payload && payload.error ? payload.error : "details-load-failed",
                actionSuccess: ""
              }
            }
          };
        }

        const summary = payload.summary || null;
        const seq = Number(summary && summary.seq_dl);
        const flp = Number(summary && summary.f_l_piece_prio);
        const flagsKnown = Number.isFinite(seq) || Number.isFinite(flp);

        return {
          ...state,
          sheets: {
            ...state.sheets,
            details: {
              loadState: "success",
              error: "",
              notFound: false,
              simulated: Boolean(payload.simulated),
              summary,
              sections: payload.sections || {},
              actionBusy: false,
              actionName: "",
              actionError: "",
              actionSuccess: state.sheets.details.actionSuccess || "",
              flags: {
                sequential: Number.isFinite(seq) ? seq === 1 : state.sheets.details.flags.sequential,
                firstLastPiecePrio: Number.isFinite(flp) ? flp === 1 : state.sheets.details.flags.firstLastPiecePrio
              },
              flagsKnown
            }
          }
        };
      }, "apply-torrent-details");
    },

    setDetailsActionBusy(actionName, busy) {
      store.setState((state) => ({
        ...state,
        sheets: {
          ...state.sheets,
          details: {
            ...state.sheets.details,
            actionBusy: Boolean(busy),
            actionName: busy ? actionName : "",
            actionError: busy ? "" : state.sheets.details.actionError
          }
        }
      }), "details-action-busy");
    },

    setDetailsActionError(message) {
      store.setState((state) => ({
        ...state,
        sheets: {
          ...state.sheets,
          details: {
            ...state.sheets.details,
            actionError: message || "Details action failed.",
            actionSuccess: "",
            actionBusy: false,
            actionName: ""
          }
        }
      }), "details-action-error");
    },

    setDetailsActionSuccess(message) {
      store.setState((state) => ({
        ...state,
        sheets: {
          ...state.sheets,
          details: {
            ...state.sheets.details,
            actionSuccess: message || "",
            actionError: "",
            actionBusy: false,
            actionName: ""
          }
        }
      }), "details-action-success");
    },

    openAddSheet() {
      store.setState((state) => ({
        ...state,
        layers: {
          ...state.layers,
          level15: "add-torrent"
        },
        sheets: {
          ...state.sheets,
          type: "add",
          add: {
            step: "input",
            sourceType: null,
            magnet: "",
            fileName: "",
            fileSize: 0,
            error: "",
            submitting: false,
            successMessage: "",
            confirmation: {
              savePathState: "idle",
              savePath: "",
              note: ""
            }
          }
        },
        main: {
          ...state.main,
          contextMenu: null
        }
      }), "open-add-sheet");
    },

    updateAddMagnet(magnet) {
      store.setState((state) => ({
        ...state,
        sheets: {
          ...state.sheets,
          add: {
            ...state.sheets.add,
            magnet,
            sourceType: magnet.trim() ? "magnet" : state.sheets.add.fileName ? "file" : null,
            error: "",
            successMessage: ""
          }
        }
      }), "add-magnet-update");
    },

    setAddFile(fileName, fileSize = 0) {
      store.setState((state) => ({
        ...state,
        sheets: {
          ...state.sheets,
          add: {
            ...state.sheets.add,
            fileName,
            fileSize,
            sourceType: fileName ? "file" : state.sheets.add.magnet.trim() ? "magnet" : null,
            error: "",
            successMessage: ""
          }
        }
      }), "add-file-set");
    },

    setAddError(errorMessage) {
      store.setState((state) => ({
        ...state,
        sheets: {
          ...state.sheets,
          add: {
            ...state.sheets.add,
            error: errorMessage || "",
            successMessage: ""
          }
        }
      }), "add-error");
    },

    setAddSubmitting(submitting) {
      store.setState((state) => ({
        ...state,
        sheets: {
          ...state.sheets,
          add: {
            ...state.sheets.add,
            submitting: Boolean(submitting),
            error: submitting ? "" : state.sheets.add.error,
            successMessage: submitting ? "" : state.sheets.add.successMessage
          }
        }
      }), "add-submitting");
    },

    setAddConfirmationLoading() {
      store.setState((state) => ({
        ...state,
        sheets: {
          ...state.sheets,
          add: {
            ...state.sheets.add,
            confirmation: {
              ...state.sheets.add.confirmation,
              savePathState: "loading"
            }
          }
        }
      }), "add-confirmation-loading");
    },

    setAddConfirmationContext(context = {}) {
      store.setState((state) => ({
        ...state,
        sheets: {
          ...state.sheets,
          add: {
            ...state.sheets.add,
            confirmation: {
              savePathState: context.savePathState || "pending",
              savePath: context.savePath || "",
              note: context.note || ""
            },
            error: context.error || state.sheets.add.error
          }
        }
      }), "add-confirmation-context");
    },

    advanceAddSheet() {
      store.setState((state) => {
        const sourceType = state.sheets.add.fileName
          ? "file"
          : state.sheets.add.magnet.trim()
            ? "magnet"
            : null;

        if (!sourceType) {
          return state;
        }

        return {
          ...state,
          sheets: {
            ...state.sheets,
            add: {
              ...state.sheets.add,
              sourceType,
              step: "confirm",
              error: "",
              confirmation: {
                ...state.sheets.add.confirmation,
                savePathState: state.sheets.add.confirmation.savePathState === "idle"
                  ? "loading"
                  : state.sheets.add.confirmation.savePathState
              }
            }
          }
        };
      }, "add-sheet-confirm-step");
    },

    returnToAddInput() {
      store.setState((state) => ({
        ...state,
        sheets: {
          ...state.sheets,
          add: {
            ...state.sheets.add,
            step: "input",
            submitting: false,
            error: ""
          }
        }
      }), "add-sheet-back");
    },

    confirmAddTorrentSuccess(payload = {}) {
      store.setState((state) => {
        const selectedId = payload.selectedId || null;
        const successMessage = payload.message || "";

        return {
          ...state,
          layers: {
            ...state.layers,
            level15: "none"
          },
          sheets: {
            ...state.sheets,
            type: "none",
            detailsTorrentId: null,
            add: {
              step: "input",
              sourceType: null,
              magnet: "",
              fileName: "",
              fileSize: 0,
              error: "",
              submitting: false,
              successMessage,
              confirmation: {
                savePathState: "idle",
                savePath: "",
                note: ""
              }
            }
          },
          main: {
            ...state.main,
            primaryFilter: "All",
            mode: isBackendReady(state) ? "list" : "offline",
            selectedIds: selectedId ? [selectedId] : [],
            anchorId: selectedId || null,
            contextMenu: null
          }
        };
      }, "confirm-add-torrent-success");
    },

    closeSheet() {
      const state = store.getState();
      if (state.layers.level15 === "none") {
        return;
      }

      store.setState({
        ...state,
        layers: {
          ...state.layers,
          level15: "none"
        },
        sheets: {
          ...state.sheets,
          type: "none",
          detailsTorrentId: null,
          details: {
            loadState: "idle",
            error: "",
            notFound: false,
            simulated: false,
            summary: null,
            sections: {},
            actionBusy: false,
            actionName: "",
            actionError: "",
            actionSuccess: "",
            flags: {
              sequential: false,
              firstLastPiecePrio: false
            },
            flagsKnown: false
          },
          add: {
            step: "input",
            sourceType: null,
            magnet: "",
            fileName: "",
            fileSize: 0,
            error: "",
            submitting: false,
            successMessage: "",
            confirmation: {
              savePathState: "idle",
              savePath: "",
              note: ""
            }
          }
        }
      }, "close-sheet");
    },

    toggleSpeedDrawer() {
      store.setState((state) => ({
        ...state,
        layers: {
          ...state.layers,
          exception: {
            ...state.layers.exception,
            speedDrawer: !state.layers.exception.speedDrawer
          }
        }
      }), "toggle-speed-drawer");
    },

    setReconnectRequested() {
      store.setState((state) => ({
        ...state,
        backend: {
          ...state.backend,
          lifecycleMessage: "reconnect-requested"
        }
      }), "reconnect-requested");
    },

    setTorrentListLoading() {
      store.setState((state) => ({
        ...state,
        data: {
          ...state.data,
          listLoadState: "loading",
          listLoadError: ""
        }
      }), "torrent-list-loading");
    },

    setLocateRequested() {
      store.setState((state) => ({
        ...state,
        backend: {
          ...state.backend,
          lifecycleMessage: "manual-locate-requested"
        }
      }), "locate-requested");
    },

    setBackendActionError(message) {
      if (!message) {
        return;
      }

      store.setState((state) => ({
        ...state,
        backend: {
          ...state.backend,
          lastError: message
        }
      }), "backend-action-error");
    },

    setSettingsLoading(loading) {
      store.setState((state) => ({
        ...state,
        settings: {
          ...state.settings,
          loadState: loading ? "loading" : "ready",
          updateState: loading ? "idle" : state.settings.updateState,
          pendingId: loading ? "" : state.settings.pendingId,
          lastError: loading ? "" : state.settings.lastError
        }
      }), "settings-loading");
    },

    applySettingsPreferences(preferences) {
      store.setState((state) => ({
        ...state,
        settings: {
          ...state.settings,
          preferences: preferences || {},
          loadState: "ready",
          updateState: "idle",
          pendingId: "",
          lastError: "",
          lastSuccess: ""
        }
      }), "settings-apply-preferences");
    },

    setSettingsUpdatePending(settingId) {
      store.setState((state) => ({
        ...state,
        settings: {
          ...state.settings,
          updateState: "pending",
          pendingId: settingId || "",
          lastError: "",
          lastSuccess: ""
        }
      }), "settings-update-pending");
    },

    setSettingsSuccess(message) {
      store.setState((state) => ({
        ...state,
        settings: {
          ...state.settings,
          updateState: "ready",
          pendingId: "",
          lastSuccess: message || "Saved.",
          lastError: ""
        }
      }), "settings-success");
    },

    setSettingsError(message) {
      store.setState((state) => ({
        ...state,
        settings: {
          ...state.settings,
          loadState: state.settings.loadState === "loading" ? "failed" : state.settings.loadState,
          updateState: "failed",
          pendingId: "",
          lastError: message || "Settings request failed.",
          lastSuccess: ""
        }
      }), "settings-error");
    },

    clearMainActionFeedback() {
      store.setState((state) => ({
        ...state,
        mainActions: {
          ...state.mainActions,
          lastError: "",
          lastSuccess: ""
        }
      }), "main-action-clear-feedback");
    },

    clearDetailsActionFeedback() {
      store.setState((state) => ({
        ...state,
        sheets: {
          ...state.sheets,
          details: {
            ...state.sheets.details,
            actionError: "",
            actionSuccess: ""
          }
        }
      }), "details-action-clear-feedback");
    },

    clearAddFeedback() {
      store.setState((state) => ({
        ...state,
        sheets: {
          ...state.sheets,
          add: {
            ...state.sheets.add,
            error: "",
            successMessage: ""
          }
        }
      }), "add-clear-feedback");
    },

    clearSettingsFeedback() {
      store.setState((state) => ({
        ...state,
        settings: {
          ...state.settings,
          lastError: "",
          lastSuccess: "",
          updateState: state.settings.updateState === "failed" ? "idle" : state.settings.updateState
        }
      }), "settings-clear-feedback");
    },

    openSettings() {
      store.setState((state) => ({
        ...state,
        layers: {
          ...state.layers,
          level2: "settings"
        },
        main: {
          ...state.main,
          contextMenu: null
        }
      }), "open-settings");
    },

    closeSettings() {
      store.setState((state) => ({
        ...state,
        layers: {
          ...state.layers,
          level2: "hidden"
        }
      }), "close-settings");
    },

    updateSettingsSearch(searchQuery) {
      store.setState((state) => ({
        ...state,
        settings: {
          ...state.settings,
          searchQuery
        }
      }), "settings-search");
    },

    selectSettingsCategory(category, trackHistory = false) {
      store.setState((state) => {
        if (!category) {
          return state;
        }

        const nextSettings =
          trackHistory && state.settings.selected !== category
            ? insertHistory(state.settings, category)
            : {
                ...state.settings,
                selected: category
              };

        return {
          ...state,
          settings: {
            ...nextSettings,
            selected: category
          }
        };
      }, "select-settings-category");
    },

    settingsBack() {
      store.setState((state) => {
        if (state.settings.historyIndex <= 0) {
          return state;
        }

        const historyIndex = state.settings.historyIndex - 1;
        return {
          ...state,
          settings: {
            ...state.settings,
            historyIndex,
            selected: state.settings.history[historyIndex]
          }
        };
      }, "settings-back");
    },

    settingsForward() {
      store.setState((state) => {
        if (state.settings.historyIndex >= state.settings.history.length - 1) {
          return state;
        }

        const historyIndex = state.settings.historyIndex + 1;
        return {
          ...state,
          settings: {
            ...state.settings,
            historyIndex,
            selected: state.settings.history[historyIndex]
          }
        };
      }, "settings-forward");
    }
  };
}
