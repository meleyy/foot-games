// Discover FIFA Index nation -> team slug mapping via browser console on fifaindex.com
// Paste and run in DevTools while on https://fifaindex.com/

const nations = [];
for (let id = 1; id <= 220; id++) {
  const response = await fetch(`https://fifaindex.com/nations/${id}-x`);
  if (!response.ok) continue;

  const html = await response.text();
  const titleMatch = html.match(/<title>([^<]+) - FIFA Index<\/title>/);
  if (!titleMatch) continue;

  const canonical = html.match(
    /rel="canonical" href="https:\/\/fifaindex\.com\/nations\/(\d+-[^"]+)"/,
  );
  nations.push({
    id,
    name: titleMatch[1],
    slug: canonical?.[1] ?? `${id}-unknown`,
  });
}

console.log(JSON.stringify(nations, null, 2));
