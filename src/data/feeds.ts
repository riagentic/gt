// Curated keyless news feeds. `region` drives filtering; `gn()` wraps
// publishers without public RSS in a Google News site: search.
export type Region =
  | "world"
  | "us"
  | "europe"
  | "mideast"
  | "asia"
  | "africa"
  | "latam"
  | "defense"
  | "business"
  | "tech"
  | "social"
  | "good";
export type Feed = { id: string; name: string; url: string; region: Region };

const gn = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

export const REGIONS: { id: Region; label: string }[] = [
  { id: "world", label: "World" },
  { id: "us", label: "Americas · US" },
  { id: "europe", label: "Europe" },
  { id: "mideast", label: "Middle East" },
  { id: "asia", label: "Asia-Pacific" },
  { id: "africa", label: "Africa" },
  { id: "latam", label: "Latin America" },
  { id: "defense", label: "Defense · Security" },
  { id: "business", label: "Business · Energy" },
  { id: "tech", label: "Tech" },
  { id: "social", label: "Reddit · Hacker News" },
  { id: "good", label: "Good news" },
];

export const FEEDS: Feed[] = [
  { id: "bbc", name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", region: "world" },
  { id: "guardian", name: "The Guardian", url: "https://www.theguardian.com/world/rss", region: "world" },
  { id: "reuters", name: "Reuters", url: gn("site:reuters.com world"), region: "world" },
  { id: "ap", name: "AP News", url: gn("site:apnews.com world"), region: "world" },
  { id: "aljazeera", name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", region: "world" },
  { id: "dw", name: "DW", url: "https://rss.dw.com/xml/rss-en-all", region: "world" },
  { id: "france24", name: "France 24", url: "https://www.france24.com/en/rss", region: "world" },
  { id: "npr", name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml", region: "world" },
  { id: "un", name: "UN News", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", region: "world" },
  { id: "nyt", name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", region: "world" },
  { id: "reliefweb", name: "ReliefWeb", url: "https://reliefweb.int/updates/rss.xml", region: "world" },

  { id: "npr-us", name: "NPR", url: "https://feeds.npr.org/1001/rss.xml", region: "us" },
  { id: "pbs", name: "PBS NewsHour", url: "https://www.pbs.org/newshour/feeds/rss/headlines", region: "us" },
  { id: "politico", name: "Politico", url: "https://rss.politico.com/politics-news.xml", region: "us" },
  { id: "cbc", name: "CBC", url: "https://www.cbc.ca/webfeed/rss/rss-world", region: "us" },

  { id: "bbc-eu", name: "BBC Europe", url: "https://feeds.bbci.co.uk/news/world/europe/rss.xml", region: "europe" },
  { id: "euronews", name: "Euronews", url: "https://www.euronews.com/rss?level=theme&name=news", region: "europe" },
  { id: "politico-eu", name: "Politico Europe", url: "https://www.politico.eu/feed/", region: "europe" },
  { id: "kyiv", name: "Kyiv Independent", url: "https://kyivindependent.com/news-archive/rss/", region: "europe" },
  { id: "meduza", name: "Meduza", url: "https://meduza.io/rss/en/all", region: "europe" },
  { id: "ecdc", name: "ECDC", url: "https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed", region: "europe" },

  {
    id: "bbc-me",
    name: "BBC Middle East",
    url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
    region: "mideast",
  },
  { id: "toi", name: "Times of Israel", url: "https://www.timesofisrael.com/feed/", region: "mideast" },
  { id: "almonitor", name: "Al-Monitor", url: "https://www.al-monitor.com/rss", region: "mideast" },
  { id: "iranintl", name: "Iran International", url: gn("site:iranintl.com/en"), region: "mideast" },

  { id: "bbc-asia", name: "BBC Asia", url: "https://feeds.bbci.co.uk/news/world/asia/rss.xml", region: "asia" },
  { id: "scmp", name: "SCMP", url: "https://www.scmp.com/rss/91/feed", region: "asia" },
  { id: "diplomat", name: "The Diplomat", url: "https://thediplomat.com/feed/", region: "asia" },
  { id: "nikkei", name: "Nikkei Asia", url: gn("site:asia.nikkei.com"), region: "asia" },
  { id: "hindu", name: "The Hindu", url: gn("site:thehindu.com international"), region: "asia" },
  { id: "abc-au", name: "ABC Australia", url: "https://www.abc.net.au/news/feed/2942460/rss.xml", region: "asia" },

  { id: "bbc-africa", name: "BBC Africa", url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", region: "africa" },
  {
    id: "allafrica",
    name: "AllAfrica",
    url: "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf",
    region: "africa",
  },
  { id: "africanews", name: "Africanews", url: gn("site:africanews.com"), region: "africa" },

  {
    id: "bbc-latam",
    name: "BBC Latin America",
    url: "https://feeds.bbci.co.uk/news/world/latin_america/rss.xml",
    region: "latam",
  },
  { id: "mercopress", name: "MercoPress", url: "https://en.mercopress.com/rss/", region: "latam" },
  { id: "insightcrime", name: "InSight Crime", url: "https://insightcrime.org/feed/", region: "latam" },

  { id: "defenseone", name: "Defense One", url: "https://www.defenseone.com/rss/all/", region: "defense" },
  { id: "twz", name: "The War Zone", url: "https://www.twz.com/feed", region: "defense" },
  { id: "breakingdef", name: "Breaking Defense", url: "https://breakingdefense.com/feed/", region: "defense" },
  { id: "warontherocks", name: "War on the Rocks", url: "https://warontherocks.com/feed/", region: "defense" },
  { id: "usni", name: "USNI News", url: "https://news.usni.org/feed", region: "defense" },
  { id: "crisisgroup", name: "Crisis Group", url: "https://www.crisisgroup.org/rss.xml", region: "defense" },
  { id: "bellingcat", name: "Bellingcat", url: "https://www.bellingcat.com/feed/", region: "defense" },

  { id: "cnbc", name: "CNBC World", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", region: "business" },
  { id: "ft", name: "Financial Times", url: gn("site:ft.com world"), region: "business" },
  { id: "oilprice", name: "OilPrice", url: "https://oilprice.com/rss/main", region: "business" },
  {
    id: "economist",
    name: "The Economist",
    url: "https://www.economist.com/international/rss.xml",
    region: "business",
  },

  { id: "ars", name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", region: "tech" },
  { id: "verge", name: "The Verge", url: "https://www.theverge.com/rss/index.xml", region: "tech" },
  { id: "techcrunch", name: "TechCrunch", url: "https://techcrunch.com/feed/", region: "tech" },
  { id: "therecord", name: "The Record", url: "https://therecord.media/feed", region: "tech" },
  { id: "techmeme", name: "Techmeme", url: "https://www.techmeme.com/feed.xml", region: "tech" },
  { id: "arxiv-ai", name: "arXiv AI", url: "https://rss.arxiv.org/rss/cs.AI", region: "tech" },

  { id: "hn", name: "Hacker News", url: "https://hnrss.org/frontpage", region: "social" },
  { id: "r-worldnews", name: "r/worldnews", url: "https://www.reddit.com/r/worldnews/.rss", region: "social" },
  { id: "r-geopolitics", name: "r/geopolitics", url: "https://www.reddit.com/r/geopolitics/.rss", region: "social" },

  { id: "gnn", name: "Good News Network", url: "https://www.goodnewsnetwork.org/feed/", region: "good" },
  { id: "positive", name: "Positive News", url: "https://www.positive.news/feed/", region: "good" },
];
