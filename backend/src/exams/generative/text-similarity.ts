/** 문자 3-gram Jaccard 유사도. */
export function similarity(left: string, right: string): number {
  const grams = (value: string) => {
    const normalized = value.replace(/\s+/gu, '');
    const set = new Set<string>();
    for (let index = 0; index + 3 <= normalized.length; index += 1) set.add(normalized.slice(index, index + 3));
    return set;
  };
  const a = grams(left);
  const b = grams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
}
