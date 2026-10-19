// 책이지 시험 이용 화면 점검(모의 중계) — 판정 갈래마다 화면 문구·링크·선반·오류 처리·휴대폰 화면·접근성을 본다.
// 실행: npm install && node tests/check_pilot.mjs     (네트워크·키 불필요. 중계 응답은 tests/fixtures.json — 책이지 엔진의 실제 출력 형태)
// fixtures.json은 chaekiji 저장소의 relay/worker.js(/mcp·/search)에 모의 정보나루를 붙여 뽑은 것이다.
import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FX = JSON.parse(readFileSync(path.join(ROOT, "tests", "fixtures.json"), "utf-8"));
const RELAY = "https://chaekiji-relay.altarry2.workers.dev";
const require = createRequire(import.meta.url);
let AXE = null; try { AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf-8"); } catch (e) { /* axe-core가 없으면 접근성 점검은 건너뜀 */ }

// 저장소 맨 위를 그대로 내보내는 작은 서버
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) fail++; console.log((c ? "  ✓ " : "  ✗ ") + m); };
const findCase = (u, p) => Object.values(FX.consult).find(c => c.args.utterance === u && c.args.pickup === p);

const b = await chromium.launch();
async function page({ width = 390, height = 844, mode = {} } = {}) {
  const ctx = await b.newContext({ viewport: { width, height } });
  const pg = await ctx.newPage();
  const errs = [], hosts = new Set(), posts = [];
  pg.on("pageerror", e => errs.push(String(e)));
  pg.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  pg.on("request", r => hosts.add(new URL(r.url()).host));
  await pg.route(RELAY + "/**", async route => {
    const req = route.request(), url = new URL(req.url());
    if (mode.abort) return route.abort("failed");
    if (url.pathname === "/mcp" && req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}"); posts.push(body);
      const a = (body.params && body.params.arguments) || {};
      let result;
      if (mode.limit) result = { content: [{ type: "text", text: "호출 한도 초과(10분에 60회) — 잠시 뒤 다시 시도해 주세요" }], isError: true };
      else if (mode.override) result = { content: [{ type: "text", text: JSON.stringify(mode.override) }], isError: false };
      else {
        const c = findCase(a.utterance, a.pickup);
        result = c ? { content: [{ type: "text", text: JSON.stringify(c.out) }], isError: !!c.isError }
                   : { content: [{ type: "text", text: JSON.stringify(FX.consult.unknown.out) }], isError: false };
      }
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
                             body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) });
    }
    if (url.pathname === "/search") {
      const s = FX.search[url.searchParams.get("q")];
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
                             body: JSON.stringify(s ? s.body : { docs: [] }) });
    }
    return route.fulfill({ status: 404, body: "nf" });
  });
  await pg.goto(BASE);
  return { ctx, pg, errs, hosts, posts };
}
async function ask(pg, utterance, pickup) {
  if (pickup) await pg.selectOption("#pickup", pickup);
  await pg.fill("#q", utterance);
  await pg.click("#go");
  await pg.waitForSelector("#verdict", { timeout: 10000 });
  await pg.waitForTimeout(900);                                    // 선반에 불이 다 들어올 때까지(16칸 × 28ms + 0.35초)
}
const text = (pg, sel) => pg.$eval(sel, e => e.textContent.trim()).catch(() => null);
const has = async (pg, sel) => !!(await pg.$(sel));
async function shelfState(pg) {
  return pg.$$eval("#out .sp", els => els.map(e => ({ lib: e.dataset.lib, st: e.dataset.st, cls: e.className })));
}
async function orphans(pg) {                                       // 한두 글자만 다음 줄로 넘어간 글 덩이
  return pg.evaluate(() => {
    const sel = "#out .verdict, #out .sub, #out .book .t, #out .mine, #out .basis, #out .steps li, #out .rules li, #out .memo, #out .newwin, #out .lists dd, .band p, .lede, .foot p, details.ed p";
    const bad = [];
    for (const el of document.querySelectorAll(sel)) {
      const tops = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const r = document.createRange();
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        for (let i = 0; i < t.length; i++) {
          if (/\s/.test(t.data[i])) continue;
          r.setStart(t, i); r.setEnd(t, i + 1);
          const rc = r.getClientRects()[0]; if (rc) tops.push(Math.round(rc.top));
        }
      }
      const lines = [...new Set(tops)].sort((a, b) => a - b);
      if (lines.length < 2) continue;
      const last = tops.filter(y => y === lines[lines.length - 1]).length;
      if (last <= 2 && /[가-힣]/.test(el.textContent)) bad.push(el.textContent.trim().slice(-24));
    }
    return bad;
  });
}
async function overflow(pg) {
  return pg.evaluate(() => ({
    page: document.documentElement.scrollWidth > window.innerWidth + 1,
    spines: [...document.querySelectorAll("#out .sp")].filter(e => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).map(e => e.dataset.lib),
  }));
}
async function axe(pg) {
  if (!AXE) return null;
  await pg.evaluate(AXE);
  const r = await pg.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map(v => v.id + ":" + v.nodes.length));
  return r;
}

