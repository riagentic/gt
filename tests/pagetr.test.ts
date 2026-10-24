// In-page translation scripts, run in a DOM: collect readable blocks, swap in translations, restore the original.
import { assertEquals } from "@std/assert";
import { Window } from "happy-dom";
import { apply, COLLECT, RESTORE } from "../src/lib/pagetr.ts";

const page = () => {
  const w = new Window();
  w.document.body.innerHTML = `
    <nav><p>Menu</p></nav>
    <article><h1>Big storm</h1><p>Flights <a href="/x">cancelled</a>.</p><ul><li>One</li><li>123</li></ul>
    <div><p>Inner</p></div></article><footer><p>Footer</p></footer>`;
  const run = (code: string) => w.eval(code) as unknown;
  return { w, run };
};

Deno.test("pagetr: collects readable leaf blocks in order, skipping chrome and non-words", () => {
  const { run } = page();
  assertEquals([...(run(COLLECT) as string[])], ["Big storm", "Flights cancelled.", "One", "Inner"]);
});

Deno.test("pagetr: apply swaps text (as text, not HTML); restore and re-collect bring the original back", () => {
  const { w, run } = page();
  run(COLLECT);
  run(apply({ 1: "Lety <b>zrušeny</b>." }));
  const p = w.document.querySelector('[data-gn="1"]')!;
  assertEquals([p.textContent, p.querySelector("b")], ["Lety <b>zrušeny</b>.", null]);
  run(RESTORE);
  assertEquals(p.querySelector("a")?.textContent, "cancelled");
  run(apply({ 0: "Velká bouře" }));
  assertEquals((run(COLLECT) as string[])[0], "Big storm");
});
