export const samePatch = (a, b) => Boolean(a && b && a === b);
export function descriptionStatus(a, patch) {
  if (!a.description) return 'missing';
  if (!a.descriptionPatch || !a.descriptionDate) return 'unknown';
  return samePatch(a.descriptionPatch, patch) ? 'current' : 'outdated';
}
export function validDescription(s) {
  return typeof s === 'string' && s.trim().length >= 4 && s.length <= 2000 &&
    !/(?:\.{3}|…)$|@[^@]+@|\{\{|<[^>]+>|如果你的英雄机制|这类高分高样本/.test(s);
}
export function detailDates(heroDate, augments, latest) {
  const dates = [heroDate, ...augments.map(a => a.date)].filter(Boolean).sort();
  return { oldest: dates[0] || null, newest: dates.at(-1) || null,
    old: augments.filter(a => a.date && a.date !== latest).length,
    unknown: augments.filter(a => !a.date).length };
}
