import { cell, serverImport } from "aio";
import { idle, type Status, tracked } from "../lib/status.ts";
import type { Anomaly, Co2, Image, Profiles, Sensor, Service, Traffic } from "../lib/world.ts";

// Slow context: country profiles, chokepoint traffic, radiation, temperature anomaly, internet services.
export type State = {
  profiles: Profiles;
  traffic: Traffic[];
  radiation: Sensor[];
  climate: Anomaly[];
  co2: Co2 | null;
  services: Service[];
  /** Latest satellite scene per looked-up place (session cache; null = none found). */
  images: Record<string, Image | null>;
  profileStatus: Status;
  trafficStatus: Status;
  planetStatus: Status;
  serviceStatus: Status;
};
const DAY = 86_400_000;
const io = () => serverImport<typeof import("../server/world.server.ts")>("../server/world.server.ts", import.meta.url);
const stale = (st: Status, ms: number) => !st.ok || Date.now() - st.at > ms;

export const atlas = cell("atlas", {
  version: 2,
  onMigrate: (s) => ({ ...s, co2: (s as Partial<State>).co2 ?? null }),
  state: {
    profiles: {},
    traffic: [],
    radiation: [],
    climate: [],
    co2: null,
    services: [],
    images: {},
    profileStatus: idle(),
    trafficStatus: idle(),
    planetStatus: idle(),
    serviceStatus: idle(),
  } as State,
  persist: {
    exclude: ["images", "profileStatus.busy", "trafficStatus.busy", "planetStatus.busy", "serviceStatus.busy"],
  },
  concurrency: { refreshProfiles: "first", refreshTraffic: "first", refreshPlanet: "first", refreshServices: "first" },
  long: ["refreshProfiles", "refreshPlanet"],
  methods: {
    /** Yearly statistics: at most weekly unless forced. */
    async refreshProfiles(s, force: boolean) {
      if (!force && !stale(s.profileStatus, 7 * DAY)) return;
      await tracked(s, "profileStatus", async () => {
        s.profiles = await (await io()).profiles(Date.now());
      });
    },
    async refreshTraffic(s) {
      await tracked(s, "trafficStatus", async () => {
        s.traffic = await (await io()).traffic(Date.now());
      });
    },
    async refreshPlanet(s) {
      await tracked(s, "planetStatus", async () => {
        const src = await io(), now = Date.now();
        // Thunks: one source throwing synchronously must not strand the others' rejections.
        const run = <T>(f: () => Promise<T>) => Promise.resolve().then(f);
        const [rad, cli, co2] = await Promise.allSettled([
          run(() => src.radiation(now)),
          run(() => src.climate(now)),
          run(() => src.co2()),
        ]);
        if (rad.status === "fulfilled") s.radiation = rad.value;
        if (cli.status === "fulfilled") s.climate = cli.value;
        if (co2.status === "fulfilled" && co2.value) s.co2 = co2.value;
        const errs = [rad, cli, co2].flatMap((r) =>
          r.status === "rejected" ? [String(r.reason?.message ?? r.reason)] : []
        );
        if (errs.length === 3) throw new Error(errs.join("; "));
        return errs.join("; ");
      });
    },
    async image(s, key: string, lon: number, lat: number) {
      if (key in s.images) return;
      s.images[key] = await (await io()).imagery(lon, lat).catch(() => null);
    },
    async refreshServices(s) {
      await tracked(s, "serviceStatus", async () => {
        s.services = await (await io()).services();
      });
    },
  },
});
