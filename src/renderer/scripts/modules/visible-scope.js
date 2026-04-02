import { getFilteredTorrents, getSearchResults, isBackendReady } from "./state-model.js";

export function resolveVisibleScope(state) {
  if (!isBackendReady(state)) {
    return {
      kind: "offline",
      hashes: [],
      count: 0,
      filter: state.main.primaryFilter,
      searchQuery: state.main.searchQuery || "",
      reason: "backend-offline"
    };
  }

  const query = String(state.main.searchQuery || "").trim();
  const inSearch = state.main.mode === "search" && query.length > 0;
  const list = inSearch ? getSearchResults(state) : getFilteredTorrents(state);
  const hashes = list.map((item) => item.id).filter(Boolean);

  return {
    kind: inSearch ? "search-visible-scope" : "filter-visible-scope",
    hashes,
    count: hashes.length,
    filter: state.main.primaryFilter,
    searchQuery: query,
    reason: hashes.length ? "ok" : "empty-visible-scope"
  };
}