console.log("── 처음 화면");
{ const { ctx, pg, errs, hosts } = await page();
  ok((await text(pg, ".band p")).includes("공식 서비스가 아니고") && (await text(pg, ".band p")).includes("본인이 직접"), "맨 위 안내: 공식 서비스 아님 · 신청은 본인이 직접");
  ok(await pg.$eval("#pickup", e => e.value) === "상동" && await pg.$$eval("#pickup option", o => o.length) === 24, "받을 도서관 기본 상동 · 시립 16 + 작은도서관 8");
  ok(await pg.$$eval("input, textarea", els => els.length) === 1, "입력 칸은 책 이름 하나뿐(이름·회원번호 칸 없음)");
  ok(!(await text(pg, "body")).match(/신청이 완료|접수되었|신청되었습니다/), "모의 신청·접수 완료 같은 문구 없음");
  await pg.click("#go");
  ok((await text(pg, "#note")) === "책 이름을 입력해 주세요." && !(await has(pg, "#verdict")), "빈 칸으로 찾기 → 안내만 하고 묻지 않음");
  const a = await axe(pg); ok(a === null || a.length === 0, "접근성(axe) 처음 화면 위반 0" + (a && a.length ? " " + a.join(",") : a === null ? " (axe 없음 — 건너뜀)" : ""));
  ok(errs.length === 0, "화면 오류 0 " + errs.join(";"));
  ok([...hosts].every(h => h.startsWith("127.0.0.1")), "처음 화면은 외부로 아무것도 부르지 않음(글꼴·분석 없음)");
  await ctx.close(); }

console.log("── 관내 상호대차(시립도서관에서 받기)");
{ const { ctx, pg, errs, hosts, posts } = await page();
  await ask(pg, "나미야 잡화점의 기적 빌리고 싶어요", "상동");
  const o = FX.consult.ill.out;
  ok((await text(pg, "#verdict")) === "상호대차로 상동도서관에서 받을 수 있어요", "판정 한 줄 — 「상호대차로 상동도서관에서 받을 수 있어요」");
  ok((await text(pg, "#out .sub")).startsWith("꿈여울도서관 등 7곳에") && (await text(pg, "#out .sub")).includes("받을 도서관의 책은 지금 대출 중"), "소장관·곳 수 · 받을 도서관 대출 중 안내");
  ok(await pg.$eval("#out a[data-cta]", a => a.getAttribute("href")) === o.official_link && o.official_link.endsWith("/9788972756194"), "누리집 링크 = 엔진 링크(ISBN 화면)");
  ok(await pg.$eval("#out a[data-cta]", a => a.target === "_blank" && a.rel.includes("noopener") && a.textContent.trim() === "누리집에서 이 책 신청하기"), "단추 「누리집에서 이 책 신청하기」 · 새 창 · noopener");
  ok(await pg.$$eval("#out .steps li", l => l.map(x => x.textContent).join("|")) === "누리집에 로그인하세요.|책 화면에서 「상호대차 신청」을 누르세요.|받을 곳으로 상동도서관을 고르세요.", "누리집에서 할 일 3단계");
  const rules = await pg.$$eval("#out .rules li", l => l.map(x => x.textContent).join("|"));
  ok(rules.includes("무료") && rules.includes("다음 날") && rules.includes("도착한 날을 포함해 3일") && rules.includes("7일 동안") && rules.includes("누리집에서 신청할 때 확인"), "알아 둘 것 — 무료 · 다음 날 · 도착일 포함 3일 · 7일 제한 · 한도는 누리집에서");
  const sh = await shelfState(pg);
  const want = l => o.availability.available_at.includes(l) ? "ok" : o.availability.loaned_at.includes(l) ? "busy" : "none";
  ok(sh.length === 16 && sh.every(s => s.st === want(s.lib) && s.cls.includes(s.st)), "선반 16칸 — 엔진의 대출 가능·대출 중·없음과 같음(불이 다 들어옴)");
  ok(sh.filter(s => s.cls.includes(" me")).map(s => s.lib).join() === "상동", "받을 도서관(상동)에 테두리 표시");
  ok((await text(pg, "#out .lists")).includes("대출 가능 7곳") && (await text(pg, "#out .lists")).includes("대출 중 6곳") && (await text(pg, "#out .lists")).includes("없음 3곳"), "글로도 곳 수와 이름(색만으로 알리지 않음)");
  ok((await text(pg, "#out .basis")).startsWith("정보나루 ") && (await text(pg, "#out .basis")).includes("전날 상태"), "기준일 · 전날 상태 고지");
  ok((await text(pg, "#out .memo")).includes("책 제목은 적지 않아요"), "기록지 안내(책 제목 미기재)");
  const p0 = posts[0];
  ok(p0 && p0.method === "tools/call" && p0.params.name === "consult_request" &&
     JSON.stringify(Object.keys(p0.params.arguments).sort()) === JSON.stringify(["lang", "pickup", "utterance"]) &&
     p0.params.arguments.lang === "ko" && p0.params.arguments.pickup === "상동", "보내는 것은 말·받을 도서관·언어 셋뿐(회원 정보 없음)");
  ok([...hosts].every(h => h.startsWith("127.0.0.1") || h === "chaekiji-relay.altarry2.workers.dev"), "부르는 곳은 책이지 중계뿐");
  const orp = await orphans(pg); ok(orp.length === 0, "한두 글자만 넘어간 줄 없음(390px) " + orp.join(" / "));
  const ov = await overflow(pg); ok(!ov.page && ov.spines.length === 0, "가로 넘침 없음 · 책등 이름 잘림 없음 " + JSON.stringify(ov));
  const a = await axe(pg); ok(a === null || a.length === 0, "접근성(axe) 결과 화면 위반 0" + (a && a.length ? " " + a.join(",") : ""));
  ok(await pg.evaluate(() => document.activeElement && document.activeElement.id === "verdict"), "결과가 오면 판정 한 줄로 초점 이동");
  ok(errs.length === 0, "화면 오류 0 " + errs.join(";"));
  await pg.screenshot({ path: path.join(ROOT, "tests", "shot_ill.png"), fullPage: true });
  await ctx.close(); }

