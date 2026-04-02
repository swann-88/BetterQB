export function isBackendReady(state) {
  return state.backend.lifecycleState === "backend-ready" && state.backend.connected;
}

export function createInitialState(options = {}) {
  const preloadAvailable = Boolean(options.preloadAvailable);
  return {
    layers: {
      level0: "entry-screen",
      level1: "main-shell",
      level15: "none",
      level2: "hidden",
      exception: {
        speedDrawer: false
      }
    },
    preload: {
      shellReady: false
    },
    status: {
      appBooted: false,
      rendererLoaded: true,
      preloadAvailable,
      runtime: "Runtime loading...",
      bootedAt: "waiting..."
    },
    backend: {
      lifecycleState: "idle",
      connected: false,
      lifecycleMessage: "idle",
      activePath: "",
      pathSource: "none",
      lastError: "",
      lastReadyAt: "",
      readinessDetail: "",
      attemptId: 0,
      simulated: false,
      scenario: "none",
      candidates: [],
      rememberedPath: "",
      lastSuccessfulLaunchPath: ""
    },
    debug: {
      hooksEnabled: false,
      scenario: "none"
    },
    main: {
      mode: "offline",
      primaryFilter: "All",
      searchQuery: "",
      searchFocused: false,
      selectedIds: [],
      anchorId: null,
      contextMenu: null
    },
    mainActions: {
      busy: false,
      busyAction: "",
      lastError: "",
      lastSuccess: "",
      speedModeEnabled: false,
      speedModeLoading: false,
      lastScope: null
    },
    sheets: {
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
    },
    settings: {
      selected: "Downloads",
      searchQuery: "",
      history: ["Downloads"],
      historyIndex: 0,
      loadState: "idle",
      updateState: "idle",
      pendingId: "",
      lastError: "",
      lastSuccess: "",
      preferences: {}
    },
    data: {
      torrents: [],
      nextTorrentId: 2001,
      source: "none",
      listLoadState: "idle",
      listLoadError: ""
    }
  };
}

export function isFilterMatch(torrent, filter) {
  if (filter === "All") {
    return true;
  }

  const value = String(torrent.state || "").toLowerCase();
  if (filter === "Downloading") return value.includes("downloading");
  if (filter === "Completed") return value.includes("forcedup") || value.includes("completed");
  if (filter === "Seeding") return value.includes("uploading") || value.includes("stalledup") || value.includes("seeding");
  if (filter === "Paused") return value.includes("paused");
  if (filter === "Error") return value.includes("error") || value.includes("missingfiles");
  return false;
}

export function getFilteredTorrents(state) {
  return state.data.torrents.filter((item) => isFilterMatch(item, state.main.primaryFilter));
}

export function getSearchResults(state) {
  const query = state.main.searchQuery.trim().toLowerCase();
  if (!query) {
    return [];
  }

  return state.data.torrents.filter((item) => item.name.toLowerCase().includes(query));
}
