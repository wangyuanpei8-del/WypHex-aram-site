// Hexdata 详情页的效果段落；剔除推荐英雄和通用阵容建议，不猜测缺项。
export function extractDescription(html) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const text = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) =>
      e.startsWith('#') ? String.fromCodePoint(parseInt(e.slice(e[1]?.toLowerCase() === 'x' ? 2 : 1), e[1]?.toLowerCase() === 'x' ? 16 : 10)) : entities[e] ?? m)
    .replace(/\s+/g, ' ');
  return /这类高分高样本英雄上考虑[。.]\s*([\s\S]*?)\s*如果你的英雄机制/.exec(text)?.[1]?.trim() || '';
}
