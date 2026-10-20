// 최근 도서 조회 시험 — D안 화면과 똑같이 중계 /mcp의 consult_request를 부른다(화면 코드는 바꾸지 않음).
// 「대충 말한」 문장으로 부천시립도서관 16관 소장·대출(정보나루, 전일 기준)을 판정받을 수 있는지 본다. 키·개인정보 없음.
// 정보나루 호출: 새 책 1권당 약 17회(10분 캐시). 2026. 10. 20. 담당자 요청 「최근 도서 5권정도로 테스트」.
import { writeFileSync, mkdirSync } from "node:fs";
const RELAY = "https://chaekiji-relay.altarry2.workers.dev";
const ASKS = ["혼모노 있어요?", "한로로 자몽살구클럽 빌리고 싶어요", "김애란 안녕이라 그랬어 상동에서 받을게요",
  "나의 완벽한 장례식 빌릴 수 있나요", "괴테는 모든 것을 말했다 있나요"];
const out = { time: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") + " KST", relay: RELAY, pickup: "상동", results: [] };
let id = 0;
for (const u of ASKS) {
  const t0 = Date.now(); let row = { utterance: u };
  try {
    const r = await fetch(RELAY + "/mcp", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name: "consult_request", arguments: { utterance: u, pickup: "상동", lang: "ko" } } }) });
    const j = await r.json(); const res = j.result || {}; const text = res.content && res.content[0] && res.content[0].text;
    let o = {}; try { o = JSON.parse(text); } catch (e) { o = { raw: String(text).slice(0, 300) }; }
    const av = o.availability || {};
    row = { utterance: u, status: r.status, isError: !!res.isError, route: o.route, book: o.book ? { title: o.book.title, author: o.book.author, year: o.book.year, isbn13: o.book.isbn13 } : null,
      asof: av.asof, at_pickup: av.at_pickup, available_at: av.available_at, loaned_at: av.loaned_at,
      candidates: (o.candidate_books || []).slice(0, 3).map(c => c.title), same_title_others: (o.same_title_others || []).length, seconds: (Date.now() - t0) / 1000, raw: o.raw };
  } catch (e) { row.error = String(e); }
  out.results.push(row); console.log(JSON.stringify(row));
  await new Promise(r => setTimeout(r, 1500));
}
mkdirSync("check", { recursive: true });
writeFileSync("check/recent_books_2026-10-20.json", JSON.stringify(out, null, 1) + "\n");
