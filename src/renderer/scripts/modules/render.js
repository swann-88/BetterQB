import { PRIMARY_FILTERS, SETTINGS_CATEGORIES } from "./mock-data.js";
import { getFilteredTorrents, getSearchResults, isBackendReady } from "./state-model.js";
import { resolveVisibleScope } from "./visible-scope.js";
import { buildSettingsView } from "./settings-mapping.js";
import { createWelcomeSaturn } from "./welcome-saturn.js";

const DEBUG_SCENARIOS = [
  "none",
  "force-path-missing",
  "force-launch-fail",
  "force-readiness-timeout",
  "force-ready"
];

const FILTER_LABELS = {
  All: "全部",
  Downloading: "下载中",
  Completed: "已完成",
  Seeding: "做种中",
  Paused: "已暂停",
  Error: "错误"
};

const SETTINGS_CATEGORY_LABELS = {
  Behavior: "行为",
  Downloads: "下载",
  Connection: "连接",
  Speed: "速度",
  BitTorrent: "BitTorrent 协议",
  Queueing: "队列",
  "Web UI": "网页界面",
  RSS: "RSS",
  Advanced: "高级"
};

const SETTINGS_GROUP_LABELS = {
  Core: "核心",
  Services: "服务",
  General: "常规",
  Transfers: "传输",
  Advanced: "高级"
};

function esc(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderDebugControls(state) {
  if (!state.debug.hooksEnabled) {
    return "";
  }

  return `
    <div class="debug-controls" title="开发者钩子">
      <span>调试场景</span>
      ${DEBUG_SCENARIOS.map((scenario) => {
        const active = state.debug.scenario === scenario;
        return `<button type="button" data-action="set-debug-scenario" data-scenario="${scenario}" class="${
          active ? "active" : ""
        }">${scenario}</button>`;
      }).join("")}
    </div>
  `;
}

function renderStatus(state) {
  const bits = [
    ["应用已启动", state.status.appBooted],
    ["渲染层已加载", state.status.rendererLoaded],
    ["预加载可用", state.status.preloadAvailable],
    ["后端已连接", isBackendReady(state)]
  ];

  return `
    <div class="status-head">
      <strong>开发者诊断</strong>
      <button type="button" data-action="toggle-debug-panel" aria-label="隐藏诊断">隐藏</button>
    </div>
    <div class="status-left">
      ${bits
        .map(
          ([label, ok]) =>
            `<span class="status-chip ${ok ? "ok" : "warn"}">${label}: ${ok ? "是" : "否"}</span>`
        )
        .join("")}
      <span class="status-chip neutral">壳层预加载: ${state.preload.shellReady ? "就绪" : "预热中"}</span>
      <span class="status-chip neutral">生命周期: ${esc(state.backend.lifecycleState)}</span>
      <span class="status-chip neutral">消息: ${esc(state.backend.lifecycleMessage)}</span>
      <span class="status-chip neutral">路径来源: ${esc(state.backend.pathSource)}</span>
      <span class="status-chip neutral">模拟: ${state.backend.simulated ? "是" : "否"}</span>
      <span class="status-chip neutral">列表: ${esc(state.data.listLoadState)}</span>
    </div>
    <div class="status-right">
      ${renderDebugControls(state)}
    </div>
  `;
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = size;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(value) {
  return `${formatBytes(value)}/s`;
}

function getTotalTransferSpeeds(state) {
  const rows = Array.isArray(state && state.data && state.data.torrents) ? state.data.torrents : [];
  let down = 0;
  let up = 0;
  for (const torrent of rows) {
    const dl = Number(torrent && torrent.downSpeed);
    const ul = Number(torrent && torrent.upSpeed);
    if (Number.isFinite(dl) && dl > 0) {
      down += dl;
    }
    if (Number.isFinite(ul) && ul > 0) {
      up += ul;
    }
  }
  return { down, up };
}

function formatEta(value) {
  const eta = Number(value);
  if (!Number.isFinite(eta) || eta < 0) {
    return "未知";
  }
  if (eta === 8640000) {
    return "无限";
  }
  if (eta === 0) {
    return "完成";
  }
  const minutes = Math.floor(eta / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function mapStateLabel(state) {
  const value = String(state || "").toLowerCase();
  if (value.includes("downloading")) return "下载中";
  if (value.includes("paused")) return "已暂停";
  if (value.includes("stalledup") || value.includes("uploading") || value.includes("seeding")) return "做种中";
  if (value.includes("error") || value.includes("missingfiles")) return "错误";
  if (value.includes("queued") || value.includes("checking")) return "排队中";
  if (value.includes("forcedup") || value.includes("completed")) return "已完成";
  return state || "未知";
}

function formatAddedAt(value) {
  const sec = Number(value);
  if (!Number.isFinite(sec) || sec <= 0) {
    return "未知";
  }
  const date = new Date(sec * 1000);
  return date.toLocaleString();
}

function renderPrimaryNav(state) {
  return PRIMARY_FILTERS.map((item) => {
    const active = state.main.primaryFilter === item;
    return `<button type="button" data-action="select-filter" data-filter="${item}" class="${
      active ? "active" : ""
    }"><span class="nav-dot"></span><span>${FILTER_LABELS[item] || item}</span></button>`;
  }).join("");
}