console.log("── 작은도서관에서 받기");
{ const { ctx, pg, errs } = await page();
  await ask(pg, "나미야 잡화점의 기적", "상동역 칙칙폭폭");
  ok((await text(pg, "#verdict")) === "상호대차로 상동역 칙칙폭폭 작은도서관에서 받을 수 있어요", "판정 — 작은도서관 이름");
  const rules = await pg.$$eval("#out .rules li", l => l.map(x => x.textContent).join("|"));
  ok(rules.includes("그 도서관에 확인") && !rules.includes("도착한 날을 포함해 3일"), "도착일·보관 기한은 그 도서관에 확인(짐작하지 않음)");
  ok((await text(pg, "#out .mine")).includes("아래 16곳에 들어 있지 않아요") && !(await shelfState(pg)).some(s => s.cls.includes(" me")), "작은도서관은 선반 밖임을 알림 · 테두리 없음");
  ok(await pg.$$eval("#out .steps li", l => l[2].textContent) === "받을 곳으로 상동역 칙칙폭폭 작은도서관을 고르세요.", "3단계에 작은도서관 이름");
  ok(errs.length === 0, "화면 오류 0");
  await ctx.close(); }

console.log("── 바로 이용 · 다른 판본");
{ const { ctx, pg, errs } = await page();
  await ask(pg, "채식주의자", "상동");
  ok((await text(pg, "#verdict")) === "상동도서관 서가에 있어요", "판정 — 「상동도서관 서가에 있어요」");
  ok(await pg.$eval("#out a[data-cta]", a => a.textContent.trim()) === "누리집에서 이 책 보기", "단추는 「보기」(받을 도서관에 있는 책은 상호대차 신청 불가)");
  await pg.waitForSelector("details.ed", { timeout: 5000 }).catch(() => {});
  ok((await text(pg, "details.ed summary")) === "같은 제목의 다른 판본 1개", "다른 판본 1개(지금 판본은 빼고)");
  await pg.click("details.ed summary");
  ok(await pg.$eval("details.ed li a", a => a.getAttribute("href")) === "https://alpasq.bcl.go.kr/search/keyword/9788936434595", "다른 판본은 판정하지 않고 누리집 그 판본 화면으로");
  ok((await text(pg, "details.ed p")).includes("위 판정은 이 화면에 나온 판본 기준"), "판정 기준 판본을 밝힘");
  ok(errs.length === 0, "화면 오류 0");
  await ctx.close(); }

