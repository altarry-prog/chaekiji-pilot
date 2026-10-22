// [B+안 음성 보정] 소리 비교 — 한글을 자음·모음으로 쪼개 「소리가 닮은 정도」를 잰다.
// 음성 인식이 「혼모노」를 「홈모노」로, 「편의점」을 「펴니점」으로 적어도 소리는 거의 같으므로 같은 책으로 찾는다.
// 시연 웹(index.html)에 그대로 옮겨 쓸 수 있게 브라우저·node 공용 순수 함수로만 쓴다. 외부 호출 없음.

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
// 받침은 소리 나는 대표음 7개로(ㅅ·ㅈ·ㅊ·ㅌ·ㅎ → ㄷ, ㅋ·ㄲ → ㄱ, ㅍ → ㅂ, 겹받침은 앞 소리)
const JONG_SOUND = {'ㄱ':'ㄱ','ㄲ':'ㄱ','ㄳ':'ㄱ','ㄴ':'ㄴ','ㄵ':'ㄴ','ㄶ':'ㄴ','ㄷ':'ㄷ','ㄹ':'ㄹ','ㄺ':'ㄱ','ㄻ':'ㅁ','ㄼ':'ㄹ','ㄽ':'ㄹ','ㄾ':'ㄹ','ㄿ':'ㅂ','ㅀ':'ㄹ',
  'ㅁ':'ㅁ','ㅂ':'ㅂ','ㅄ':'ㅂ','ㅅ':'ㄷ','ㅆ':'ㄷ','ㅇ':'ㅇ','ㅈ':'ㄷ','ㅊ':'ㄷ','ㅋ':'ㄱ','ㅌ':'ㄷ','ㅍ':'ㅂ','ㅎ':'ㄷ'};
// 모음은 요즘 말소리에서 거의 구분되지 않는 것끼리 묶는다(ㅐ=ㅔ, ㅒ=ㅖ, ㅙ=ㅚ=ㅞ, ㅢ→ㅣ)
const JUNG_SOUND = {'ㅐ':'ㅔ','ㅒ':'ㅖ','ㅙ':'ㅞ','ㅚ':'ㅞ','ㅢ':'ㅣ'};
// 비슷하게 들려 서로 잘못 받아 적기 쉬운 소리 — 바꿔치기 비용을 절반으로
const NEAR = [
  ['ㄱ','ㄲ'],['ㄱ','ㅋ'],['ㄲ','ㅋ'],['ㄷ','ㄸ'],['ㄷ','ㅌ'],['ㄸ','ㅌ'],['ㅂ','ㅃ'],['ㅂ','ㅍ'],['ㅃ','ㅍ'],['ㅈ','ㅉ'],['ㅈ','ㅊ'],['ㅉ','ㅊ'],['ㅅ','ㅆ'],
  ['ㄴ','ㅁ'],['ㄴ','ㅇ'],['ㅁ','ㅇ'],['ㄴ','ㄹ'],['ㅓ','ㅗ'],['ㅕ','ㅛ'],['ㅜ','ㅡ'],['ㅔ','ㅖ'],['ㅗ','ㅜ'],['ㅞ','ㅟ'],
].reduce((m, [a, b]) => (m[a + b] = m[b + a] = 1, m), {});

/** 글자를 소리 단위(초성·중성·종성)로 쪼갠다. 받침이 다음 글자 ㅇ으로 넘어가는 소리(연음)도 반영한다. */
export function toSound(text) {
  const s = String(text || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
  const syl = [];
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xAC00;
    if (c >= 0 && c < 11172) syl.push([CHO[Math.floor(c / 588)], JUNG[Math.floor((c % 588) / 28)], JONG[c % 28]]);
    else syl.push([ch, '', '']);
  }
  for (let i = 0; i + 1 < syl.length; i++) {          // 연음: 「편의」 → 「펴늬」, 「꽃이」 → 「꼬치」
    const [, , jo] = syl[i], nx = syl[i + 1];
    if (jo && nx[0] === 'ㅇ' && JONG_SOUND[jo] !== 'ㅇ' && jo !== 'ㅎ') { nx[0] = jo.length === 1 ? jo : JONG_SOUND[jo]; syl[i][2] = ''; }
    else if (jo === 'ㅎ' && nx[0] === 'ㅇ') syl[i][2] = '';
  }
  const out = [];
  for (const [a, b, c] of syl) {
    if (a) out.push(a === 'ㅇ' ? '' : a);              // 첫소리 ㅇ은 소리가 없다
    if (b) out.push(JUNG_SOUND[b] || b);
    if (c) out.push('_' + (JONG_SOUND[c] || c));        // 받침은 첫소리와 구분해 표시
  }
  return out.filter(Boolean);
}

function cost(a, b) {
  if (a === b) return 0;
  const x = a.replace('_', ''), y = b.replace('_', '');
  if (x === y) return 0.3;                              // 같은 소리가 받침↔첫소리로 자리만 옮김
  return NEAR[x + y] ? 0.5 : 1;
}

/** 두 소리열의 편집 거리(바꿔치기 비용은 소리 닮음에 따라) */
function dist(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost(a[i - 1], b[j - 1]));
    prev = cur;
  }
  return prev[b.length];
}

/** 말한 것(q)이 제목(t) 어딘가와 얼마나 닮았는지 — 제목 앞부분만 말한 경우(「달러구트」)를 위해 */
function partial(a, b) {
  let prev = new Array(b.length + 1).fill(0);           // 제목 어디서 시작해도 비용 0
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost(a[i - 1], b[j - 1]));
    prev = cur;
  }
  return Math.min(...prev);
}

/** 소리 닮음 0~1. 통째로 닮으면 그 값, 제목 일부만 말했으면 조금 깎은 값 */
export function soundSim(q, t) {
  const a = toSound(q), b = toSound(t);
  if (!a.length || !b.length) return 0;
  const whole = 1 - dist(a, b) / Math.max(a.length, b.length);
  const part = a.length >= 8 && a.length < b.length ? (1 - partial(a, b) / a.length) * 0.92 : 0;   // 약 3글자 이상 말했을 때만
  return Math.max(0, whole, part);
}

/** 글자 그대로 비교(지금 D안 방식 — 비교용 기준선): 최장 공통 부분문자열 */
export function charSim(q, t) {
  const a = String(q).replace(/[^0-9a-z가-힣]/gi, '').toLowerCase(), b = String(t).replace(/[^0-9a-z가-힣]/gi, '').toLowerCase();
  if (!a || !b) return 0;
  if (b.length >= 2 && a.includes(b)) return 1;
  let best = 0, prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) { const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) if (a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; }
    prev = cur; }
  return 2 * best / (a.length + b.length);
}

/** 사전에서 고르기 — {pick: 제목|null, ask: [후보…], score}
 *  pick: 자신 있게 고름 / ask: 「이 책이 맞나요?」로 물을 후보 / 둘 다 비면 사전에 없음 → 정보나루 검색으로 */
export const RULE = { auto: 0.8, gap: 0.08, ask: 0.55 };
export function choose(q, titles, sim = soundSim, rule = RULE) {
  const ranked = titles.map(t => ({ t, s: sim(q, t) })).sort((x, y) => y.s - x.s);
  const [a, b] = ranked;
  if (a && a.s >= rule.auto && (!b || a.s - b.s >= rule.gap)) return { pick: a.t, ask: [], score: a.s };
  if (a && a.s >= rule.ask) return { pick: null, ask: ranked.filter(x => x.s >= rule.ask).slice(0, 3).map(x => x.t), score: a.s };
  return { pick: null, ask: [], score: a ? a.s : 0 };
}
