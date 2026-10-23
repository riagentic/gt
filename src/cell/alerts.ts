import { cell, serverImport } from "aio";
import { type AirportStatus, type Siren, SQUAWKS, THREATS, type WeatherAlert } from "../lib/alerts.ts";
import type { Aircraft } from "../lib/normalize.ts";
import { idle, type Status, tracked } from "../lib/status.ts";
import type { Protest } from "../lib/world.ts";
import { watch } from "./watch.ts";

// Fast-moving alerts: severe weather, sirens, aircraft emergencies, airport disruption, protests.
export type State = {
  weather: WeatherAlert[];
  weatherUrl: string; // warning polygons (blob)
  sirens: Siren[];
  squawks: Aircraft[];
  airports: AirportStatus[];
  protests: Protest[];
  weatherStatus: Status;
  sirenStatus: Status;
  aviationStatus: Status;
  protestStatus: Status;
};
const io = () => serverImport<typeof import("../server/world.server.ts")>("../server/world.server.ts", import.meta.url);

export const alerts = cell("alerts", {
  state: {
    weather: [],
    weatherUrl: "",
    sirens: [],
    squawks: [],
    airports: [],
    protests: [],
    weatherStatus: idle(),
    sirenStatus: idle(),
    aviationStatus: idle(),
    protestStatus: idle(),
  } as State,
  persist: { exclude: ["weatherStatus.busy", "sirenStatus.busy", "aviationStatus.busy", "protestStatus.busy"] },
  concurrency: { refreshWeather: "first", refreshSirens: "first", refreshAviation: "first", refreshProtests: "first" },
  long: ["refreshWeather", "refreshProtests"],
  methods: {
    async refreshWeather(s) {
      const previous = s.weatherUrl;
      await tracked(s, "weatherStatus", async () => {
        const { alerts, url } = await (await io()).weather(previous);
        s.weather = alerts;
        s.weatherUrl = url;
      });
    },
    async refreshSirens(s) {
      await tracked(s, "sirenStatus", async () => {
        const sirens = await (await io()).sirens(Date.now());
        s.sirens = sirens;
        await watch.scanHazards(
          sirens.filter((x) => x.threat !== 8).map((x) => ({
            id: `siren-${x.id}`,
            head: `Sirens · ${THREATS[x.threat] ?? "Alert"}`,
            title: x.cities.map((c) => c.en).slice(0, 6).join(", ") +
              (x.cities.length > 6 ? ` +${x.cities.length - 6}` : ""),
          })),
        );
      });
    },
    async refreshAviation(s) {
      await tracked(s, "aviationStatus", async () => {
        const { squawks, airports } = await (await io()).aviation();
        s.squawks = squawks;
        s.airports = airports;
        // 7600 (radio failure) is routine enough to stay silent.
        await watch.scanHazards(
          squawks.filter((a) => a.sq === "7500" || a.sq === "7700").map((a) => ({
            id: `sq-${a.hex}-${a.sq}`,
            head: `Squawk ${a.sq} · ${SQUAWKS[a.sq]}`,
            title: [a.call || a.hex.toUpperCase(), a.type, a.reg].filter(Boolean).join(" · "),
          })),
        );
      });
    },
    async refreshProtests(s) {
      await tracked(s, "protestStatus", async () => {
        s.protests = await (await io()).protests();
      });
    },
  },
});