console.log("── 예약 권장 · 책바다 · 확인 불가 · 못 찾음");
{ const { ctx, pg, errs } = await page();
  await ask(pg, "파친코", "상동");
  ok((await text(pg, "#verdict")) === "지금은 모두 대출 중이에요" && (await text(pg, "#out a[data-cta]")) === "누리집에서 이 책 예약하기", "예약 권장 — 예약 단추");
  ok((await text(pg, "#out .sub")).includes("상호대차로 바꿔 신청할 수 있어요"), "반납되면 상호대차 전환 「신청」(자동 전환이라 하지 않음)");
  await ask(pg, "백년의 고독", "상동");
  ok((await text(pg, "#verdict")) === "부천시립도서관에는 이 책이 없어요" && (await text(pg, "#out .sub")).includes("경기도의 다른 도서관 12곳") && !(await has(pg, "#out a[data-cta]")), "책바다 — 경기 12곳(정보나루), 신청 단추 없음");
  await ask(pg, "희랍어 시간", "상동");
  ok((await text(pg, "#verdict")) === "지금은 소장 상태를 확인하지 못했어요" && !(await has(pg, "#out .sp")) &&
     await pg.$eval("#out a[data-cta]", a => a.getAttribute("href")) === FX.consult.check_hold.out.official_link, "소장 확인 불가 — 선반 없음, 제목 검색 링크");
  ok((await text(pg, "#out .sub")).includes("짐작하지 않을게요"), "있다·없다를 짐작하지 않음");
  await ask(pg, "흐르는 강물처럼", "상동");
  ok((await text(pg, "#verdict")) === "지금은 책을 찾지 못했어요" && (await text(pg, "#out .sub")).includes("책이 없다는 뜻은 아니에요") && await has(pg, "#out [data-retry]"), "연결 끊김 — 「없다」가 아님 · 다시 찾기");
  await ask(pg, "아무도 모르는 제목", "상동");
  ok((await text(pg, "#verdict")) === "책을 찾지 못했어요" &&
     await pg.$eval("#out a[data-cta]", a => a.getAttribute("href")) === "https://alpasq.bcl.go.kr/search/keyword/" + encodeURIComponent("아무도 모르는 제목"), "못 찾음 — 제목만 넣어 보라는 안내 · 누리집 검색 링크");
  const orp = await orphans(pg); ok(orp.length === 0, "한두 글자 줄 없음 " + orp.join(" / "));
  ok(errs.length === 0, "화면 오류 0 " + errs.join(";"));
  await ctx.close(); }

