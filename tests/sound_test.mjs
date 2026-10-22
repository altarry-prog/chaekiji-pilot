// [B+안 음성 보정] 정확도 모의 시험 — 정보나루 호출 0건.
// 사전(모의) 50권 × 잘못 들은 문장 3개 = 150문장 + 사전에 없는 책 30문장.
// 잘못 들은 문장은 ① 담당자가 실제로 겪은 것·손으로 쓴 것 ② 음성 인식이 흔히 틀리는 방식(띄어쓰기·모음·받침·된소리·연음·앞부분만)을 정해진 순서로 만든 것.
// 비교: 글자 그대로 비교(지금 D안) ↔ 소리 비교. 결과는 tests/sound_result.json, 문장 목록은 tests/sound_cases.json.
// 실행: node tests/sound_test.mjs
import fs from 'node:fs';
import { soundSim, charSim, choose, toSound } from '../tools/sound_match.mjs';

// 모의 사전 — 널리 알려진 책 제목. 실제 부천 인기·신착 목록이 아니다(반영 때 정보나루 인기대출·신착으로 바뀜).
const DICT = ['불편한 편의점','나미야 잡화점의 기적','소년이 온다','지구 끝의 온실','혼모노','세이노의 가르침','역행자','아버지의 해방일지','작별하지 않는다','채식주의자',
  '흰','파친코','달러구트 꿈 백화점','어서 오세요, 휴남동 서점입니다','메리골드 마음 세탁소','도둑맞은 집중력','사피엔스','총 균 쇠','데미안','82년생 김지영',
  '아몬드','구의 증명','해리 포터와 마법사의 돌','어린 왕자','미움받을 용기','원씽','돈의 속성','부의 추월차선','이처럼 사소한 것들','모순',
  '급류','마흔에 읽는 쇼펜하우어','시대예보','물고기는 존재하지 않는다','긴긴밤','이중 하나는 거짓말','천 개의 파랑','우리가 빛의 속도로 갈 수 없다면','저주토끼','칵테일, 러브, 좀비',
  '퓨처 셀프','홍학의 자리','아주 작은 습관의 힘','생각에 관한 생각','정의란 무엇인가','코스모스','이기적 유전자','페스트','노인과 바다','연금술사'];
const OUT = ['토지','태백산맥','난장이가 쏘아올린 작은 공','무진기행','엄마를 부탁해','칼의 노래','살인자의 기억법','7년의 밤','종의 기원','침묵의 봄',
  '군주론','동물농장','멋진 신세계','위대한 개츠비','호밀밭의 파수꾼','이방인','변신','죄와 벌','오만과 편견','제인 에어',
  '폭풍의 언덕','레 미제라블','돈키호테','햄릿','파우스트','백년의 고독','그리스인 조르바','달과 6펜스','꽃을 보듯 너를 본다','나의 라임오렌지나무'];

// ① 손으로 쓴 잘못 들은 문장(담당자 실제 사례 「홈모노」 포함)
const HAND = {
  '혼모노': ['홈모노 빌리고 싶어요'], '불편한 편의점': ['불편한 펴니점 있어요'], '나미야 잡화점의 기적': ['나미야 잡아점의 기적'],
  '소년이 온다': ['소녀니 온다 빌려 주세요'], '지구 끝의 온실': ['지구 끄테 온실'], '세이노의 가르침': ['세이노 가르침 있나요'],
  '달러구트 꿈 백화점': ['달라구트 꿈 백과점'], '어서 오세요, 휴남동 서점입니다': ['휴남동 서점'], '82년생 김지영': ['팔십이년생 김지영'],
  '해리 포터와 마법사의 돌': ['해리포터 마법사의 돌'], '미움받을 용기': ['미움 바들 용기'], '총 균 쇠': ['총균쇠 상동에서 받을게요'],
  '이중 하나는 거짓말': ['이 중 하나는 거짓말 있어요'], '칵테일, 러브, 좀비': ['칵테일 러브 좀비'], '도둑맞은 집중력': ['도둑마즌 집중력'],
  '홍학의 자리': ['홍하게 자리'], '천 개의 파랑': ['천개에 파랑'], '긴긴밤': ['긴 긴 밤'], '원씽': ['원 싱'], '흰': ['힌 있어요'],
};

