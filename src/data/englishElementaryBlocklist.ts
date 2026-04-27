/**
 * 초등·기초 수준으로 간주하는 영단어 (소문자 기준).
 * AI 추출 결과와 클라이언트 후처리에서 제외하는 데 사용합니다.
 */
const RAW = `
a an the and or but if so as at to of in on for from by with without into onto upon
be am is are was were been being
have has had having do does did doing done
can could shall should will would may might must
it its this that these those there here they them their what which who whom whose
he she her him his our your my mine yours ours theirs me us we you i
not no yes all any some every each both few more most other another such same
one two first second new old long little much many
get got go went come came make made take took see saw know knew think thought
say said tell told ask asked work worked seem seemed try tried use used find found
give gave need let like help show hear feel put set run keep let begin began
part over out up down back off than then when where while why how
time year day way man world life hand part number children
high only just also well even still back new
good bad big small large own great next last
small own
school home house look book read play learn write
student teacher class room page water food
day night morning afternoon today yesterday
red blue green black white
cat dog
very too
before after again never always sometimes
`;

function parseSet(): Set<string> {
  const s = new Set<string>();
  for (const line of RAW.split(/\n/)) {
    for (const w of line.trim().split(/\s+/)) {
      if (w) s.add(w.toLowerCase());
    }
  }
  return s;
}

export const ENGLISH_ELEMENTARY_BLOCKLIST = parseSet();

export function isElementaryWord(word: string): boolean {
  const w = word
    .toLowerCase()
    .replace(/[^a-z'-]/g, "");
  if (!w) return true;
  if (ENGLISH_ELEMENTARY_BLOCKLIST.has(w)) return true;
  if (w.length <= 2) return true;
  return false;
}
