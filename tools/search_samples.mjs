// 서지 검색 표본 — 책이지 중계 /search(정보나루 srchBooks, 제목 부분일치·대출 많은 순 5건)가 문의마다 무엇을 돌려주는지 남긴다.
// 2026. 10. 19. AI 대조 시험에서 다른 책을 고른 문의(권차·외국어 판)를 고치기 위한 자료. 키·개인정보 없음. 정보나루 호출: 문의당 1회(10분 캐시).
import { writeFileSync, mkdirSync } from "node:fs";
const RELAY = "https://chaekiji-relay.altarry2.workers.dev";
const QUERIES = ["해리 포터와 마법사의 돌", "해리포터와 마법사의 돌", "해리 포터", "흔한남매", "흔한남매 1", "흔한남매 1권",
  "구름빵", "구름빵 백희나", "불편한 편의점", "불편한 편의점 2", "양귀자 모순", "모순", "문헌정보학개론", "총균쇠", "어린 왕자", "채식주의자"];
const out = { time: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") + " KST", relay: RELAY, samples: [] };
for (const q of QUERIES) {
  try {
    const r = await fetch(`${RELAY}/search?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    out.samples.push({ q, status: r.status, docs: j.docs || [], error: j.error || null });
  } catch (e) { out.samples.push({ q, status: 0, docs: [], error: String(e) }); }
  await new Promise(r => setTimeout(r, 400));
}
mkdirSync("check", { recursive: true });
writeFileSync("check/search_samples.json", JSON.stringify(out, null, 1) + "\n");
console.log(out.samples.map(s => `${s.q} → ${s.docs.length}건 ${s.error || ""}`).join("\n"));
