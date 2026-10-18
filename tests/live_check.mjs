// 실제 점검 — 게시된 시험 이용 화면을 실제 책이지 중계로 열어 본다. 깃허브 액션(.github/workflows/check.yml)이 돌린다.
// 정보나루 호출: 시연 도서 2권은 중계가 새벽 자료로 답해 0회, 다른 판본 찾기가 권당 1회 안팎(10분 캐시).
// 결과는 check/last_check.json에 남긴다. 판정 갈래는 날마다 바뀔 수 있어 「어느 갈래인가」가 아니라 「제대로 답하고 이어지는가」를 본다.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import crypto from "node:crypto";

const PAGE = process.env.PILOT_URL || "https://altarry-prog.github.io/chaekiji-pilot/";
const RELAY_HOST = "chaekiji-relay.altarry2.workers.dev";
const OFFICIAL = "https://alpasq.bcl.go.kr/search/keyword/";
const md5 = b => crypto.createHash("md5").update(b).digest("hex");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 16) + " KST";
const out = { time: kst(), page: PAGE, repo_md5: md5(readFileSync("index.html")), checks: [] };
const check = (name, pass, detail = "") => { out.checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 300) }); console.log((pass ? "✓ " : "✗ ") + name + (detail ? " — " + detail : "")); };

// 1. 게시된 화면이 저장소와 같은지(깃허브 페이지스 게시를 최대 10분 기다림)
let deployed = null;
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(PAGE + "?t=" + Date.now(), { cache: "no-store" });
    if (r.ok) { deployed = md5(Buffer.from(await r.arrayBuffer())); if (deployed === out.repo_md5) break; }
  } catch (e) { /* 다시 시도 */ }
  await sleep(15000);
}
out.deployed_md5 = deployed;
check("게시된 화면 = 저장소 index.html", deployed === out.repo_md5, deployed || "응답 없음");

// 2. 실제 중계로 두 권 찾기(인터넷 창 그대로 — 출처·CSP·CORS까지 실제와 같음)
const b = await chromium.launch();
for (const [title, pickup, isbn] of [["나미야 잡화점의 기적", "상동", "9788972756194"], ["불편한 편의점", "상동", "9791161571188"]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  const errs = [], hosts = new Set();
  pg.on("pageerror", e => errs.push(String(e)));
  pg.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  pg.on("request", r => hosts.add(new URL(r.url()).host));
  const t0 = Date.now();
  try {
    await pg.goto(PAGE + "?t=" + Date.now(), { waitUntil: "load" });
    await pg.selectOption("#pickup", pickup);
    await pg.fill("#q", title);
    await pg.click("#go");
    await pg.waitForSelector("#verdict", { timeout: 30000 });
    const ms = Date.now() - t0;
    await pg.waitForTimeout(1500);
    const v = (await pg.textContent("#verdict")).trim();
    const failed = /연결하지 못했어요|찾지 못했어요|너무 많이 찾았어요|답이 늦어/.test(v);
    check(`「${title}」 — 판정이 옴(${ms}ms)`, !failed, v);
    const href = await pg.$eval("#out a[data-cta]", a => a.getAttribute("href")).catch(() => null);
    const sts = await pg.$$eval("#out .sp", els => els.map(e => e.dataset.st));
    if (/서가에 있어요|받을 수 있어요|모두 대출 중/.test(v)) {
      check(`「${title}」 — 누리집 링크가 그 책 ISBN 화면`, href === OFFICIAL + isbn, href);
      check(`「${title}」 — 선반 16칸이 모두 상태를 가짐`, sts.length === 16 && sts.every(s => ["ok", "busy", "none"].includes(s)), sts.join(","));
      out[isbn] = { verdict: v, ok: sts.filter(s => s === "ok").length, busy: sts.filter(s => s === "busy").length, none: sts.filter(s => s === "none").length,
                    basis: ((await pg.textContent("#out .basis").catch(() => "")) || "").trim() };
    }
    check(`「${title}」 — 화면 오류·CSP 위반 0`, errs.length === 0, errs.join(" | "));
    check(`「${title}」 — 부르는 곳은 게시 화면과 책이지 중계뿐`, [...hosts].every(h => h === "altarry-prog.github.io" || h === RELAY_HOST), [...hosts].join(","));
  } catch (e) {
    check(`「${title}」 — 화면 열기·찾기`, false, String(e));
  }
  await ctx.close();
}
await b.close();

out.passed = out.checks.filter(c => c.pass).length;
out.total = out.checks.length;
mkdirSync("check", { recursive: true });
writeFileSync("check/last_check.json", JSON.stringify(out, null, 1) + "\n");
console.log(`\n실제 점검 ${out.passed}/${out.total} 통과`);
process.exit(out.passed === out.total ? 0 : 1);
