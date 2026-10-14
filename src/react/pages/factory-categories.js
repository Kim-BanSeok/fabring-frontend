// 부자재 후보의 생산품 문장을 묶는다. 한 업체가 여러 분류에 들어갈 수 있다.
const compact = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/gu, '').toLowerCase();

export const SUPPLY_CATEGORIES = [
  ['BUTTON', '단추', /단추/u],
  ['ZIPPER', '지퍼', /지퍼/u],
  ['FASTENER', '버클·파스너', /버클|파스너|화스너|스냅단추|벨크로|찍찍이/u],
  ['LACE', '레이스', /레이스(?!웨이)/u],
  ['TEXTILE_LABEL', '라벨', /직조라벨|섬유라벨|의류라벨|의류등의섬유라벨|세폭직물\(라벨지\)/u],
  ['GARMENT_CORD', '끈', /의류부자재.*끈|가방끈|헬멧끈|마스크끈|귀끈/u],
  ['INTERLINING', '심지', /심지|심테이프/u],
  ['RIBBON', '리본', /리본/u],
  ['SEWING_THREAD', '재봉사', /재봉사|봉제사|재봉실|봉제실/u],
  ['GARMENT_TRIM', '부자재', /의류부자재|가방의류부자재|옷부착부자재|마스크원부자재/u],
];

export const supplyCategoryCodes = (industry) => {
  const text = compact(industry);
  return SUPPLY_CATEGORIES.filter(([, , pattern]) => pattern.test(text)).map(([code]) => code);
};

export const supplyCategoryCode = (value) => SUPPLY_CATEGORIES.some(([code]) => code === value) ? value : '';

export function factoryArea(item) {
  const source = item?.legal_dong || item?.address || '';
  const areas = String(source).match(/[가-힣0-9]+(?:읍|면|동)/gu) || [];
  return areas.at(-1) || '';
}
