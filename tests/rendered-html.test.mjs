import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("楽譜がっちゃんこの画面を日本語で表示する", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /<title>楽譜がっちゃんこ<\/title>/);
  assert.match(html, /accept="\.png,\.jpg,\.jpeg,\.webp,\.pdf"/);
  assert.match(html, /ファイルを選択/);
  assert.match(html, /結合結果を作成/);
  assert.match(html, /すべてリセット/);
});

test("スマホ向けのPDF互換処理を同梱する", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
  assert.match(page, /pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs/);
  assert.match(page, /application\/pdf/);
  assert.match(page, /%PDF-/);
  assert.match(page, /PasswordException/);
  assert.doesNotMatch(page, /cdnjs|unpkg|jsdelivr/i);
});

test("並び順を1列で表示し、矢印は隣の1件だけを動かす", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reorder.css", import.meta.url), "utf8"),
  ]);

  assert.match(css, /\.thumbs\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column/);
  assert.match(page, /function moveStep\(target:string,direction:-1\|1\)/);
  assert.match(page, /↑ 上へ/);
  assert.match(page, /↓ 下へ/);
  assert.match(page, /上から順に、結合時は左から右へ配置します/);
});
