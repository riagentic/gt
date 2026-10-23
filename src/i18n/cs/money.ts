// Markets + Predictions tabs (src/ui/Money.tsx) + the market labels they show (econ, signals, quote groups).
export default {
  "Markets": "Trhy",
  "Loading quotes…": "Načítám kotace…",
  "Sentiment": "Sentiment",
  "Stocks · CNN": "Akcie · CNN",
  "1 week ago {week} · 1 month ago {month}": "Před týdnem {week} · před měsícem {month}",
  "Crypto": "Krypto",
  "Extreme greed": "Extrémní chamtivost",
  "Greed": "Chamtivost",
  "Neutral": "Neutrální",
  "Fear": "Strach",
  "Extreme fear": "Extrémní strach",
  "Rates · debt": "Sazby · dluh",
  "Speculator positioning · CFTC": "Pozice spekulantů · CFTC",
  "Net {net} contracts · {date}": "Čistě {net} kontraktů · {date}",
  "net long": "čistě long",
  "net short": "čistě short",
  "Non-commercial net position as a share of open interest, weekly report {date}.":
    "Čistá pozice nekomerčních obchodníků jako podíl otevřených pozic, týdenní report z {date}.",
  "Prices delayed. Change vs. previous close (crypto: 24h).":
    "Ceny jsou zpožděné. Změna proti předchozímu závěru (krypto: 24 h).",
  "Signals": "Signály",
  "Mean 4h z-score: VIX, dollar, 10Y yield up and S&P futures down push it up":
    "Průměrné 4h z-skóre: zvyšuje ho růst VIX, dolaru a 10letého výnosu a pokles futures na S&P",
  "Risk pressure": "Tlak na riziko",
  "4h change {chg}% · {z}σ vs the last month": "Změna za 4 h {chg} % · {z}σ proti poslednímu měsíci",
  "Polymarket: expected Fed move (+ = hike) and its change over 24h":
    "Polymarket: očekávaný krok Fedu (+ = zvýšení) a jeho změna za 24 h",
  "US recession odds": "Šance na recesi v USA",
  "Right column: σ = size of the 4-hour move vs the last month; odds = change in 24 hours. Red = risk-off, green = risk-on. Hourly snapshots are saved to signals.jsonl in the app's data folder.":
    "Pravý sloupec: σ = velikost 4hodinového pohybu proti poslednímu měsíci; šance = změna za 24 hodin. Červená = risk-off, zelená = risk-on. Hodinové snímky se ukládají do signals.jsonl v datové složce aplikace.",
  "Central bank rates": "Sazby centrálních bank",
  "{name} · as of {date}": "{name} · k {date}",
  "Policy rates from the Bank for International Settlements.":
    "Měnověpolitické sazby od Banky pro mezinárodní platby (BIS).",
  "Predictions": "Predikce",
  "Venue": "Burza",
  "All": "Vše",
  "No open markets.": "Žádné otevřené trhy.",
  "Loading markets…": "Načítám trhy…",
  "${vol} volume": "Objem ${vol}",
  "ends": "končí",
  // Signal label() + legs
  "Markets closed": "Trhy zavřené",
  "Risk-off": "Risk-off",
  "Risk-on": "Risk-on",
  "Calm": "Klid",
  "S&P 500 futures": "Futures na S&P 500",
  "US dollar": "Americký dolar",
  "US 10Y yield": "Výnos 10letých dluhopisů USA",
  // Rates (econ.ts)
  "US federal debt": "Federální dluh USA",
  "Treasury · debt to the penny": "Ministerstvo financí USA · dluh na cent",
  "Fed funds (EFFR)": "Sazba Fedu (EFFR)",
  "ECB deposit rate": "Depozitní sazba ECB",
  // COT markets
  "10Y Treasury": "10leté Treasuries",
  "Euro": "Euro",
  "Gold": "Zlato",
  "WTI crude": "Ropa WTI",
  // Quote groups
  "Indices": "Indexy",
  "Commodities": "Komodity",
  "Crypto ETFs": "Krypto ETF",
  "FX · Rates": "Měny · sazby",
  "Sectors": "Sektory",
} as Record<string, string>;