// ② 정해진 순서로 만드는 잘못 들은 말 — 무작위가 아니라 씨앗 고정이라 돌릴 때마다 같다
let seed = 20261022; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pickOne = a => a[Math.floor(rnd() * a.length)];
const split = s => [...s].map(ch => { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 ? [Math.floor(c / 588), Math.floor((c % 588) / 28), c % 28] : ch; });
const join = a => a.map(x => typeof x === 'string' ? x : String.fromCharCode(0xAC00 + x[0] * 588 + x[1] * 28 + x[2])).join('');
const VOW = { 1: 5, 5: 1, 11: 10, 10: 11, 15: 11, 19: 20, 4: 8, 8: 4 };   // ㅐ↔ㅔ, ㅚ↔ㅙ, ㅞ→ㅚ, ㅢ→ㅣ, ㅓ↔ㅗ
const JO = { 4: 16, 16: 21, 21: 4, 19: 7, 7: 19, 22: 7, 17: 26, 26: 17, 1: 24 };  // ㄴ→ㅁ→ㅇ→ㄴ, ㅅ↔ㄷ, ㅈ→ㄷ, ㅂ↔ㅍ, ㄱ→ㅋ
const TENSE = { 0: 1, 3: 4, 7: 8, 9: 10, 12: 13, 1: 0, 4: 3, 8: 7, 10: 9, 13: 12 };
const ERR = {
  space: s => s.includes(' ') ? s.replace(/[\s,]+/g, rnd() < 0.5 ? '' : ' ') : [...s].join(rnd() < 0.5 ? ' ' : ''),
  vowel: s => { const a = split(s), idx = a.map((x, i) => typeof x !== 'string' && VOW[x[1]] !== undefined ? i : -1).filter(i => i >= 0); if (!idx.length) return null; const i = pickOne(idx); a[i][1] = VOW[a[i][1]]; return join(a); },
  final: s => { const a = split(s), idx = a.map((x, i) => typeof x !== 'string' && JO[x[2]] !== undefined ? i : -1).filter(i => i >= 0); if (!idx.length) return null; const i = pickOne(idx); a[i][2] = JO[a[i][2]]; return join(a); },
  tense: s => { const a = split(s), idx = a.map((x, i) => typeof x !== 'string' && TENSE[x[0]] !== undefined ? i : -1).filter(i => i >= 0); if (!idx.length) return null; const i = pickOne(idx); a[i][0] = TENSE[a[i][0]]; return join(a); },
  liaison: s => { const a = split(s); for (let i = 0; i + 1 < a.length; i++) if (typeof a[i] !== 'string' && typeof a[i + 1] !== 'string' && a[i][2] && a[i + 1][0] === 11 && [1, 4, 8, 16, 17, 19, 22].includes(a[i][2])) {
      const m = { 1: 0, 4: 2, 8: 5, 16: 6, 17: 7, 19: 9, 22: 12 }; a[i + 1][0] = m[a[i][2]]; a[i][2] = 0; return join(a); } return null; },
  front: s => { const w = s.replace(/,/g, '').split(' '); return w.length >= 3 ? w.slice(0, 2).join(' ') : null; },
  drop: s => { const a = [...s.replace(/[\s,]/g, '')]; if (a.length < 5) return null; a.splice(1 + Math.floor(rnd() * (a.length - 2)), 1); return a.join(''); },
};
const WRAP = ['{} 빌리고 싶어요', '{} 있어요', '{}', '{} 상동에서 받을게요', '{} 빌려 주세요', '혹시 {} 있나요'];
function variants(title, n) {
  const kinds = Object.keys(ERR), out = [];
  for (let tries = 0; out.length < n && tries < 60; tries++) {
    let s = title.replace(/,/g, ''), used = [];
    const k = 1 + (rnd() < 0.4 ? 1 : 0);
    for (let j = 0; j < k; j++) { const kind = pickOne(kinds); const r = ERR[kind](s); if (r && r !== s) { s = r; used.push(kind); } }
    if (!used.length || out.some(o => o.heard === s)) continue;
    out.push({ heard: s, kind: used.join('+') });
  }
  return out;
}
// 시연 웹 D안의 utterToQuery와 같은 규칙(말끝 떼기)
function utterToQuery(text) {
  let t = ' ' + String(text || '') + ' ';
  t = t.replace(/[?？!！.,。~]/g, ' ');
  t = t.replace(/\S+(도서관)?에서\s*(받을게요|받고\s*싶어요|받을\s*수\s*있나요|받아요|받을래요)/g, ' ');
  t = t.replace(/(을|를)?\s*(빌리고\s*싶어요|빌리고\s*싶은데요?|빌릴\s*수\s*있나요|빌릴\s*수\s*있어요|빌려\s*주세요|빌려줘|대출\s*(돼요|되나요|가능한가요)|있어요|있나요|있습니까|있을까요|찾아\s*주세요|찾아줘|찾고\s*있어요|신청할게요|신청하고\s*싶어요|보고\s*싶어요|읽고\s*싶어요)\s/g, ' ');
  t = t.replace(/\s(책|그\s*책|그거|좀|혹시|저기요|저)\s/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

const cases = [];
for (const t of DICT) {
  const hand = (HAND[t] || []).map(u => ({ title: t, say: u, kind: 'hand', inDict: true }));
  const gen = variants(t, 3 - hand.length).map(v => ({ title: t, say: pickOne(WRAP).replace('{}', v.heard), kind: v.kind, inDict: true }));
  cases.push(...hand, ...gen);
}
for (const t of OUT) { const v = variants(t, 1)[0] || { heard: t, kind: 'none' }; cases.push({ title: t, say: pickOne(WRAP).replace('{}', v.heard), kind: v.kind, inDict: false }); }

function grade(sim) {
  const r = { in: { auto_ok: 0, ask_ok: 0, ask_miss: 0, none: 0, auto_wrong: 0 }, out: { none: 0, ask: 0, auto_wrong: 0 }, wrong: [] };
  for (const c of cases) {
    const q = utterToQuery(c.say), res = choose(q, DICT, sim);
    if (c.inDict) {
      if (res.pick === c.title) r.in.auto_ok++;
      else if (res.pick) { r.in.auto_wrong++; r.wrong.push({ say: c.say, want: c.title, got: res.pick }); }
      else if (res.ask.includes(c.title)) r.in.ask_ok++;
      else if (res.ask.length) r.in.ask_miss++;
      else r.in.none++;
    } else {
      if (res.pick) { r.out.auto_wrong++; r.wrong.push({ say: c.say, want: '(사전에 없음)', got: res.pick }); }
      else if (res.ask.length) r.out.ask++;
      else r.out.none++;
    }
  }
  return r;
}
const nIn = cases.filter(c => c.inDict).length, nOut = cases.length - nIn;
const res = { 문장: { 사전안: nIn, 사전밖: nOut, 손으로쓴것: cases.filter(c => c.kind === 'hand').length }, 글자비교: grade(charSim), 소리비교: grade(soundSim) };
fs.writeFileSync(new URL('./sound_cases.json', import.meta.url), JSON.stringify(cases, null, 1));
fs.writeFileSync(new URL('./sound_result.json', import.meta.url), JSON.stringify(res, null, 1));
const pct = (a, b) => (100 * a / b).toFixed(0) + '%';
for (const k of ['글자비교', '소리비교']) {
  const g = res[k];
  console.log(`${k}: 사전 안 ${nIn}문장 — 바로 맞힘 ${g.in.auto_ok}(${pct(g.in.auto_ok, nIn)}) · 「이 책이 맞나요?」에 정답 ${g.in.ask_ok} · 후보에 정답 없음 ${g.in.ask_miss} · 사전 못 찾음(→검색) ${g.in.none} · 틀린 책 ${g.in.auto_wrong}`);
  console.log(`         사전 밖 ${nOut}문장 — 검색으로 넘김 ${g.out.none} · 확인 질문 ${g.out.ask} · 틀린 책 ${g.out.auto_wrong}`);
}
if (res.소리비교.wrong.length) console.log('소리비교 틀린 책:', res.소리비교.wrong);
// 기본 점검 몇 개 — 실패하면 종료 코드 1
const must = [['홈모노', '혼모노'], ['펴니점', '편의점'], ['달라구트 꿈 백과점', '달러구트 꿈 백화점']];
let bad = 0; for (const [a, b] of must) if (soundSim(a, b) < 0.8) { console.log('점검 실패', a, b, soundSim(a, b)); bad++; }
if (res.소리비교.in.auto_wrong + res.소리비교.out.auto_wrong > 0) bad++;
process.exit(bad ? 1 : 0);