console.log("── v0.1.1 · 같은 제목 다른 책 · 판본 보정 · 못 고른 경우의 후보(엔진 10. 19. 출력)");
{ const { ctx, pg, errs } = await page();
  const oa = FX.consult.sea_alt.out, e = oa.other_editions[0];
  await ask(pg, "문헌정보학개론 김수경", "상동");
  ok((await text(pg, "#verdict")) === "부천시립도서관에는 이 판이 없어요", "판본 보정 — 고른 판이 관내에 없으면 「이 판이 없어요」(「이 책」이라 하지 않음)");
  ok((await text(pg, "#out .alt h3")) === "같은 책의 다른 판은 부천시립도서관에 있어요" && (await text(pg, "#out .alt p")) === "태일사 2024년 판 — 상동도서관 서가에 있어요.",
     "다른 판의 출판사·연도와 소장(받을 도서관 서가) — 엔진 other_editions 그대로");
  ok(await pg.$eval("#out .alt a[data-cta]", a => a.getAttribute("href")) === e.official_link && e.official_link.endsWith("/" + e.isbn13) &&
     (await text(pg, "#out .alt .fine")).includes("번역이나 개정 내용이 다를 수 있어요"), "그 판의 누리집 화면(ISBN)으로 · 판이 다르면 내용이 다를 수 있다고 알림");
  ok((await text(pg, "#out .others")).includes("양재한,차성종 공저, 2014") && (await text(pg, "#out .others")).includes("저자 이름을 함께 넣어"), "같은 제목·다른 저자의 책 3권 안내(엔진 same_title_others)");
  let orp = await orphans(pg); ok(orp.length === 0, "한두 글자 줄 없음(판본 보정 화면) " + orp.join(" / "));
  let ov = await overflow(pg); ok(!ov.page, "가로 넘침 없음(판본 보정 화면)");
  let a = await axe(pg); ok(a === null || a.length === 0, "접근성(axe) 판본 보정 화면 위반 0" + (a && a.length ? " " + a.join(",") : ""));
  await ask(pg, "문헌정보학개론", "상동");
  ok((await text(pg, "#verdict")) === "부천시립도서관에는 이 책이 없어요" && !(await has(pg, "#out .alt")) && (await has(pg, "#out .others")) && !(await has(pg, "#out a[data-cta]")),
     "다른 판이 없으면 그대로 「이 책이 없어요」 · 같은 제목 다른 책 안내만 · 신청 단추 없음");
  await ask(pg, "흔한남매 9권", "송내");
  const cands = FX.consult.unknown_cands.out.candidate_books;
  ok((await text(pg, "#verdict")) === "책을 찾지 못했어요" && (await text(pg, "#out .sub")).includes("어느 책인지 고르지 못했어요") && (await text(pg, "#out .cands h3")) === "혹시 이 책인가요?",
     "못 고른 경우 — 되묻기 안내와 후보 목록 제목");
  ok(JSON.stringify(await pg.$$eval("#out .cands li a", l => l.map(x => x.getAttribute("href")))) === JSON.stringify(cands.map(c => "https://alpasq.bcl.go.kr/search/keyword/" + c.isbn13)) &&
     await pg.$eval("#out a[data-cta]", x => x.getAttribute("href")) === "https://alpasq.bcl.go.kr/search/keyword/" + encodeURIComponent("흔한남매 9권"),
     "후보 3권은 판정하지 않고 각 누리집 ISBN 화면으로 · 맨 아래는 이 검색어로 찾기");
  ok(JSON.stringify(await pg.$$eval("#out .cands li span", l => l.map(x => x.textContent.split(",")[0]))) === JSON.stringify(["흔한남매 7권", "흔한남매 3권", "흔한남매 1권"]),
     "후보에 권차를 함께 보임(같은 제목 여러 권을 가리게 — 엔진 candidate_books.vol)");
  orp = await orphans(pg); ok(orp.length === 0, "한두 글자 줄 없음(후보 화면) " + orp.join(" / "));
  a = await axe(pg); ok(a === null || a.length === 0, "접근성(axe) 후보 화면 위반 0" + (a && a.length ? " " + a.join(",") : ""));
  ok(errs.length === 0, "화면 오류 0 " + errs.join(";"));
  await ctx.close(); }

console.log("── 오류 처리");
{ const { ctx, pg, errs } = await page({ mode: { limit: true } });
  await ask(pg, "나미야 잡화점의 기적", "상동");
  ok((await text(pg, "#verdict")) === "잠깐 사이에 너무 많이 찾았어요" && await has(pg, "#out [data-retry]"), "호출 한도 초과 → 10분 뒤 안내 · 다시 찾기");
  ok(errs.length === 0, "화면 오류 0");
  await ctx.close(); }
{ const mode = { abort: true };
  const { ctx, pg } = await page({ mode });
  await ask(pg, "나미야 잡화점의 기적 빌리고 싶어요", "상동");
  ok((await text(pg, "#verdict")) === "책이지 서버에 연결하지 못했어요" &&
     await pg.$eval("#out a[data-cta]", a => a.getAttribute("href")).then(h => h.startsWith("https://alpasq.bcl.go.kr/search/keyword/")), "중계에 닿지 못함 → 누리집 검색으로 이어 줌");
  mode.abort = false;
  await pg.click("#out [data-retry]"); await pg.waitForTimeout(1200);
  ok((await text(pg, "#verdict")) === "상호대차로 상동도서관에서 받을 수 있어요", "「다시 찾기」 → 다시 물어 결과가 나옴");
  await ctx.close(); }
{ const evil = JSON.parse(JSON.stringify(FX.consult.ill.out));
  evil.book.title = '<img src=x onerror="window.__x=1">나미야'; evil.official_link = "javascript:alert(1)";
  const { ctx, pg, errs } = await page({ mode: { override: evil } });
  await ask(pg, "나미야", "상동");
  ok(!(await has(pg, "#out img")) && (await text(pg, "#out .book .t")).startsWith("<img") && !(await pg.evaluate(() => window.__x)), "응답 글자는 글자로만 보임(HTML로 해석 안 함)");
  ok(!(await has(pg, "#out a[data-cta]")), "누리집이 아닌 링크는 쓰지 않음");
  ok(errs.length === 0, "화면 오류 0");
  await ctx.close(); }

