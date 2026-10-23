import { testCell } from "aio/testing";
import { view } from "../../src/cell/view.ts";

testCell(view, "select bumps seq, search, palette", (t) => {
  t.send.select({ kind: "country", id: 3 });
  t.send.search("iran");
  t.send.setPalette(true);
  t.send.select({ kind: "country", id: 3 });
  t.expect.state((s) => s.pick?.kind === "country" && s.query === "iran" && s.palette && s.seq === 2);
  t.send.select(null);
  t.expect.state((s) => s.pick === null);
});
