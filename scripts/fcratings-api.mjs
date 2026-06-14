import * as cheerio from "cheerio";

import { FIFAINdex_NATION_SLUGS } from "./fifaindex-scraper.mjs";
import { positionGroup } from "./ea-ratings-api.mjs";
import { ESPN_TO_FRENCH } from "./world-cup-2026-teams.mjs";

const BASE_URL = "https://www.fcratings.com";
const maxRetries = Number(process.env.FCRATINGS_MAX_RETRIES ?? 3);

export function fcRatingsNationSlug(frenchTeamName) {
  const espnName = Object.entries(ESPN_TO_FRENCH).find(
    ([, french]) => french === frenchTeamName,
  )?.[0];
  const fifaSlug = FIFAINdex_NATION_SLUGS[espnName];

  if (!fifaSlug) {
    return null;
  }

  const [id, ...nameParts] = fifaSlug.split("-");
  return `${nameParts.join("-")}-${id}`;
}

export function parseNationHtml(html) {
  const $ = cheerio.load(html);
  const players = [];
  const seen = new Set();

  $("table tbody tr").each((_, row) => {
    const links = $(row)
      .find('a[href*="fcratings.com/"]')
      .toArray()
      .map((anchor) => ({
        href: $(anchor).attr("href") ?? "",
        name: $(anchor).text().trim(),
      }))
      .filter(
        (entry) =>
          entry.name &&
          /\/[a-z0-9-]+-\d+/.test(entry.href) &&
          !entry.href.includes("/nations/") &&
          !entry.href.includes("/positions/") &&
          !entry.href.includes("/clubs/") &&
          !entry.href.includes("/abilities/"),
      );

    const playerLink = links[0];

    if (!playerLink) {
      return;
    }

    const idMatch = playerLink.href.match(/-(\d+)(?:\?|$)/);

    if (!idMatch || seen.has(idMatch[1])) {
      return;
    }

    seen.add(idMatch[1]);

    const rowText = $(row).text().replace(/\s+/g, " ");
    const ovrMatch = rowText.match(/OVR\s*(\d{2})/i);

    if (!ovrMatch) {
      return;
    }

    const positionMatch = rowText.match(
      /\b(GK|SW|RWB|RB|RCB|CB|LCB|LB|LWB|RDM|CDM|LDM|RM|RCM|CM|LCM|LM|RAM|CAM|LAM|RF|CF|LF|RW|RS|ST|LS|LW)\b/,
    );
    const position = positionMatch?.[1] ?? null;

    players.push({
      id: Number(idMatch[1]),
      name: playerLink.name,
      position,
      positionCode: position ? positionGroup(position) : null,
      rating: Number(ovrMatch[1]) / 10,
      potential: null,
    });
  });

  return players;
}

export async function fetchNationRatings(frenchTeamName) {
  const slug = fcRatingsNationSlug(frenchTeamName);

  if (!slug) {
    throw new Error(`No FC Ratings nation mapped for ${frenchTeamName}.`);
  }

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/nations/${slug}`, {
        headers: {
          Accept: "text/html",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(60_000),
      });

      if (response.status === 403 || response.status === 429) {
        throw new Error(`FC Ratings returned HTTP ${response.status} for ${slug}.`);
      }

      if (!response.ok) {
        throw new Error(`FC Ratings returned HTTP ${response.status} for ${slug}.`);
      }

      return parseNationHtml(await response.text());
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }
    }
  }

  throw lastError;
}

export async function fetchPlayerRating(playerPath) {
  const url = playerPath.startsWith("http")
    ? playerPath
    : `${BASE_URL}/${playerPath.replace(/^\//, "")}`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 (compatible; FootGamesBot/1.0)",
    },
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const match =
    html.match(/is rated (\d{2}) overall/i) ??
    html.match(/overall in EA SPORTS FC[^0-9]*(\d{2})/i);

  if (!match) {
    return null;
  }

  const title = html.match(/<h1[^>]*>([^<]+)</i)?.[1] ?? "";
  const name = title.replace(/'s FC 26 Rating/i, "").trim();
  const positionMatch = html.match(
    /\bplays as a [^<]*\(([A-Z]{2,3})\)/i,
  );

  const position = positionMatch?.[1]?.toUpperCase() ?? null;

  return {
    name,
    rating: Number(match[1]) / 10,
    position,
    positionCode: position ? positionGroup(position) : null,
    potential: null,
  };
}