console.log("── 받을 도서관 기억 · 말로 찾기");
{ const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.goto(BASE); await pg.selectOption("#pickup", "원미"); await pg.reload();
  ok(await pg.$eval("#pickup", e => e.value) === "원미", "받을 도서관은 이 기기에 기억(다시 열어도 원미)");
  ok(JSON.stringify(await pg.evaluate(() => Object.keys(localStorage))) === JSON.stringify(["chaekiji.pilot.pickup"]), "기기에 남는 것은 받을 도서관 하나뿐(찾은 책은 남기지 않음)");
  await ctx.close(); }
{ const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    class FakeSR { start() { setTimeout(() => { this.onresult && this.onresult({ results: [[{ transcript: "나미야 잡화점의 기적" }]] }); this.onend && this.onend(); }, 50); } stop() {} }
    window.SpeechRecognition = FakeSR;
  });
  const pg = await ctx.newPage(); const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.route(RELAY + "/**", route => {
    const u = new URL(route.request().url());
    if (u.pathname === "/mcp") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(FX.consult.ill.out) }], isError: false } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"docs":[]}' });
  });
  await pg.goto(BASE);
  ok(await pg.$eval("#mic", e => !e.hidden), "음성 인식을 지원하면 말로 찾기 단추가 보임");
  await pg.click("#mic"); await pg.waitForSelector("#verdict", { timeout: 5000 });
  ok(await pg.$eval("#q", e => e.value) === "나미야 잡화점의 기적" && (await text(pg, "#verdict")).startsWith("상호대차로"), "말한 제목이 칸에 들어가고 바로 찾음");
  ok(errs.length === 0, "화면 오류 0");
  await ctx.close(); }
{ const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  const pg = await ctx.newPage(); await pg.goto(BASE);
  ok(await pg.$eval("#mic", e => e.hidden), "지원하지 않는 브라우저에서는 말로 찾기 단추를 숨김");
  await ctx.close(); }

console.log("── 실제 응답으로 그리기(2026. 10. 18. 원격 상담 비서 응답 4건)");
{ const REAL = JSON.parse(readFileSync(path.join(ROOT, "tests", "fixtures_real.json"), "utf-8")).cases;
  for (const c of REAL) {
    const { ctx, pg, errs } = await page({ mode: { override: c.out } });
    await ask(pg, c.args.utterance, c.args.pickup);
    const v = await text(pg, "#verdict"), t = await text(pg, "#out .book .t"), m = await pg.$$eval("#out .book .m", e => e.map(x => x.textContent).join("|"));
    const sh = await shelfState(pg), av = c.out.availability;
    const want = l => av.available_at.includes(l) ? "ok" : av.loaned_at.includes(l) ? "busy" : "none";
    const okShelf = sh.length === 16 && sh.every(s => s.st === want(s.lib));
    const okLink = await pg.$eval("#out a[data-cta]", a => a.getAttribute("href")) === c.out.official_link;
    const okTitle = !t.includes(":") && !m.includes("지은이:");
    const orp = await orphans(pg);
    ok(okShelf && okLink && okTitle && orp.length === 0 && errs.length === 0,
       `「${c.args.utterance}」(${c.args.pickup}) — ${v} · 서명 「${t}」 · 선반·링크 일치 · 한두 글자 줄 없음` + (orp.length ? " " + orp.join(" / ") : ""));
    await ctx.close();
  } }

console.log("── 화면 폭(320 · 390 · 1280)");
for (const [w, hgt] of [[320, 640], [390, 844], [1280, 900]]) {
  const { ctx, pg, errs } = await page({ width: w, height: hgt });
  await ask(pg, "나미야 잡화점의 기적 빌리고 싶어요", "상동");
  const ov = await overflow(pg), orp = await orphans(pg);
  ok(!ov.page && ov.spines.length === 0 && orp.length === 0 && errs.length === 0, `${w}px — 가로 넘침·책등 잘림·한두 글자 줄 없음 · 오류 0` + (orp.length ? " " + orp.join(" / ") : "") + (ov.spines.length ? " " + ov.spines.join(",") : ""));
  if (w === 320) await pg.screenshot({ path: path.join(ROOT, "tests", "shot_320.png"), fullPage: true });
  await ctx.close();
}

await b.close(); server.close();
console.log(`\n시험 이용 화면 점검 ${n - fail}/${n} 통과`);
process.exit(fail ? 1 : 0);
