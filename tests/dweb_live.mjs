// D안 실험판(web/) 실제 점검 — 게시된 화면을 열어 「대충 말한」 문장을 넣고, 실제 중계·정보나루로 판정 화면까지 가는지 본다.
// 키·개인정보 없음. 정보나루 호출: 새 책 1권당 약 17회(10분 캐시).
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
const URL = "https://altarry-prog.github.io/chaekiji-pilot/web/";
const ASKS = ["혼모노 있어요?", "한로로 자몽살구클럽 빌리고 싶어요", "김애란 안녕이라 그랬어 상동에서 받을게요",
  "나의 완벽한 장례식 빌릴 수 있나요", "괴테는 모든 것을 말했다 있나요"];
const b = await chromium.launch(); const out = { time: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") + " KST", url: URL, results: [] };
for (const a of ASKS) {
  const p = await b.newPage({ viewport: { width: 420, height: 900 } });
  const t0 = Date.now(); let row = { ask: a };
  try {
    await p.goto(URL, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(800);
    try { await p.click("#gateNo", { timeout: 2000 }); } catch (e) {}
    await p.fill("#tinput", a); await p.press("#tinput", "Enter");
    await p.waitForFunction(() => /(바로 이용|관내 상호대차|예약 권장|책바다|확인하지 못했어요|찾지 못했어요)/.test(document.body.innerText) && !/찾는 중/.test(document.body.innerText), null, { timeout: 45000 });
    await p.waitForTimeout(1500);
    const txt = (await p.innerText("body")).replace(/\s+/g, " ");
    row.title = (txt.match(/^.*?상호대차 (.{2,40}?) \S+ \(\d{4}\) ISBN/) || [])[1] || null;
    row.isbn = (txt.match(/ISBN (97[89]\d{10})/) || [])[1] || null;
    row.verdict = (txt.match(/(바로 이용|관내 상호대차|예약 권장|책바다)/) || [])[1] || (txt.match(/확인하지 못했어요|찾지 못했어요/) || [])[0];
    row.asof = (txt.match(/(\d{4}\. \d{1,2}\. \d{1,2}\.) 조회/) || [])[1] || null;
    row.seconds = (Date.now() - t0) / 1000;
    mkdirSync("check/dweb", { recursive: true }); await p.screenshot({ path: `check/dweb/${out.results.length + 1}.png` });
  } catch (e) { row.error = String(e).slice(0, 200); }
  out.results.push(row); console.log(JSON.stringify(row)); await p.close();
}
await b.close();
writeFileSync("check/dweb_live.json", JSON.stringify(out, null, 1) + "\n");
