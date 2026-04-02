export const PRIMARY_FILTERS = ["All", "Downloading", "Completed", "Seeding", "Paused", "Error"];

export const SETTINGS_CATEGORIES = [
  {
    group: "Core",
    items: ["Behavior", "Downloads", "Connection", "Speed", "BitTorrent", "Queueing"]
  },
  {
    group: "Services",
    items: ["Web UI", "RSS", "Advanced"]
  }
];

export function createMockTorrents() {
  return [
    {
      id: "t-1001",
      name: "Ubuntu 24.04 LTS x64",
      state: "Downloading",
      progress: 0.46,
      size: "4.8 GB",
      downSpeed: "8.1 MB/s",
      upSpeed: "380 KB/s",
      eta: "17m",
      addedAt: "2026-03-31 20:10"
    },
    {
      id: "t-1002",
      name: "Fedora Workstation ISO",
      state: "Seeding",
      progress: 1,
      size: "2.3 GB",
      downSpeed: "0 B/s",
      upSpeed: "2.0 MB/s",
      eta: "Done",
      addedAt: "2026-03-31 18:42"
    },
    {
      id: "t-1003",
      name: "Open Data Archive Pack",
      state: "Paused",
      progress: 0.71,
      size: "12.5 GB",
      downSpeed: "0 B/s",
      upSpeed: "0 B/s",
      eta: "Paused",
      addedAt: "2026-03-30 11:03"
    },
    {
      id: "t-1004",
      name: "Sample Video Bundle",
      state: "Completed",
      progress: 1,
      size: "18.0 GB",
      downSpeed: "0 B/s",
      upSpeed: "640 KB/s",
      eta: "Done",
      addedAt: "2026-03-29 15:19"
    },
    {
      id: "t-1005",
      name: "Legacy Mirror (retry)",
      state: "Error",
      progress: 0.12,
      size: "900 MB",
      downSpeed: "0 B/s",
      upSpeed: "0 B/s",
      eta: "Stalled",
      addedAt: "2026-03-31 07:55"
    },
    {
      id: "t-1006",
      name: "Rust Learning Bundle",
      state: "Downloading",
      progress: 0.23,
      size: "1.6 GB",
      downSpeed: "3.4 MB/s",
      upSpeed: "91 KB/s",
      eta: "26m",
      addedAt: "2026-03-31 21:40"
    }
  ];
}