function progressPct(value) {
  return Math.round(value * 100);
}

function formatDateFromSecs(value) {
  const sec = Number(value);
  if (!Number.isFinite(sec) || sec <= 0) {
    return "未知";
  }
  return new Date(sec * 1000).toLocaleString();
}

function renderListCards(state, rows) {
  if (!rows.length) {
    return `<div class="empty-inline">当前筛选下没有任务。</div>`;
  }

  return rows
    .map((torrent) => {
      const selected = state.main.selectedIds.includes(torrent.id);
      const multiSelected = selected && state.main.selectedIds.length > 1;
      const pct = progressPct(torrent.progress);
      return `
        <article class="torrent-card ${selected ? "selected" : ""} ${multiSelected ? "multi" : ""}" data-row-id="${torrent.id}">
          <div class="card-top">
            <div>
              <h3>${esc(torrent.name)}</h3>
              <p>${esc(mapStateLabel(torrent.state))} | ${esc(formatBytes(torrent.size))} | 添加于 ${esc(formatAddedAt(torrent.addedAt))}</p>
            </div>
            <button type="button" class="ghost details-trigger" data-action="open-details" data-torrent-id="${torrent.id}">详情</button>
          </div>

          <div class="progress-wrap">
            <div class="progress-track">
              <span class="progress-fill" style="width:${pct}%"></span>
            </div>
            <span>${pct}%</span>
          </div>

          <div class="card-meta">
            <span>下载 ${esc(formatSpeed(torrent.downSpeed))}</span>
            <span>上传 ${esc(formatSpeed(torrent.upSpeed))}</span>
            <span>预计 ${esc(formatEta(torrent.eta))}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSearch(state) {
  const results = getSearchResults(state);
  if (!results.length) {
    return `<div class="empty-inline">没有搜索结果："${esc(state.main.searchQuery)}".</div>`;
  }

  return `
    <section class="search-mode">
      <header>
        <h3>搜索结果</h3>
        <p>点击任一结果后返回“全部”并高亮该项。</p>
      </header>
      <div class="search-results">
        ${results
          .map(
            (item) => `
            <button type="button" class="search-result ${state.main.selectedIds.includes(item.id) ? "focused" : ""}" data-action="pick-search-result" data-torrent-id="${item.id}">
              <strong>${esc(item.name)}</strong>
              <span>${esc(mapStateLabel(item.state))} | ${esc(formatBytes(item.size))}</span>
            </button>
          `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderOffline(state) {
  const reason = state.backend.lastError || "当前没有可用后端连接。";
  return `
    <section class="offline-state">
      <div class="offline-mark">!</div>
      <h3>未连接</h3>
      <p>生命周期状态： ${esc(state.backend.lifecycleState)}</p>
      <p>${esc(reason)}</p>
      <div class="offline-meta">
        <span>当前路径： ${esc(state.backend.activePath || "（无）")}</span>
        <span>记忆路径： ${esc(state.backend.rememberedPath || "（无）")}</span>
        <span>上次成功路径： ${esc(state.backend.lastSuccessfulLaunchPath || "（无）")}</span>
      </div>
      <div class="offline-actions">
        <button type="button" class="primary" data-action="reconnect">重新连接</button>
        <button type="button" data-action="locate-qb">定位 qBittorrent</button>
      </div>
    </section>
  `;
}

function render主页Content(state) {
  if (!isBackendReady(state)) {
    return renderOffline(state);
  }

  if (state.data.listLoadState === "loading") {
    return `<section class="empty-inline">已连接 qB WebUI，正在加载任务列表...</section>`;
  }

  if (state.data.listLoadState === "failed") {
    return `
      <section class="offline-state">
        <h3>已连接，但列表加载失败</h3>
        <p>${esc(state.data.listLoadError || "无法获取 /api/v2/torrents/info")}</p>
        <div class="offline-actions">
          <button type="button" class="primary" data-action="refresh-列表">Retry 列表 load</button>
        </div>
      </section>
    `;
  }

  if (state.main.mode === "search") {
    return `<section class="search-surface">${renderSearch(state)}</section>`;
  }

  const rows = getFilteredTorrents(state);
  return `
    <section class="列表-shell">
      <header class="列表-head">
        <h3>${esc(FILTER_LABELS[state.main.primaryFilter] || state.main.primaryFilter)}</h3>
        <p>${rows.length} 个可见项</p>
      </header>
      <div class="列表-cards">${renderListCards(state, rows)}</div>
    </section>
  `;
}

function renderSpeedDrawer() {
  return `
    <header>
      <h3>速度抽屉</h3>
      <p>实时限速控制辅助面板。</p>
    </header>
    <div class="drawer-metrics">
      <div>
        <strong>下载</strong>
        <span>12.4 MB/s</span>
      </div>
      <div>
        <strong>上传</strong>
        <span>2.2 MB/s</span>
      </div>
    </div>
    <label>
      下载上限
      <input type="range" min="0" max="100" value="68" />
    </label>
    <label>
      上传上限
      <input type="range" min="0" max="100" value="35" />
    </label>
    <button type="button" class="drawer-close" data-action="toggle-speed-drawer">关闭抽屉</button>
  `;
}

function render详情Sheet(state) {
  const item = state.data.torrents.find((torrent) => torrent.id === state.sheets.detailsTorrentId);
  const details = state.sheets.details || {};
  const summary = details.summary || {};
  const sections = details.sections || {};

  const name = summary.name || (item && item.name) || "未知 torrent";
  const stateLabel = mapStateLabel(summary.state || (item && item.state) || "unknown");
  const progress = Number(summary.progress ?? (item ? item.progress : 0));
  const size = Number(summary.total_size ?? (item ? item.size : 0));
  const totalDone = Number(summary.total_done || 0);
  const dlSpeed = Number(summary.dl_speed ?? (item ? item.downSpeed : 0));
  const upSpeed = Number(summary.up_speed ?? (item ? item.upSpeed : 0));
  const eta = Number(summary.eta ?? (item ? item.eta : -1));
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
  const actionBusy = Boolean(details.actionBusy);
  const actionName = details.actionName || "";
  const actionError = details.actionError || "";
  const actionSuccess = details.actionSuccess || "";
  const flagsKnown = Boolean(details.flagsKnown);
  const seqEnabled = Boolean(details.flags && details.flags.sequential);
  const flpEnabled = Boolean(details.flags && details.flags.firstLastPiecePrio);
  const offline = !isBackendReady(state);
  const actionsDisabled = offline || details.notFound || details.loadState === "loading";
  const tone = String(stateLabel).toLowerCase();
  const stateTone = tone.includes("error")
    ? "danger"
    : tone.includes("paused")
      ? "idle"
      : tone.includes("downloading") || tone.includes("seeding")
        ? "active"
        : "neutral";

  const renderSectionState = (key, label, section, content, weight = "primary") => {
    const baseClass = `details-card ${weight === "secondary" ? "details-secondary" : "details-primary"}`;
    if (!section) {
      return `
        <article id="section-${key}" class="${baseClass}">
          <h4>${label}</h4>
          <p class="section-note">暂缓 in this round.</p>
        </article>
      `;
    }
    if (section.status === "failed") {
      return `
        <article id="section-${key}" class="${baseClass}">
          <h4>${label}</h4>
          <p class="section-note">不可用：${esc(section.error || "请求失败")}</p>
        </article>
      `;
    }
    if (section.status === "deferred") {
      return `
        <article id="section-${key}" class="${baseClass}">
          <h4>${label}</h4>
          <p class="section-note">${esc(section.message || "暂缓 in this round.")}</p>
        </article>
      `;
    }
    return content(section.data);
  };

  const renderFiles = (data) => {
    const files = Array.isArray(data) ? data : [];
    return `
      <article id="section-files" class="details-card details-primary">
        <h4>内容 / 文件</h4>
        <p class="section-note">${files.length} 个文件项（只读）。</p>
        <div class="details-table">
          ${files
            .slice(0, 40)
            .map((file) => {
              const fileProgress = Number(file.progress || 0);
              return `<div class="details-row"><span>${esc(file.name || "（未命名）")}</span><span>${esc(formatBytes(file.size || 0))}</span><span>${Math.round(fileProgress * 100)}%</span></div>`;
            })
            .join("") || "<div class='details-row details-empty'><span>未返回文件列表。</span></div>"}
        </div>
      </article>
    `;
  };

  const renderTrackers = (data) => {
    const trackers = Array.isArray(data) ? data : [];
    return `
      <article id="section-trackers" class="details-card details-primary">
        <h4>跟踪器</h4>
        <p class="section-note">跟踪器地址与群组信号（只读）。</p>
        <div class="details-table">
          ${trackers
            .slice(0, 40)
            .map((tracker) => `<div class="details-row"><span>${esc(tracker.url || tracker.msg || "（跟踪器）")}</span><span>种子 ${esc(tracker.num_seeds)}</span><span>节点 ${esc(tracker.num_peers)}</span></div>`)
            .join("") || "<div class='details-row details-empty'><span>未返回跟踪器。</span></div>"}
        </div>
      </article>
    `;
  };

  const renderPeers = (data) => {
    const peers = Array.isArray(data) ? data : [];
    return `
      <article id="section-peers" class="details-card details-primary">
        <h4>节点 / 连接</h4>
        <p class="section-note">${peers.length} 个节点（只读快照）。</p>
        <div class="details-table">
          ${peers
            .slice(0, 60)
            .map((peer) => `<div class="details-row"><span>${esc(peer.ip || peer.id || "（节点）")}</span><span>${esc(peer.client || "")}</span><span>下载 ${esc(formatSpeed(peer.dl_speed || 0))} | 上传 ${esc(formatSpeed(peer.up_speed || 0))}</span></div>`)
            .join("") || "<div class='details-row details-empty'><span>未返回节点。</span></div>"}
        </div>
      </article>
    `;
  };

  const renderMeta = (data) => {
    const meta = data || {};
    return `
      <article id="section-meta" class="details-card details-secondary">
        <h4>元信息 / 高级标识</h4>
        <div class="meta-grid">
          <div><strong>Hash</strong><span>${esc(meta.hash || state.sheets.detailsTorrentId || "")}</span></div>
          <div><strong>Infohash v1</strong><span>${esc(meta.infohash_v1 || "不适用")}</span></div>
          <div><strong>Infohash v2</strong><span>${esc(meta.infohash_v2 || "不适用")}</span></div>
          <div><strong>保存路径</strong><span>${esc(meta.save_path || "不适用")}</span></div>
          <div><strong>下载路径</strong><span>${esc(meta.download_path || "不适用")}</span></div>
          <div><strong>创建者</strong><span>${esc(meta.created_by || "未知")}</span></div>
          <div><strong>创建时间</strong><span>${esc(formatDateFromSecs(meta.creation_date))}</span></div>
          <div><strong>添加时间</strong><span>${esc(formatDateFromSecs(meta.addition_date))}</span></div>
        </div>
      </article>
    `;
  };

  const offlineNotice = !isBackendReady(state)
    ? `<article class="details-card details-secondary"><h4>连接状态</h4><p class="section-note">后端离线，实时详情不可用。</p></article>`
    : "";
  const notFoundNotice = details.notFound
    ? `<article class="details-card details-secondary"><h4>任务不存在</h4><p class="section-note">该任务已不在 qBittorrent 中。</p></article>`
    : "";
  const loadingNotice = details.loadState === "loading"
    ? `<article class="details-card details-secondary"><h4>加载中</h4><p class="section-note">正在从 qB WebUI 拉取真实详情...</p></article>`
    : "";
  const failedNotice = details.loadState === "failed" && !details.notFound
    ? `<article class="details-card details-secondary"><h4>详情不可用</h4><p class="section-note">${esc(details.error || "无法加载详情。")}</p></article>`
    : "";

  return `
    <div class="sheet-modal details-sheet">
      <button type="button" class="sheet-back quiet-icon" data-action="close-sheet" aria-label="返回">↩</button>
      <header class="sheet-summary details-hero">
        <div class="details-summary-top">
          <div>
            <p class="details-kicker">任务详情</p>
            <h3>${esc(name)}</h3>
          </div>
          <span class="state-pill ${stateTone}">${esc(stateLabel)}</span>
        </div>
        <div class="details-progress">
          <div class="details-progress-track"><span style="width:${pct}%"></span></div>
          <strong>${pct}%</strong>
        </div>
        <div class="details-summary-grid">
          <div><span>已完成</span><strong>${esc(formatBytes(totalDone))} / ${esc(formatBytes(size))}</strong></div>
          <div><span>下载</span><strong>${esc(formatSpeed(dlSpeed))}</strong></div>
          <div><span>上传</span><strong>${esc(formatSpeed(upSpeed))}</strong></div>
          <div><span>ETA</span><strong>${esc(formatEta(eta))}</strong></div>
        </div>
        <div class="sheet-actions">
          <button type="button" class="deferred-action ${actionBusy && actionName === "start" ? "is-busy" : ""}" data-action="details-start" ${actionsDisabled || actionBusy ? "disabled" : ""}>${actionBusy && actionName === "start" ? "启动中..." : "启动"}</button>
          <button type="button" class="deferred-action ${actionBusy && actionName === "pause" ? "is-busy" : ""}" data-action="details-pause" ${actionsDisabled || actionBusy ? "disabled" : ""}>${actionBusy && actionName === "pause" ? "暂停中..." : "暂停"}</button>
          <button type="button" class="deferred-action ${actionBusy && actionName === "recheck" ? "is-busy" : ""}" data-action="details-recheck" ${actionsDisabled || actionBusy ? "disabled" : ""}>${actionBusy && actionName === "recheck" ? "校验中..." : "强制校验"}</button>
          <button type="button" class="deferred-action ${flagsKnown && seqEnabled ? "is-active" : ""} ${actionBusy && actionName === "toggle-sequential" ? "is-busy" : ""}" data-action="details-toggle-sequential" ${actionsDisabled || actionBusy ? "disabled" : ""}>${flagsKnown && seqEnabled ? "顺序下载：开" : "顺序下载：关"}</button>
          <button type="button" class="deferred-action ${flagsKnown && flpEnabled ? "is-active" : ""} ${actionBusy && actionName === "toggle-firstlast" ? "is-busy" : ""}" data-action="details-toggle-firstlast" ${actionsDisabled || actionBusy ? "disabled" : ""}>${flagsKnown && flpEnabled ? "首尾优先：开" : "首尾优先：关"}</button>
          ${details.simulated ? '<span class="status-chip warn">模拟生命周期模式</span>' : ""}
          ${actionError ? `<span class="status-chip warn">${esc(actionError)}</span>` : ""}
          ${actionSuccess ? `<span class="status-chip ok">${esc(actionSuccess)}</span>` : ""}
          ${!flagsKnown ? '<span class="status-chip neutral">开关状态不可用</span>' : ""}
        </div>
      </header>
      <nav class="details-anchors" aria-label="详情分区锚点">
        <button type="button" data-action="jump-details-section" data-anchor="overview">概览</button>
        <button type="button" data-action="jump-details-section" data-anchor="files">文件</button>
        <button type="button" data-action="jump-details-section" data-anchor="trackers">跟踪器</button>
        <button type="button" data-action="jump-details-section" data-anchor="peers">节点</button>
        <button type="button" data-action="jump-details-section" data-anchor="meta">元信息 / 高级</button>
      </nav>
      <section class="sheet-scroll details-scroll">
        ${loadingNotice}
        ${offlineNotice}
        ${notFoundNotice}
        ${failedNotice}
        ${renderSectionState("overview", "概览 / 摘要", sections.overview, (overview) => `
          <article id="section-overview" class="details-card details-primary overview-card">
            <h4>概览 / 摘要</h4>
            <div class="overview-grid">
              <div><strong>分享率</strong><span>${esc(overview.share_ratio)}</span></div>
              <div><strong>Seeds</strong><span>${esc(overview.seeds)} / ${esc(overview.seeds_total)}</span></div>
              <div><strong>节点</strong><span>${esc(overview.peers)} / ${esc(overview.peers_total)}</span></div>
              <div><strong>重新通告</strong><span>${esc(formatEta(overview.reannounce))}</span></div>
              <div><strong>连接数</strong><span>${esc(overview.nb_connections)}</span></div>
              <div><strong>下载ed</strong><span>${esc(formatBytes(overview.total_downloaded || overview.total_downloaded_session || 0))}</span></div>
            </div>
          </article>
        `)}
        ${renderSectionState("files", "内容 / 文件", sections.files, renderFiles)}
        ${renderSectionState("trackers", "跟踪器", sections.trackers, renderTrackers)}
        ${renderSectionState("peers", "节点 / 连接", sections.peers, renderPeers)}
        ${renderSectionState("meta", "元信息 / 高级标识", sections.meta, renderMeta, "secondary")}
        ${renderSectionState("actions", "操作", sections.quickActions, () => `
          <article class="details-card details-secondary">
            <h4>操作</h4>
            <p class="section-note">写操作在本轮有意暂缓。</p>
          </article>
        `, "secondary")}
      </section>
    </div>
  `;
}

function renderAddInput(state) {
  const magnetText = state.sheets.add.magnet.trim();
  const hasMagnet = magnetText.length > 0;
  const hasFile = Boolean(state.sheets.add.fileName);
  const can继续 = hasFile || hasMagnet;
  const bothSources = hasMagnet && hasFile;
  const sourceHint = hasFile
    ? `File selected: ${esc(state.sheets.add.fileName)}`
    : hasMagnet
      ? "Magnet/URL detected. 继续 to confirmation."
      : "Paste a magnet or URL, or choose a .torrent file.";
  const online = isBackendReady(state);

  return `
    <div class="add-frame add-input">
      <header class="add-zone add-main-header">
        <p class="add-eyebrow">导入来源</p>
        <h4>添加任务来源</h4>
        <p>Choose a magnet/URL or a .torrent file. Both continue through confirmation.</p>
      </header>
        <section class="add-main-scroll">
        <article class="add-panel add-panel-primary">
          <div class="add-panel-head">
            <h5>粘贴磁链 / URL</h5>
            <span>Primary input</span>
          </div>
          <textarea id="magnet-input" placeholder="magnet:?xt=urn:btih:...">${esc(state.sheets.add.magnet)}</textarea>
          <p class="add-field-note">支持磁链与任务 URL 文本，最终校验在确认步骤进行。</p>
          ${bothSources ? '<p class="add-field-note warn">检测到双来源，确认时将优先使用文件来源。</p>' : ""}
        </article>
        <article class="add-panel add-panel-drop" data-drop-zone="torrent">
          <div class="drop-badge">.torrent</div>
          <h5>拖拽或选择文件</h5>
          <p>${state.sheets.add.fileName ? esc(state.sheets.add.fileName) : "Drag and drop a .torrent file here"}</p>
          <button type="button" data-action="choose-file">选择 .torrent 文件</button>
          </article>
        </section>
        ${state.sheets.add.error ? `<p class="add-field-note warn">${esc(state.sheets.add.error)}</p>` : ""}
        <footer class="add-bottom-bar">
          <div class="add-status ${can继续 ? "ready" : ""}">
            <strong>${can继续 ? "可继续" : "需要输入"}</strong>
            <span>${sourceHint}${online ? "" : " 后端离线，重连前无法提交添加。"}</span>
          </div>
          <div class="add-actions">
            <button type="button" data-action="clear-magnet">清空</button>
            <button type="button" class="primary" data-action="add-next" ${can继续 ? "" : "disabled"}>继续</button>
          </div>
        </footer>
      </div>
    `;
}

function renderAddConfirm(state) {
  const sourceType = state.sheets.add.sourceType === "file" ? "Torrent file" : "Magnet / URL";
  const source = state.sheets.add.sourceType === "file" ? state.sheets.add.fileName : state.sheets.add.magnet;
  const sourceValue = source || "未知 source";
  const hasPreview = Boolean(state.sheets.add.sourceType);
  const addState = state.sheets.add;
  const savePathState = addState.confirmation.savePathState;
  const savePathLabel = savePathState === "ready"
    ? addState.confirmation.savePath
    : savePathState === "loading"
      ? "正在加载真实默认路径..."
      : "Pending / unavailable";
  const savePathNote = addState.confirmation.note || "";
  const submitLabel = addState.submitting ? "Adding..." : "添加任务";
  const online = isBackendReady(state);

  return `
    <div class="add-frame add-confirm">
      <header class="confirm-fixed-top add-confirm-head">
        <div class="confirm-summary-top">
          <div>
            <p class="add-eyebrow">确认</p>
            <h4>添加前确认</h4>
          </div>
          <span class="source-pill">${esc(sourceType)}</span>
        </div>
        <p class="confirm-source">${esc(sourceValue)}</p>
        <div class="confirm-health ${hasPreview ? "ready" : ""}">
          <strong>${hasPreview ? "可提交" : "来源信息待完善"}</strong>
          <span>${hasPreview ? "来源已记录，仍需显式提交。" : "请先提供来源输入。"}</span>
        </div>
      </header>
      <section class="confirm-scroll add-confirm-scroll">
        <article class="confirm-card confirm-card-primary">
          <h5>目标路径</h5>
          <p>可用时从 qB WebUI 读取默认保存路径，路径编辑控件暂缓。</p>
          <div class="confirm-kv">
            <span>保存路径</span>
            <strong>${esc(savePathLabel || "Pending / unavailable")}</strong>
          </div>
          ${savePathNote ? `<p class="add-field-note">${esc(savePathNote)}</p>` : ""}
        </article>
        <article class="confirm-card">
          <h5>行为</h5>
          <div class="option-row"><span>启动 mode</span><strong>添加后暂停（当前原型默认）</strong></div>
          <div class="option-row"><span>Queue handling</span><strong>标准队列规则（绑定暂缓）</strong></div>
          <div class="option-row"><span>分类 / 标签</span><strong>暂缓</strong></div>
        </article>
        <article class="confirm-card">
          <h5>内容预览</h5>
          <p>详细文件预览暂缓，本轮仅实现真实来源确认与提交。</p>
          <div class="confirm-empty">Preview unavailable in this round</div>
        </article>
        <article class="confirm-card confirm-card-secondary">
          <h5>元信息 / 高级</h5>
          <p>跟踪器、分片优先级和高级标记本轮有意暂缓。</p>
        </article>
      </section>
      ${addState.error ? `<p class="add-field-note warn">${esc(addState.error)}</p>` : ""}
      <footer class="confirm-fixed-bottom add-bottom-bar">
        <div class="add-status ready">
          <strong>${online ? "等待显式添加" : "后端离线"}</strong>
          <span>${online ? "点击“添加任务”前不会真正提交。" : "请重连 qBittorrent 后提交该请求。"}</span>
        </div>
        <div class="add-actions">
          <button type="button" data-action="add-back" ${addState.submitting ? "disabled" : ""}>返回</button>
          <button type="button" class="primary" data-action="confirm-add" ${addState.submitting || !online ? "disabled" : ""}>${submitLabel}</button>
        </div>
      </footer>
    </div>
  `;
}

function renderAddSheet(state) {
  const stepLabel = state.sheets.add.step === "input" ? "1/2" : "2/2";
  const stepText = state.sheets.add.step === "input" ? "选择来源" : "确认添加";

  return `
    <div class="sheet-modal add-sheet">
      <button type="button" class="sheet-back quiet-icon" data-action="close-sheet" aria-label="返回">↩</button>
      <header class="sheet-summary compact add-sheet-head">
        <div class="add-head-copy">
          <p class="add-eyebrow">添加任务 flow</p>
          <h3>添加任务</h3>
          <p>${stepText}</p>
        </div>
        <div class="add-head-step">
          <span class="add-step-pill">${stepLabel}</span>
          <span class="add-step-caption">Step ${stepLabel}</span>
        </div>
      </header>
      ${state.sheets.add.step === "input" ? renderAddInput(state) : renderAddConfirm(state)}
    </div>
  `;
}

function renderSheetLayer(state) {
  if (state.layers.level15 === "none") {
    return "";
  }

  if (state.layers.level15 === "torrent-details") {
    return render详情Sheet(state);
  }

  if (state.layers.level15 === "add-torrent") {
    return renderAddSheet(state);
  }

  return "";
}

function renderContextMenu(state) {
  if (!state.main.contextMenu) {
    return "";
  }

  return `
    <div class="menu-body" style="left:${state.main.contextMenu.x}px;top:${state.main.contextMenu.y}px;">
      <button type="button" data-action="open-details" data-torrent-id="${state.main.contextMenu.torrentId}">打开详情</button>
    </div>
  `;
}

function renderSettingsNav(state) {
  const query = state.settings.searchQuery.trim().toLowerCase();
  const groups = SETTINGS_CATEGORIES.map((block) => {
    const items = block.items.filter((item) => !query || item.toLowerCase().includes(query));
    if (!items.length) {
      return "";
    }

    return `
      <section class="settings-group">
        <h4>${SETTINGS_GROUP_LABELS[block.group] || block.group}</h4>
        <div class="settings-items">
          ${items
            .map((item) => {
              const active = state.settings.selected === item;
              const displayName = SETTINGS_CATEGORY_LABELS[item] || item;
              const glyph = displayName.charAt(0).toUpperCase();
              return `<button type="button" data-action="select-settings" data-category="${item}" class="${
                active ? "active" : ""
              }"><span class="settings-item-glyph">${glyph}</span><span>${displayName}</span></button>`;
            })
            .join("")}
        </div>
      </section>
    `;
  }).join("");

  return `
    <section class="settings-profile">
      <div class="avatar">qB</div>
      <div>
        <strong>qB 桌面</strong>
        <p>应用设置</p>
      </div>
    </section>
    ${groups}
  `;
}

function renderSettingsContent(state) {
  const selected = state.settings.selected;
  const online = isBackendReady(state);
  const loading = state.settings.loadState === "loading";
  const updating = state.settings.updateState === "pending";
  const view = buildSettingsView(selected, state.settings.preferences || {}, {
    disabled: !online || loading || updating,
    pendingId: state.settings.pendingId
  });

  const renderGroup = (name) => {
    const group = view.groups.find((item) => item.key === name);
    const rows = group && group.rows ? group.rows : [];
    if (!rows.length) {
      return "";
    }
    const displayName = (group && group.name) || SETTINGS_GROUP_LABELS[name] || name;
    return `
      <section class="settings-group-block ${name === "Advanced" ? "settings-muted-block" : ""}">
        <h4>${displayName}</h4>
        <div class="settings-grouped-rows">
          ${rows
            .map((row) => `
              <div class="settings-row">
                <span>${esc(row.label)}</span>
                <button type="button" data-action="settings-update" data-setting-id="${esc(row.id)}" ${row.disabled ? "disabled" : ""} ${row.note ? `title="${esc(row.note)}"` : ""}>
                  ${esc(row.actionText || row.displayValue)}
                </button>
              </div>
            `)
            .join("")}
        </div>
      </section>
    `;
  };

  return `
    <header class="settings-content-head">
      <h3>${esc(SETTINGS_CATEGORY_LABELS[selected] || selected)}</h3>
      <p>已连接偏好。已绑定 ${view.counts.full}｜只读 ${view.counts.readOnly}｜暂缓 ${view.counts.deferred}｜不支持 ${view.counts.unsupported}</p>
    </header>
    ${loading ? '<section class="settings-group-block"><p class="section-note">正在加载偏好...</p></section>' : ""}
    ${state.settings.lastError ? `<section class="settings-group-block"><p class="section-note">${esc(state.settings.lastError)}</p></section>` : ""}
    ${state.settings.lastSuccess ? `<section class="settings-group-block"><p class="section-note">${esc(state.settings.lastSuccess)}</p></section>` : ""}
    ${!online ? '<section class="settings-group-block"><p class="section-note">后端离线，设置只读。</p></section>' : ""}
    ${view.hasRows ? `${renderGroup("General")}${renderGroup("Transfers")}${renderGroup("Advanced")}` : '<section class="settings-group-block settings-muted-block"><h4>高级</h4><div class="settings-grouped-rows"><div class="settings-row"><span>该分类在本轮尚未绑定。</span><button type="button" disabled>暂缓</button></div></div></section>'}
  `;
}

export function createRenderer(store) {
  let root = null;
  let debugPanelVisible = false;
  const welcomeSaturn = createWelcomeSaturn();
  let welcomeDestroyed = false;

  function paint(state) {
    if (!root) {
      return;
    }

    const statusEl = root.querySelector("#status-banner");
    const entryEl = root.querySelector("#entry-screen");
    const shellEl = root.querySelector("#shell-stage");
    const navEl = root.querySelector("#primary-nav");
    const contentEl = root.querySelector("#content-host");
    const speedEl = root.querySelector("#speed-drawer");
    const sheetLayer = root.querySelector("#sheet-layer");
    const contextMenu = root.querySelector("#context-menu");
    const settingsPage = root.querySelector("#settings-page");
    const settingsNav = root.querySelector("#settings-nav");
    const settingsContent = root.querySelector("#settings-content");
    const pageIndicator = root.querySelector("#app-page-indicator");
    const actionFeedback = root.querySelector("#main-action-feedback");
    const searchInput = root.querySelector("#main-search");
    const settingsSearch = root.querySelector("#settings-search");
    const mainRegion = root.querySelector(".main-region");
    const startButton = root.querySelector('[data-action="start-visible"]');
    const pauseButton = root.querySelector('[data-action="pause-visible"]');
    const speedButton = root.querySelector('[data-action="toggle-speed-mode"]');
    const totalDownSpeedEl = root.querySelector("#total-down-speed");
    const totalUpSpeedEl = root.querySelector("#total-up-speed");
    const welcomeScene = root.querySelector("#entry-scene");

    statusEl.innerHTML = renderStatus(state);
    statusEl.classList.toggle("visible", debugPanelVisible);
    navEl.innerHTML = renderPrimaryNav(state);
    contentEl.innerHTML = render主页Content(state);
    contentEl.classList.toggle("details-open", state.layers.level15 === "torrent-details");
    mainRegion.classList.toggle("search-active", state.main.mode === "search");

    speedEl.innerHTML = renderSpeedDrawer(state);
    speedEl.classList.toggle("open", state.layers.exception.speedDrawer);

    sheetLayer.innerHTML = renderSheetLayer(state);
    sheetLayer.classList.toggle("active", state.layers.level15 !== "none");

    contextMenu.innerHTML = renderContextMenu(state);
    contextMenu.classList.toggle("active", Boolean(state.main.contextMenu));

    settingsNav.innerHTML = renderSettingsNav(state);
    settingsContent.innerHTML = renderSettingsContent(state);

    settingsPage.classList.toggle("active", state.layers.level2 === "settings");
    if (pageIndicator) {
      pageIndicator.textContent = state.layers.level2 === "settings" ? "设置" : "主页";
    }

    const scope = resolveVisibleScope(state);
    const online = isBackendReady(state);
    const hasScope = scope.hashes.length > 0;
    const busy = Boolean(state.mainActions.busy);

    if (startButton) {
      startButton.disabled = !online || !hasScope || busy;
      startButton.classList.toggle("is-busy", busy && state.mainActions.busyAction === "start");
    }

    if (pauseButton) {
      pauseButton.disabled = !online || !hasScope || busy;
      pauseButton.classList.toggle("is-busy", busy && state.mainActions.busyAction === "pause");
    }

    if (speedButton) {
      speedButton.disabled = !online || Boolean(state.mainActions.speedMode加载中);
      speedButton.classList.toggle("is-active", Boolean(state.mainActions.speedModeEnabled));
      speedButton.classList.toggle("is-busy", Boolean(state.mainActions.speedMode加载中));
    }

    if (actionFeedback) {
      actionFeedback.textContent = state.mainActions.lastError || state.mainActions.lastSuccess || "";
      actionFeedback.classList.toggle("error", Boolean(state.mainActions.lastError));
    }

    const totals = getTotalTransferSpeeds(state);
    if (totalDownSpeedEl) {
      totalDownSpeedEl.textContent = formatSpeed(totals.down);
    }
    if (totalUpSpeedEl) {
      totalUpSpeedEl.textContent = formatSpeed(totals.up);
    }

    entryEl.classList.toggle("hidden", state.layers.level0 === "hidden");
    shellEl.classList.toggle("preloading", state.layers.level0 !== "hidden");
    shellEl.classList.toggle("blurred", state.layers.level15 !== "none");

    if (!welcomeDestroyed) {
      if (state.layers.level0 !== "hidden") {
        welcomeSaturn.mount(welcomeScene);
      } else {
        welcomeSaturn.destroy();
        if (entryEl) {
          entryEl.replaceChildren();
        }
        welcomeDestroyed = true;
      }
    }

    if (searchInput.value !== state.main.searchQuery) {
      searchInput.value = state.main.searchQuery;
    }

    if (settingsSearch.value !== state.settings.searchQuery) {
      settingsSearch.value = state.settings.searchQuery;
    }

    if (!state.main.searchFocused && document.activeElement === searchInput) {
      searchInput.blur();
    }
  }

  return {
    mount(target) {
      root = target;
      store.subscribe((state) => {
        paint(state);
      });

      paint(store.getState());
    },
    toggleDebugPanel() {
      debugPanelVisible = !debugPanelVisible;
      paint(store.getState());
    },
    setDebugPanelVisible(nextVisible) {
      debugPanelVisible = Boolean(nextVisible);
      paint(store.getState());
    },
    jump详情Section(anchor) {
      if (!root) {
        return;
      }
      const target = root.querySelector(`#section-${anchor}`);
      if (!target) {
        return;
      }
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
}









