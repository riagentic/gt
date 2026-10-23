// Live TV channels. YouTube ones play their current live video (looked up by tvlive); `page` ones (banned from
// YouTube, or streaming 24/7 only on their own site) open that site. Groups are the owner's own classification.
export type ChannelGroup =
  | "Left · Woke · Globalist"
  | "Right · Patriot"
  | "Christian"
  | "State-run"
  | "World"
  | "Live events"
  | "Business"
  | "Tech · AI"
  | "Science · Space"
  | "Weather";
/** `id`: a YouTube channel id (UC…), or `web:<name>` for a `page` channel. */
export type Channel = { id: string; name: string; group: ChannelGroup; page?: string };

const C = (group: ChannelGroup, rows: [string, string][]): Channel[] => rows.map(([name, id]) => ({ id, name, group }));

export const CHANNELS: Channel[] = [
  ...C("Left · Woke · Globalist", [
    ["BBC News", "UC16niRr50-MSBwiO3YDb3RA"],
    ["Sky News", "UCoMdktPbSTixAyNGwb-UYkQ"],
    ["ABC News", "UCBi2mrWuNuyYy4gbM6fU18Q"],
    ["CBS News", "UC8p1vwvWtl6T73JiExfWs1g"],
    ["NBC News NOW", "UCeY0bbntWzzVIaj2z3QigXg"],
    ["The Guardian", "UCIRYBXDze5krPDzAEOxFGVA"],
    ["The Young Turks", "UC1yBKRuGpC1tSM73A0ZjYjQ"],
    ["CBC News", "UCuFFtHWoLl5fauMMD5Ww2jA"],
    ["ABC Australia", "UCVgO39Bk5sMo66-6o6Spn6Q"],
    ["DW News", "UCknLrEdhRCp1aegoMqRaCZg"],
    ["France 24", "UCQfwfsi5VrQ8yKZ-UWmAEFg"],
    ["Euronews", "UCSrZ3UV4jOidv8ppoVuvW9Q"],
    ["Reuters", "UChqUTb7kYRX8-EiaN3XFrSQ"],
    ["AP", "UC52X5wxOL_s5yw0dQk7NtgA"],
  ]),
  ...C("Right · Patriot", [
    ["GB News", "UC0vn8ISa4LKMunLbzaXLnOQ"],
    ["Newsmax", "UCx6h-dWzJ5NpAlja1YsApdg"],
    ["Real America's Voice", "UCMGZ8pfQHgZ6Yj0-92PMENg"],
    ["RSBN", "UCnpTPx4qyTsKX_pup3D6KBA"],
    ["OANN", "UCNbIDJNNgaRrXOD7VllIMRQ"],
    ["Timcast IRL", "UCLwNTXWEjVd2qIHLcXxQWxA"],
    ["Steven Crowder", "UCIveFvW-ARp_B_RckhweNJw"],
    ["Daily Wire", "UCaeO5vkdj5xOQHp4UmIN6dw"],
    ["Tucker Carlson", "UCGttrUON87gWfU6dMWm1fcA"],
    ["Redacted", "UCoJhK5kMc4LjBKdiYrDtzlA"],
  ]),
  { id: "web:infowars", name: "Infowars", group: "Right · Patriot", page: "https://www.infowars.com/show" },
  { id: "web:ewtn", name: "EWTN", group: "Christian", page: "https://www.ewtn.com/live" },
  {
    id: "web:daystar",
    name: "Daystar",
    group: "Christian",
    page: "https://www.lightcast.com/embed/player.php?id=37099&type=live&multiBitrate=1",
  },
  ...C("Christian", [
    ["Vatican News", "UC7E-LYc1wivk33iyt5bR5zQ"],
    ["Amazing Facts TV", "UC6VJE6cD8ZPpe6ZOtVtlBTA"],
    ["GOD TV", "UC1_JSuk0BSA_FWzSvMsezGg"],
  ]),
  ...C("State-run", [
    ["Al Jazeera", "UCNye-wNBqNL5ZzHSJj3l8Bg"],
    ["CGTN", "UCgrNz-aDmcr2uuto8_DL2jg"],
    ["TRT World", "UC7fWeaHhqgM4Ry-RMpM2YYw"],
  ]),
  ...C("World", [
    ["NHK World", "UCSPEjw8F2nQDtmUKPFNF7_A"],
    ["CNA", "UC83jt4dlz1Gjl58fzQrrKZg"],
    ["TVP World", "UCBjUPsHj7bXt24SUWNoZ0zA"],
    ["WION", "UC_gUM8rL-Lrg6O3adPW9K1g"],
    ["NDTV", "UCZFMm1mMw0F81Z37aaEzTUA"],
    ["India Today", "UCYPvAwZP8pZhSMW8qs7cVCw"],
  ]),
  ...C("Live events", [["LiveNOW", "UCJg9wBPyKMNA5sRDnvzmkdg"]]),
  ...C("Business", [
    ["Bloomberg", "UCIALMKvObZNtJ6AmdCLP7Lg"],
    ["Yahoo Finance", "UCEAZeUIeJs0IjQiqTCdVSIg"],
    ["Schwab Network", "UCqoSrYgusd8ZddtMoWhjHYA"],
  ]),
  ...C("Tech · AI", [["TBPN", "UC-DRzaGnL_vtBUpCFH5M0tg"]]),
  ...C("Science · Space", [
    ["NASA · ISS", "UCLA_DiR1FfKNvjuUpBHmylQ"],
    ["Sen · Earth 4K", "UCkvW_7kp9LJrztmgA4q4bJQ"],
  ]),
  ...C("Weather", [["WeatherNation", "UCiOmTCan1HRYtZ_wWu15KJQ"]]),
];
export const GROUPS = [...new Set(CHANNELS.map((c) => c.group))];
export const YOUTUBE = CHANNELS.filter((c) => !c.page).map((c) => c.id);
