function asBool(value) {
  return Boolean(value);
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function asString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

function formatBytesPerSecond(value) {
  const bytes = asNumber(value, 0);
  if (bytes <= 0) {
    return "不限速";
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KiB/s`;
  }
  return `${(kb / 1024).toFixed(1)} MiB/s`;
}

function parseRateInput(input, fallback) {
  const text = String(input || "").trim();
  if (!text) {
    return fallback;
  }
  if (/^(0|unlimited)$/i.test(text)) {
    return 0;
  }
  const normalized = text.toLowerCase();
  let multiplier = 1;
  let numeric = normalized;
  if (normalized.endsWith("mib")) {
    multiplier = 1024;
    numeric = normalized.slice(0, -3).trim();
  } else if (normalized.endsWith("mb")) {
    multiplier = 1000;
    numeric = normalized.slice(0, -2).trim();
  } else if (normalized.endsWith("kib")) {
    multiplier = 1;
    numeric = normalized.slice(0, -3).trim();
  } else if (normalized.endsWith("kb")) {
    multiplier = 1;
    numeric = normalized.slice(0, -2).trim();
  }
  const value = Number(numeric);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value * multiplier * 1024);
}

export const SETTING_BINDING_STATE = {
  FULL: "full",
  READ_ONLY: "read-only",
  DEFERRED: "deferred",
  UNSUPPORTED: "unsupported"
};

function defaultDisplay(value) {
  if (typeof value === "boolean") {
    return value ? "开" : "关";
  }
  if (value === null || value === undefined || value === "") {
    return "未设置";
  }
  return String(value);
}

const CATEGORY_ZH = {
  Behavior: "行为",
  Downloads: "下载",
  Connection: "连接",
  Speed: "速度",
  BitTorrent: "BitTorrent",
  Queueing: "队列",
  "Web UI": "Web UI",
  RSS: "RSS",
  Advanced: "高级"
};

const GROUP_ZH = {
  General: "常规",
  Transfers: "传输",
  Advanced: "高级"
};

function zhLabel(text) {
  const source = String(text || "");
  const exactMap = {
    "Application language": "应用语言",
    "Default save path": "默认保存路径",
    "Performance warning": "性能警告",
    "Show external IP in status bar": "在状态栏显示外网 IP",
    "Confirm torrent deletion": "删除任务前确认",
    "Confirm torrent recheck": "重新校验前确认",
    "Delete content files with torrent": "删除任务时同时删除内容文件",
    "Start torrents paused": "新增任务后默认暂停",
    "Add torrents to top of queue": "新增任务置顶队列",
    "Automatic torrent management by default": "默认启用自动任务管理",
    "Auto TMM on category change": "分类变更时自动任务管理",
    "Auto TMM on default save path change": "默认保存路径变更时自动任务管理",
    "Auto TMM on category save-path change": "分类保存路径变更时自动任务管理",
    "Use temporary path": "使用临时路径",
    "Temporary path": "临时路径",
    "Pre-allocate disk space": "预分配磁盘空间",
    "Append .!qB extension": "未完成文件追加 .!qB 后缀",
    "Use .unwanted folder": "使用 .unwanted 文件夹",
    "Use category paths in manual mode": "手动模式下使用分类路径",
    "Export .torrent files to": "导出 .torrent 文件到",
    "Export finished .torrent files to": "导出已完成 .torrent 文件到",
    "Listening port": "监听端口",
    "Use UPnP/NAT-PMP": "使用 UPnP/NAT-PMP",
    "Global max connections": "全局最大连接数",
    "Per-torrent max connections": "单任务最大连接数",
    "Global max upload slots": "全局最大上传槽位",
    "Per-torrent max upload slots": "单任务最大上传槽位",
    "Use proxy for BitTorrent": "BitTorrent 使用代理",
    "Use proxy for peer connections": "对等连接使用代理",
    "Use proxy for RSS": "RSS 使用代理",
    "Use proxy for misc services": "其他服务使用代理",
    "Global download rate limit": "全局下载限速",
    "Global upload rate limit": "全局上传限速",
    "Alternative download rate limit": "替代下载限速",
    "Alternative upload rate limit": "替代上传限速",
    "Apply limits to uTP protocol": "对 uTP 协议应用限速",
    "Apply limits to transport overhead": "对传输开销应用限速",
    "Apply limits to LAN peers": "对局域网节点应用限速",
    "Enable alternate-rate scheduler": "启用替代限速计划器",
    "Scheduler start hour": "计划器开始小时",
    "Scheduler start minute": "计划器开始分钟",
    "Scheduler end hour": "计划器结束小时",
    "Scheduler end minute": "计划器结束分钟",
    "Scheduler days mask": "计划器生效日期掩码",
    "Enable DHT": "启用 DHT",
    "Enable PeX": "启用 PeX",
    "Enable LSD": "启用 LSD",
    "Anonymous mode": "匿名模式",
    "Encryption mode": "加密模式",
    "BitTorrent protocol mode": "BitTorrent 协议模式",
    "Recheck completed torrents": "重新校验已完成任务",
    "Max active checking torrents": "最大并行校验任务数",
    "Always add configured trackers": "始终附加已配置跟踪器",
    "Fetch trackers from URL list": "从 URL 列表获取跟踪器",
    "Enable queueing": "启用队列",
    "Max active downloads": "最大活动下载数",
    "Max active uploads": "最大活动上传数",
    "Max active torrents": "最大活动任务数",
    "Do not count slow torrents": "慢速任务不计入活动数",
    "Slow torrent download threshold": "慢速任务下载阈值",
    "Slow torrent upload threshold": "慢速任务上传阈值",
    "Slow torrent inactivity timer (s)": "慢速任务不活跃计时（秒）",
    "Enable max ratio": "启用分享率上限",
    "Max ratio": "分享率上限",
    "Enable max seeding time": "启用做种时长上限",
    "Max seeding time (min)": "最大做种时长（分钟）",
    "Enable max inactive seeding time": "启用不活跃做种时长上限",
    "Max inactive seeding time (min)": "最大不活跃做种时长（分钟）",
    "Share ratio action": "达到分享率上限后的动作",
    "Use HTTPS": "使用 HTTPS",
    "WebUI address": "WebUI 监听地址",
    "WebUI port": "WebUI 端口",
    "WebUI UPnP/NAT-PMP": "WebUI 使用 UPnP/NAT-PMP",
    "Host header whitelist": "Host 头白名单",
    "Bypass auth for localhost": "本地地址跳过认证",
    "Enable auth bypass subnet whitelist": "启用子网白名单认证绕过",
    "Auth bypass subnet whitelist": "认证绕过子网白名单",
    "Max auth failures": "最大认证失败次数",
    "Ban duration (s)": "封禁时长（秒）",
    "Session timeout (s)": "会话超时（秒）",
    "Clickjacking protection": "点击劫持防护",
    "CSRF protection": "CSRF 防护",
    "Secure cookie": "安全 Cookie",
    "Host header validation": "Host 头校验",
    "Reverse proxy support": "反向代理支持",
    "Trusted reverse proxies": "受信任反向代理",
    "Enable RSS processing": "启用 RSS 处理",
    "Enable RSS auto-downloading": "启用 RSS 自动下载",
    "Refresh interval (min)": "刷新间隔（分钟）",
    "Fetch delay (s)": "抓取延迟（秒）",
    "Max articles per feed": "每个订阅源最大文章数",
    "Download repack/proper episodes": "下载 repack/proper 剧集",
    "Smart episode filters": "智能剧集过滤规则",
    "Transfer list refresh interval (ms)": "任务列表刷新间隔（毫秒）",
    "Resolve peer host names": "解析节点主机名",
    "Resolve peer countries": "解析节点国家",
    "Reannounce when address changes": "地址变化时重新通告",
    "Resume data storage type": "续传数据存储类型",
    "Async I/O threads": "异步 I/O 线程数",
    "Hashing threads": "哈希线程数",
    "File pool size": "文件池大小",
    "Disk cache (MiB)": "磁盘缓存（MiB）",
    "Disk cache TTL (s)": "磁盘缓存 TTL（秒）",
    "Disk queue size": "磁盘队列大小",
    "Bdecode depth limit": "Bdecode 深度限制",
    "Bdecode token limit": "Bdecode 令牌限制",
    "Memory working set limit": "内存工作集限制",
    "Outgoing connections per second": "每秒发起连接数",
    "Announce IP": "通告 IP",
    "Announce port": "通告端口",
    "Send buffer watermark": "发送缓冲区水位",
    "Send buffer low watermark": "发送缓冲区低水位",
    "Send buffer watermark factor": "发送缓冲区水位因子",
    "WebUI username": "WebUI 用户名",
    "WebUI API key": "WebUI API 密钥",
    "Proxy host": "代理主机",
    "Proxy port": "代理端口",
    "Proxy type": "代理类型",
    "Monitored folders": "监控文件夹",
    "Additional trackers list": "附加跟踪器列表",
    "Additional trackers URL list": "附加跟踪器 URL 列表",
    "Email notification": "邮件通知",
    "File logging": "文件日志"
  };
  if (Object.prototype.hasOwnProperty.call(exactMap, source)) {
    return exactMap[source];
  }
  return source;
}

function createBinding(definition) {
  const readKeys = Array.isArray(definition.readKeys)
    ? definition.readKeys
    : (definition.key ? [definition.key] : []);
  const writeKeys = Array.isArray(definition.writeKeys)
    ? definition.writeKeys
    : (definition.key ? [definition.key] : []);

  return {
    bindingState: SETTING_BINDING_STATE.FULL,
    group: "General",
    type: "toggle",
    ...definition,
    readKeys,
    writeKeys,
    read:
      typeof definition.read === "function"
        ? definition.read
        : (preferences) => {
            if (!definition.key) {
              return "";
            }
            return preferences ? preferences[definition.key] : "";
          },
    display: typeof definition.display === "function" ? definition.display : defaultDisplay
  };
}

function validateStringInput(value, binding) {
  const text = String(value);
  const normalized = binding.trimInput ? text.trim() : text;
  if (!normalized && binding.allowEmpty !== true) {
    return {
      ok: false,
      error: binding.type === "path" ? "empty-path-not-allowed" : "empty-text-not-allowed"
    };
  }
  return {
    ok: true,
    value: normalized
  };
}

function requestPromptInput(message, initialValue) {
  try {
    const promptFn =
      (typeof window !== "undefined" && typeof window.prompt === "function" ? window.prompt : null)
      || (typeof globalThis !== "undefined" && typeof globalThis.prompt === "function" ? globalThis.prompt : null);

    if (!promptFn) {
      return {
        ok: false,
        error: "prompt-unavailable"
      };
    }

    const value = promptFn(message, initialValue);
    if (value === null) {
      return {
        ok: false,
        canceled: true
      };
    }
    return {
      ok: true,
      value
    };
  } catch {
    return {
      ok: false,
      error: "prompt-failed"
    };
  }
}

export const SETTINGS_BINDINGS = [
  // Behavior
  createBinding({ id: "locale", category: "Behavior", group: "General", label: "Application language", type: "text", key: "locale", display: (v) => asString(v, "系统默认") }),
  createBinding({ id: "performance_warning", category: "Behavior", group: "General", label: "Performance warning", key: "performance_warning" }),
  createBinding({ id: "status_bar_external_ip", category: "Behavior", group: "General", label: "Show external IP in status bar", key: "status_bar_external_ip" }),
  createBinding({ id: "confirm_torrent_deletion", category: "Behavior", group: "Transfers", label: "Confirm torrent deletion", key: "confirm_torrent_deletion" }),
  createBinding({ id: "confirm_torrent_recheck", category: "Behavior", group: "Transfers", label: "Confirm torrent recheck", key: "confirm_torrent_recheck" }),
  createBinding({ id: "delete_torrent_content_files", category: "Behavior", group: "Advanced", label: "Delete content files with torrent", key: "delete_torrent_content_files" }),

  // Downloads
  createBinding({ id: "save_path", category: "Downloads", group: "General", label: "Default save path", type: "path", key: "save_path", trimInput: true, allowEmpty: false, display: (v) => asString(v, "不可用") }),
  createBinding({ id: "add_stopped_enabled", category: "Downloads", group: "General", label: "Start torrents paused", type: "toggle", key: "add_stopped_enabled" }),
  createBinding({ id: "add_to_top_of_queue", category: "Downloads", group: "General", label: "Add torrents to top of queue", key: "add_to_top_of_queue" }),
  createBinding({ id: "auto_tmm_enabled", category: "Downloads", group: "General", label: "Automatic torrent management by default", key: "auto_tmm_enabled" }),
  createBinding({ id: "torrent_changed_tmm_enabled", category: "Downloads", group: "Transfers", label: "Auto TMM on category change", key: "torrent_changed_tmm_enabled" }),
  createBinding({ id: "save_path_changed_tmm_enabled", category: "Downloads", group: "Transfers", label: "Auto TMM on default save path change", key: "save_path_changed_tmm_enabled" }),
  createBinding({ id: "category_changed_tmm_enabled", category: "Downloads", group: "Transfers", label: "Auto TMM on category save-path change", key: "category_changed_tmm_enabled" }),
  createBinding({ id: "temp_path_enabled", category: "Downloads", group: "Transfers", label: "Use temporary path", key: "temp_path_enabled" }),
  createBinding({ id: "temp_path", category: "Downloads", group: "Transfers", label: "Temporary path", type: "path", key: "temp_path", trimInput: true, allowEmpty: true, display: (v) => asString(v, "未设置") }),
  createBinding({ id: "preallocate_all", category: "Downloads", group: "Transfers", label: "Pre-allocate disk space", key: "preallocate_all" }),
  createBinding({ id: "incomplete_files_ext", category: "Downloads", group: "Transfers", label: "Append .!qB extension", key: "incomplete_files_ext" }),
  createBinding({ id: "use_unwanted_folder", category: "Downloads", group: "Advanced", label: "Use .unwanted folder", key: "use_unwanted_folder" }),
  createBinding({ id: "use_category_paths_in_manual_mode", category: "Downloads", group: "Advanced", label: "Use category paths in manual mode", key: "use_category_paths_in_manual_mode" }),
  createBinding({ id: "export_dir", category: "Downloads", group: "Advanced", label: "Export .torrent files to", type: "path", key: "export_dir", trimInput: true, allowEmpty: true, display: (v) => asString(v, "未设置") }),
  createBinding({ id: "export_dir_fin", category: "Downloads", group: "Advanced", label: "Export finished .torrent files to", type: "path", key: "export_dir_fin", trimInput: true, allowEmpty: true, display: (v) => asString(v, "未设置") }),

  // Connection
  createBinding({ id: "listen_port", category: "Connection", group: "General", label: "Listening port", type: "number", key: "listen_port", min: 1, max: 65535 }),
  createBinding({ id: "upnp", category: "Connection", group: "General", label: "Use UPnP/NAT-PMP", key: "upnp" }),
  createBinding({ id: "max_connec", category: "Connection", group: "Transfers", label: "Global max connections", type: "number", key: "max_connec", min: 1 }),
  createBinding({ id: "max_connec_per_torrent", category: "Connection", group: "Transfers", label: "Per-torrent max connections", type: "number", key: "max_connec_per_torrent", min: 1 }),
  createBinding({ id: "max_uploads", category: "Connection", group: "Transfers", label: "Global max upload slots", type: "number", key: "max_uploads", min: 1 }),
  createBinding({ id: "max_uploads_per_torrent", category: "Connection", group: "Transfers", label: "Per-torrent max upload slots", type: "number", key: "max_uploads_per_torrent", min: 1 }),
  createBinding({ id: "proxy_bittorrent", category: "Connection", group: "Advanced", label: "Use proxy for BitTorrent", key: "proxy_bittorrent" }),
  createBinding({ id: "proxy_peer_connections", category: "Connection", group: "Advanced", label: "Use proxy for peer connections", key: "proxy_peer_connections" }),
  createBinding({ id: "proxy_rss", category: "Connection", group: "Advanced", label: "Use proxy for RSS", key: "proxy_rss" }),
  createBinding({ id: "proxy_misc", category: "Connection", group: "Advanced", label: "Use proxy for misc services", key: "proxy_misc" }),

  // Speed
  createBinding({ id: "dl_limit", category: "Speed", group: "General", label: "Global download rate limit", type: "rate", key: "dl_limit", display: (v) => formatBytesPerSecond(v) }),
  createBinding({ id: "up_limit", category: "Speed", group: "General", label: "Global upload rate limit", type: "rate", key: "up_limit", display: (v) => formatBytesPerSecond(v) }),
  createBinding({ id: "alt_dl_limit", category: "Speed", group: "Transfers", label: "Alternative download rate limit", type: "rate", key: "alt_dl_limit", display: (v) => formatBytesPerSecond(v) }),
  createBinding({ id: "alt_up_limit", category: "Speed", group: "Transfers", label: "Alternative upload rate limit", type: "rate", key: "alt_up_limit", display: (v) => formatBytesPerSecond(v) }),
  createBinding({ id: "limit_utp_rate", category: "Speed", group: "Transfers", label: "Apply limits to uTP protocol", key: "limit_utp_rate" }),
  createBinding({ id: "limit_tcp_overhead", category: "Speed", group: "Transfers", label: "Apply limits to transport overhead", key: "limit_tcp_overhead" }),
  createBinding({ id: "limit_lan_peers", category: "Speed", group: "Transfers", label: "Apply limits to LAN peers", key: "limit_lan_peers" }),
  createBinding({ id: "scheduler_enabled", category: "Speed", group: "Advanced", label: "Enable alternate-rate scheduler", key: "scheduler_enabled" }),
  createBinding({
    id: "schedule_from_hour",
    category: "Speed",
    group: "Advanced",
    label: "Scheduler start hour",
    type: "number",
    key: "schedule_from_hour",
    min: 0,
    max: 23,
    buildPatch(value, context = {}) {
      const preferences = (context && context.preferences) || {};
      return {
        schedule_from_hour: Math.round(Number(value)),
        schedule_from_min: asNumber(preferences.schedule_from_min, 0),
        schedule_to_hour: asNumber(preferences.schedule_to_hour, 0),
        schedule_to_min: asNumber(preferences.schedule_to_min, 0)
      };
    }
  }),
  createBinding({
    id: "schedule_from_min",
    category: "Speed",
    group: "Advanced",
    label: "Scheduler start minute",
    type: "number",
    key: "schedule_from_min",
    min: 0,
    max: 59,
    buildPatch(value, context = {}) {
      const preferences = (context && context.preferences) || {};
      return {
        schedule_from_hour: asNumber(preferences.schedule_from_hour, 0),
        schedule_from_min: Math.round(Number(value)),
        schedule_to_hour: asNumber(preferences.schedule_to_hour, 0),
        schedule_to_min: asNumber(preferences.schedule_to_min, 0)
      };
    }
  }),
  createBinding({
    id: "schedule_to_hour",
    category: "Speed",
    group: "Advanced",
    label: "Scheduler end hour",
    type: "number",
    key: "schedule_to_hour",
    min: 0,
    max: 23,
    buildPatch(value, context = {}) {
      const preferences = (context && context.preferences) || {};
      return {
        schedule_from_hour: asNumber(preferences.schedule_from_hour, 0),
        schedule_from_min: asNumber(preferences.schedule_from_min, 0),
        schedule_to_hour: Math.round(Number(value)),
        schedule_to_min: asNumber(preferences.schedule_to_min, 0)
      };
    }
  }),
  createBinding({
    id: "schedule_to_min",
    category: "Speed",
    group: "Advanced",
    label: "Scheduler end minute",
    type: "number",
    key: "schedule_to_min",
    min: 0,
    max: 59,
    buildPatch(value, context = {}) {
      const preferences = (context && context.preferences) || {};
      return {
        schedule_from_hour: asNumber(preferences.schedule_from_hour, 0),
        schedule_from_min: asNumber(preferences.schedule_from_min, 0),
        schedule_to_hour: asNumber(preferences.schedule_to_hour, 0),
        schedule_to_min: Math.round(Number(value))
      };
    }
  }),
  createBinding({ id: "scheduler_days", category: "Speed", group: "Advanced", label: "Scheduler days mask", type: "number", key: "scheduler_days", min: 0, max: 8 }),

  // BitTorrent
  createBinding({ id: "dht", category: "BitTorrent", group: "General", label: "Enable DHT", key: "dht" }),
  createBinding({ id: "pex", category: "BitTorrent", group: "General", label: "Enable PeX", key: "pex" }),
  createBinding({ id: "lsd", category: "BitTorrent", group: "General", label: "Enable LSD", key: "lsd" }),
  createBinding({ id: "anonymous_mode", category: "BitTorrent", group: "Transfers", label: "Anonymous mode", key: "anonymous_mode" }),
  createBinding({ id: "encryption", category: "BitTorrent", group: "Transfers", label: "Encryption mode", type: "number", key: "encryption", min: 0, max: 2 }),
  createBinding({ id: "bittorrent_protocol", category: "BitTorrent", group: "Transfers", label: "BitTorrent protocol mode", type: "number", key: "bittorrent_protocol", min: 0, max: 2 }),
  createBinding({ id: "recheck_completed_torrents", category: "BitTorrent", group: "Advanced", label: "Recheck completed torrents", key: "recheck_completed_torrents" }),
  createBinding({ id: "max_active_checking_torrents", category: "BitTorrent", group: "Advanced", label: "Max active checking torrents", type: "number", key: "max_active_checking_torrents", min: 1 }),
  createBinding({ id: "add_trackers_enabled", category: "BitTorrent", group: "Advanced", label: "Always add configured trackers", key: "add_trackers_enabled" }),
  createBinding({ id: "add_trackers_from_url_enabled", category: "BitTorrent", group: "Advanced", label: "Fetch trackers from URL list", key: "add_trackers_from_url_enabled" }),

  // Queueing
  createBinding({ id: "queueing_enabled", category: "Queueing", group: "General", label: "Enable queueing", key: "queueing_enabled" }),
  createBinding({ id: "max_active_downloads", category: "Queueing", group: "Transfers", label: "Max active downloads", type: "number", key: "max_active_downloads", min: 0 }),
  createBinding({ id: "max_active_uploads", category: "Queueing", group: "Transfers", label: "Max active uploads", type: "number", key: "max_active_uploads", min: 0 }),
  createBinding({ id: "max_active_torrents", category: "Queueing", group: "Transfers", label: "Max active torrents", type: "number", key: "max_active_torrents", min: 0 }),
  createBinding({ id: "dont_count_slow_torrents", category: "Queueing", group: "Advanced", label: "Do not count slow torrents", key: "dont_count_slow_torrents" }),
  createBinding({ id: "slow_torrent_dl_rate_threshold", category: "Queueing", group: "Advanced", label: "Slow torrent download threshold", type: "rate", key: "slow_torrent_dl_rate_threshold", display: (v) => formatBytesPerSecond(v) }),
  createBinding({ id: "slow_torrent_ul_rate_threshold", category: "Queueing", group: "Advanced", label: "Slow torrent upload threshold", type: "rate", key: "slow_torrent_ul_rate_threshold", display: (v) => formatBytesPerSecond(v) }),
  createBinding({ id: "slow_torrent_inactive_timer", category: "Queueing", group: "Advanced", label: "Slow torrent inactivity timer (s)", type: "number", key: "slow_torrent_inactive_timer", min: 0 }),
  createBinding({ id: "max_ratio_enabled", category: "Queueing", group: "Advanced", label: "Enable max ratio", key: "max_ratio_enabled" }),
  createBinding({
    id: "max_ratio",
    category: "Queueing",
    group: "Advanced",
    label: "Max ratio",
    type: "float",
    key: "max_ratio",
    min: 0,
    readKeys: ["max_ratio", "max_ratio_enabled"],
    read(preferences) {
      const enabled = asBool(preferences && preferences.max_ratio_enabled);
      const value = Number(preferences && preferences.max_ratio);
      if (!enabled || !Number.isFinite(value) || value < 0) {
        return 1;
      }
      return value;
    },
    display(value) {
      return Number(value).toFixed(2);
    },
    buildPatch(value) {
      return {
        max_ratio_enabled: true,
        max_ratio: Number(value)
      };
    }
  }),
  createBinding({ id: "max_seeding_time_enabled", category: "Queueing", group: "Advanced", label: "Enable max seeding time", key: "max_seeding_time_enabled" }),
  createBinding({
    id: "max_seeding_time",
    category: "Queueing",
    group: "Advanced",
    label: "Max seeding time (min)",
    type: "number",
    key: "max_seeding_time",
    min: 0,
    readKeys: ["max_seeding_time", "max_seeding_time_enabled"],
    read(preferences) {
      const enabled = asBool(preferences && preferences.max_seeding_time_enabled);
      const value = Number(preferences && preferences.max_seeding_time);
      if (!enabled || !Number.isFinite(value) || value < 0) {
        return 0;
      }
      return Math.round(value);
    },
    buildPatch(value) {
      return {
        max_seeding_time_enabled: true,
        max_seeding_time: Math.round(Number(value))
      };
    }
  }),
  createBinding({ id: "max_inactive_seeding_time_enabled", category: "Queueing", group: "Advanced", label: "Enable max inactive seeding time", key: "max_inactive_seeding_time_enabled" }),
  createBinding({
    id: "max_inactive_seeding_time",
    category: "Queueing",
    group: "Advanced",
    label: "Max inactive seeding time (min)",
    type: "number",
    key: "max_inactive_seeding_time",
    min: 0,
    readKeys: ["max_inactive_seeding_time", "max_inactive_seeding_time_enabled"],
    read(preferences) {
      const enabled = asBool(preferences && preferences.max_inactive_seeding_time_enabled);
      const value = Number(preferences && preferences.max_inactive_seeding_time);
      if (!enabled || !Number.isFinite(value) || value < 0) {
        return 0;
      }
      return Math.round(value);
    },
    buildPatch(value) {
      return {
        max_inactive_seeding_time_enabled: true,
        max_inactive_seeding_time: Math.round(Number(value))
      };
    }
  }),
  createBinding({ id: "max_ratio_act", category: "Queueing", group: "Advanced", label: "Share ratio action", type: "number", key: "max_ratio_act", min: 0 }),

  // Web UI
  createBinding({ id: "web_ui_address", category: "Web UI", group: "General", label: "WebUI address", type: "text", key: "web_ui_address", trimInput: true, allowEmpty: false }),
  createBinding({ id: "web_ui_port", category: "Web UI", group: "General", label: "WebUI port", type: "number", key: "web_ui_port", min: 1, max: 65535 }),
  createBinding({ id: "web_ui_upnp", category: "Web UI", group: "General", label: "WebUI UPnP/NAT-PMP", key: "web_ui_upnp" }),
  createBinding({ id: "use_https", category: "Web UI", group: "General", label: "Use HTTPS", key: "use_https" }),
  createBinding({ id: "web_ui_domain_list", category: "Web UI", group: "Transfers", label: "Host header whitelist", type: "text", key: "web_ui_domain_list", trimInput: true, allowEmpty: true, display: (v) => asString(v, "（空）") }),
  createBinding({ id: "bypass_local_auth", category: "Web UI", group: "Transfers", label: "Bypass auth for localhost", key: "bypass_local_auth" }),
  createBinding({ id: "bypass_auth_subnet_whitelist_enabled", category: "Web UI", group: "Transfers", label: "Enable auth bypass subnet whitelist", key: "bypass_auth_subnet_whitelist_enabled" }),
  createBinding({ id: "bypass_auth_subnet_whitelist", category: "Web UI", group: "Transfers", label: "Auth bypass subnet whitelist", type: "text", key: "bypass_auth_subnet_whitelist", trimInput: true, allowEmpty: true, display: (v) => asString(v, "（空）") }),
  createBinding({ id: "web_ui_max_auth_fail_count", category: "Web UI", group: "Advanced", label: "Max auth failures", type: "number", key: "web_ui_max_auth_fail_count", min: 0 }),
  createBinding({ id: "web_ui_ban_duration", category: "Web UI", group: "Advanced", label: "Ban duration (s)", type: "number", key: "web_ui_ban_duration", min: 0 }),
  createBinding({ id: "web_ui_session_timeout", category: "Web UI", group: "Advanced", label: "Session timeout (s)", type: "number", key: "web_ui_session_timeout", min: 0 }),
  createBinding({ id: "web_ui_clickjacking_protection_enabled", category: "Web UI", group: "Advanced", label: "Clickjacking protection", key: "web_ui_clickjacking_protection_enabled" }),
  createBinding({ id: "web_ui_csrf_protection_enabled", category: "Web UI", group: "Advanced", label: "CSRF protection", key: "web_ui_csrf_protection_enabled" }),
  createBinding({ id: "web_ui_secure_cookie_enabled", category: "Web UI", group: "Advanced", label: "Secure cookie", key: "web_ui_secure_cookie_enabled" }),
  createBinding({ id: "web_ui_host_header_validation_enabled", category: "Web UI", group: "Advanced", label: "Host header validation", key: "web_ui_host_header_validation_enabled" }),
  createBinding({ id: "web_ui_reverse_proxy_enabled", category: "Web UI", group: "Advanced", label: "Reverse proxy support", key: "web_ui_reverse_proxy_enabled" }),
  createBinding({ id: "web_ui_reverse_proxies_list", category: "Web UI", group: "Advanced", label: "Trusted reverse proxies", type: "text", key: "web_ui_reverse_proxies_list", trimInput: true, allowEmpty: true, display: (v) => asString(v, "（空）") }),

  // RSS
  createBinding({ id: "rss_processing_enabled", category: "RSS", group: "General", label: "Enable RSS processing", key: "rss_processing_enabled" }),
  createBinding({ id: "rss_auto_downloading_enabled", category: "RSS", group: "General", label: "Enable RSS auto-downloading", key: "rss_auto_downloading_enabled" }),
  createBinding({ id: "rss_refresh_interval", category: "RSS", group: "Transfers", label: "Refresh interval (min)", type: "number", key: "rss_refresh_interval", min: 1 }),
  createBinding({ id: "rss_fetch_delay", category: "RSS", group: "Transfers", label: "Fetch delay (s)", type: "number", key: "rss_fetch_delay", min: 0 }),
  createBinding({ id: "rss_max_articles_per_feed", category: "RSS", group: "Transfers", label: "Max articles per feed", type: "number", key: "rss_max_articles_per_feed", min: 1 }),
  createBinding({ id: "rss_download_repack_proper_episodes", category: "RSS", group: "Advanced", label: "Download repack/proper episodes", key: "rss_download_repack_proper_episodes" }),
  createBinding({ id: "rss_smart_episode_filters", category: "RSS", group: "Advanced", label: "Smart episode filters", type: "text", key: "rss_smart_episode_filters", trimInput: false, allowEmpty: true, display: (v) => asString(v, "（空）") }),

  // Advanced
  createBinding({ id: "refresh_interval", category: "Advanced", group: "General", label: "Transfer list refresh interval (ms)", type: "number", key: "refresh_interval", min: 0 }),
  createBinding({ id: "resolve_peer_host_names", category: "Advanced", group: "General", label: "Resolve peer host names", key: "resolve_peer_host_names" }),
  createBinding({ id: "resolve_peer_countries", category: "Advanced", group: "General", label: "Resolve peer countries", key: "resolve_peer_countries" }),
  createBinding({ id: "reannounce_when_address_changed", category: "Advanced", group: "General", label: "Reannounce when address changes", key: "reannounce_when_address_changed" }),
  createBinding({ id: "resume_data_storage_type", category: "Advanced", group: "Transfers", label: "Resume data storage type", type: "text", key: "resume_data_storage_type" }),
  createBinding({ id: "async_io_threads", category: "Advanced", group: "Transfers", label: "Async I/O threads", type: "number", key: "async_io_threads", min: 1 }),
  createBinding({ id: "hashing_threads", category: "Advanced", group: "Transfers", label: "Hashing threads", type: "number", key: "hashing_threads", min: 1 }),
  createBinding({ id: "file_pool_size", category: "Advanced", group: "Transfers", label: "File pool size", type: "number", key: "file_pool_size", min: 1 }),
  createBinding({ id: "disk_cache", category: "Advanced", group: "Transfers", label: "Disk cache (MiB)", type: "number", key: "disk_cache", min: -1 }),
  createBinding({ id: "disk_cache_ttl", category: "Advanced", group: "Transfers", label: "Disk cache TTL (s)", type: "number", key: "disk_cache_ttl", min: 0 }),
  createBinding({ id: "disk_queue_size", category: "Advanced", group: "Transfers", label: "Disk queue size", type: "number", key: "disk_queue_size", min: -1 }),
  createBinding({ id: "bdecode_depth_limit", category: "Advanced", group: "Advanced", label: "Bdecode depth limit", type: "number", key: "bdecode_depth_limit", min: 1 }),
  createBinding({ id: "bdecode_token_limit", category: "Advanced", group: "Advanced", label: "Bdecode token limit", type: "number", key: "bdecode_token_limit", min: 1 }),
  createBinding({ id: "memory_working_set_limit", category: "Advanced", group: "Advanced", label: "Memory working set limit", type: "number", key: "memory_working_set_limit", min: 0 }),
  createBinding({ id: "connection_speed", category: "Advanced", group: "Advanced", label: "Outgoing connections per second", type: "number", key: "connection_speed", min: 1 }),
  createBinding({ id: "announce_ip", category: "Advanced", group: "Advanced", label: "Announce IP", type: "text", key: "announce_ip", trimInput: true, allowEmpty: true, display: (v) => asString(v, "（自动）") }),
  createBinding({ id: "announce_port", category: "Advanced", group: "Advanced", label: "Announce port", type: "number", key: "announce_port", min: 0, max: 65535 }),
  createBinding({ id: "send_buffer_watermark", category: "Advanced", group: "Advanced", label: "Send buffer watermark", type: "number", key: "send_buffer_watermark", min: 0 }),
  createBinding({ id: "send_buffer_low_watermark", category: "Advanced", group: "Advanced", label: "Send buffer low watermark", type: "number", key: "send_buffer_low_watermark", min: 0 }),
  createBinding({ id: "send_buffer_watermark_factor", category: "Advanced", group: "Advanced", label: "Send buffer watermark factor", type: "number", key: "send_buffer_watermark_factor", min: 0 }),

  // Explicit read-only parity rows
  createBinding({ id: "web_ui_username", category: "Web UI", group: "Transfers", label: "WebUI username", type: "text", key: "web_ui_username", bindingState: SETTING_BINDING_STATE.READ_ONLY, display: (v) => asString(v, "（空）") }),
  createBinding({ id: "web_ui_api_key", category: "Web UI", group: "Advanced", label: "WebUI API key", type: "text", key: "web_ui_api_key", bindingState: SETTING_BINDING_STATE.READ_ONLY, display: (v) => (asString(v, "") ? "已配置" : "未配置") }),
  createBinding({ id: "proxy_ip", category: "Connection", group: "Advanced", label: "Proxy host", type: "text", key: "proxy_ip", bindingState: SETTING_BINDING_STATE.READ_ONLY, display: (v) => asString(v, "（无）") }),
  createBinding({ id: "proxy_port", category: "Connection", group: "Advanced", label: "Proxy port", type: "number", key: "proxy_port", bindingState: SETTING_BINDING_STATE.READ_ONLY }),
  createBinding({ id: "proxy_type", category: "Connection", group: "Advanced", label: "Proxy type", type: "text", key: "proxy_type", bindingState: SETTING_BINDING_STATE.READ_ONLY }),

  // Explicit deferred parity rows
  createBinding({ id: "scan_dirs", category: "Downloads", group: "Advanced", label: "Monitored folders", type: "text", bindingState: SETTING_BINDING_STATE.DEFERRED, note: "复杂文件夹表格编辑暂缓。" }),
  createBinding({ id: "add_trackers", category: "BitTorrent", group: "Advanced", label: "Additional trackers list", type: "text", key: "add_trackers", bindingState: SETTING_BINDING_STATE.DEFERRED, note: "大型多行列表编辑暂缓。" }),
  createBinding({ id: "add_trackers_url_list", category: "BitTorrent", group: "Advanced", label: "Additional trackers URL list", type: "text", key: "add_trackers_url_list", bindingState: SETTING_BINDING_STATE.DEFERRED, note: "多来源 URL 管理暂缓。" }),
  createBinding({ id: "mail_notification_enabled", category: "Behavior", group: "Advanced", label: "Email notification", type: "toggle", key: "mail_notification_enabled", bindingState: SETTING_BINDING_STATE.DEFERRED, note: "涉及凭据的 SMTP 流程暂缓。" }),
  createBinding({ id: "file_log_enabled", category: "Behavior", group: "Advanced", label: "File logging", type: "toggle", key: "file_log_enabled", bindingState: SETTING_BINDING_STATE.DEFERRED, note: "多字段日志策略编辑暂缓。" })
];

export function getBindingsForCategory(category) {
  return SETTINGS_BINDINGS.filter((item) => item.category === category);
}

export function resolveBindingAvailability(binding, preferences = {}) {
  if (!binding) {
    return SETTING_BINDING_STATE.UNSUPPORTED;
  }

  if (binding.bindingState === SETTING_BINDING_STATE.READ_ONLY) {
    return SETTING_BINDING_STATE.READ_ONLY;
  }

  if (binding.bindingState === SETTING_BINDING_STATE.DEFERRED) {
    return SETTING_BINDING_STATE.DEFERRED;
  }

  const required = Array.isArray(binding.readKeys) ? binding.readKeys.filter(Boolean) : [];
  if (!required.length) {
    return SETTING_BINDING_STATE.UNSUPPORTED;
  }

  const missing = required.some((key) => !Object.prototype.hasOwnProperty.call(preferences || {}, key));
  if (missing) {
    return SETTING_BINDING_STATE.UNSUPPORTED;
  }

  return SETTING_BINDING_STATE.FULL;
}

function availabilitySuffix(state) {
  if (state === SETTING_BINDING_STATE.READ_ONLY) {
    return "只读";
  }
  if (state === SETTING_BINDING_STATE.DEFERRED) {
    return "暂缓";
  }
  if (state === SETTING_BINDING_STATE.UNSUPPORTED) {
    return "不支持";
  }
  return "";
}

export function buildSettingsView(category, preferences = {}, options = {}) {
  const rows = getBindingsForCategory(category).map((binding) => {
    const availability = resolveBindingAvailability(binding, preferences);
    const rawValue = availability === SETTING_BINDING_STATE.UNSUPPORTED
      ? ""
      : binding.read(preferences);
    const displayValue = availability === SETTING_BINDING_STATE.UNSUPPORTED
      ? "不可用"
      : binding.display(rawValue);
    const isPending = options.pendingId === binding.id;
    const isGloballyDisabled = Boolean(options.disabled);
    const editable = availability === SETTING_BINDING_STATE.FULL;
    const disabled = isGloballyDisabled || isPending;
    const suffix = availabilitySuffix(availability);

    return {
      ...binding,
      categoryLabel: CATEGORY_ZH[binding.category] || binding.category,
      groupLabel: GROUP_ZH[binding.group] || binding.group,
      label: zhLabel(binding.label),
      note: binding.note ? zhLabel(binding.note) : "",
      availability,
      rawValue,
      displayValue,
      pending: isPending,
      disabled,
      editable,
      actionText: isPending
        ? "保存中..."
        : suffix
          ? `${displayValue} · ${suffix}`
          : displayValue
    };
  });

  const groups = ["General", "Transfers", "Advanced"].map((group) => ({
    key: group,
    name: GROUP_ZH[group] || group,
    rows: rows.filter((row) => row.group === group)
  }));

  return {
    groups,
    hasRows: rows.length > 0,
    counts: {
      full: rows.filter((row) => row.availability === SETTING_BINDING_STATE.FULL).length,
      readOnly: rows.filter((row) => row.availability === SETTING_BINDING_STATE.READ_ONLY).length,
      deferred: rows.filter((row) => row.availability === SETTING_BINDING_STATE.DEFERRED).length,
      unsupported: rows.filter((row) => row.availability === SETTING_BINDING_STATE.UNSUPPORTED).length
    }
  };
}

export function createPreferencePatch(binding, currentValue) {
  if (!binding) {
    return {
      ok: false,
      error: "unknown-setting-binding"
    };
  }

  if (binding.bindingState !== SETTING_BINDING_STATE.FULL) {
    return {
      ok: false,
      error: `setting-${binding.bindingState}`
    };
  }

  if (binding.type === "toggle") {
    if (typeof binding.buildPatch === "function") {
      return {
        ok: true,
        patch: binding.buildPatch(currentValue)
      };
    }
    return {
      ok: true,
      patch: {
        [binding.key || binding.id]: !Boolean(currentValue)
      }
    };
  }

  if (binding.type === "path") {
    const next = requestPromptInput(`Set ${binding.label}`, String(currentValue || ""));
    if (!next.ok) {
      return next;
    }
    const validated = validateStringInput(next.value, binding);
    if (!validated.ok) {
      return validated;
    }
    return {
      ok: true,
      patch: {
        [binding.key || binding.id]: validated.value
      }
    };
  }

  if (binding.type === "rate") {
    const currentKib = Math.round(asNumber(currentValue, 0) / 1024);
    const next = requestPromptInput(
      `${binding.label} (KiB/s, 0 for unlimited)`,
      String(currentKib)
    );
    if (!next.ok) {
      return next;
    }
    const parsed = parseRateInput(next.value, currentValue);
    if (parsed === null) {
      return {
        ok: false,
        error: "invalid-rate-input"
      };
    }
    return {
      ok: true,
      patch: {
        [binding.key || binding.id]: parsed
      }
    };
  }

  if (binding.type === "float") {
    const next = requestPromptInput(`${binding.label}`, String(Number(currentValue)));
    if (!next.ok) {
      return next;
    }
    const parsed = Number(next.value);
    if (!Number.isFinite(parsed) || (typeof binding.min === "number" && parsed < binding.min)) {
      return {
        ok: false,
        error: "invalid-float-input"
      };
    }
    if (typeof binding.max === "number" && parsed > binding.max) {
      return {
        ok: false,
        error: "float-above-max"
      };
    }
    return {
      ok: true,
      patch: {
        [binding.key || binding.id]: parsed
      }
    };
  }

  if (binding.type === "number") {
    const next = requestPromptInput(`${binding.label}`, String(asNumber(currentValue, 0)));
    if (!next.ok) {
      return next;
    }
    const parsed = Number(next.value);
    if (!Number.isFinite(parsed)) {
      return {
        ok: false,
        error: "invalid-number-input"
      };
    }
    if (typeof binding.min === "number" && parsed < binding.min) {
      return {
        ok: false,
        error: "number-below-min"
      };
    }
    if (typeof binding.max === "number" && parsed > binding.max) {
      return {
        ok: false,
        error: "number-above-max"
      };
    }
    return {
      ok: true,
      patch: {
        [binding.key || binding.id]: Math.round(parsed)
      }
    };
  }

  if (binding.type === "text") {
    const next = requestPromptInput(`Set ${binding.label}`, String(currentValue || ""));
    if (!next.ok) {
      return next;
    }
    const validated = validateStringInput(next.value, binding);
    if (!validated.ok) {
      return validated;
    }
    return {
      ok: true,
      patch: {
        [binding.key || binding.id]: validated.value
      }
    };
  }

  return {
    ok: false,
    error: "unsupported-setting-binding-type"
  };
}

export async function createPreferencePatchAsync(binding, currentValue, requestInput, context = {}) {
  if (!binding) {
    return {
      ok: false,
      error: "unknown-setting-binding"
    };
  }

  if (binding.bindingState !== SETTING_BINDING_STATE.FULL) {
    return {
      ok: false,
      error: `setting-${binding.bindingState}`
    };
  }

  if (binding.type === "toggle") {
    if (typeof binding.buildPatch === "function") {
      return {
        ok: true,
        patch: binding.buildPatch(currentValue, context)
      };
    }
    return {
      ok: true,
      patch: {
        [binding.key || binding.id]: !Boolean(currentValue)
      }
    };
  }

  const ask = typeof requestInput === "function"
    ? requestInput
    : (opts) => requestPromptInput(opts.message, opts.initialValue);

  if (binding.type === "path") {
    const next = await ask({
      message: `Set ${binding.label}`,
      initialValue: String(currentValue || ""),
      binding
    });
    if (!next || !next.ok) {
      return next || { ok: false, error: "editor-failed" };
    }
    const validated = validateStringInput(next.value, binding);
    if (!validated.ok) {
      return validated;
    }
    return {
      ok: true,
      patch: {
        [binding.key || binding.id]: validated.value
      }
    };
  }

  if (binding.type === "rate") {
    const currentKib = Math.round(asNumber(currentValue, 0) / 1024);
    const next = await ask({
      message: `${binding.label} (KiB/s, 0 for unlimited)`,
      initialValue: String(currentKib),
      binding
    });
    if (!next || !next.ok) {
      return next || { ok: false, error: "editor-failed" };
    }
    const parsed = parseRateInput(next.value, currentValue);
    if (parsed === null) {
      return {
        ok: false,
        error: "invalid-rate-input"
      };
    }
    return {
      ok: true,
      patch: {
        [binding.key || binding.id]: parsed
      }
    };
  }

  if (binding.type === "float") {
    const next = await ask({
      message: binding.label,
      initialValue: String(Number(currentValue)),
      binding
    });
    if (!next || !next.ok) {
      return next || { ok: false, error: "editor-failed" };
    }
    const parsed = Number(next.value);
    if (!Number.isFinite(parsed) || (typeof binding.min === "number" && parsed < binding.min)) {
      return {
        ok: false,
        error: "invalid-float-input"
      };
    }
    if (typeof binding.max === "number" && parsed > binding.max) {
      return {
        ok: false,
        error: "float-above-max"
      };
    }
    return {
      ok: true,
        patch: typeof binding.buildPatch === "function"
        ? binding.buildPatch(parsed, context)
        : { [binding.key || binding.id]: parsed }
    };
  }

  if (binding.type === "number") {
    const next = await ask({
      message: binding.label,
      initialValue: String(asNumber(currentValue, 0)),
      binding
    });
    if (!next || !next.ok) {
      return next || { ok: false, error: "editor-failed" };
    }
    const parsed = Number(next.value);
    if (!Number.isFinite(parsed)) {
      return {
        ok: false,
        error: "invalid-number-input"
      };
    }
    if (typeof binding.min === "number" && parsed < binding.min) {
      return {
        ok: false,
        error: "number-below-min"
      };
    }
    if (typeof binding.max === "number" && parsed > binding.max) {
      return {
        ok: false,
        error: "number-above-max"
      };
    }
    return {
      ok: true,
        patch: typeof binding.buildPatch === "function"
        ? binding.buildPatch(Math.round(parsed), context)
        : { [binding.key || binding.id]: Math.round(parsed) }
    };
  }

  if (binding.type === "text") {
    const next = await ask({
      message: `Set ${binding.label}`,
      initialValue: String(currentValue || ""),
      binding
    });
    if (!next || !next.ok) {
      return next || { ok: false, error: "editor-failed" };
    }
    const validated = validateStringInput(next.value, binding);
    if (!validated.ok) {
      return validated;
    }
    return {
      ok: true,
      patch: {
        [binding.key || binding.id]: validated.value
      }
    };
  }

  return createPreferencePatch(binding, currentValue);
}

