import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";
import { chromium } from "playwright";

import { ESPN_TO_FRENCH } from "./world-cup-2026-teams.mjs";
import { normalizeName } from "./ea-ratings-api.mjs";
import { matchRatingsToSquad } from "./ratings-match.mjs";

export { matchRatingsToSquad };

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const profileDir = path.join(rootDir, "data", "fifaindex-browser-profile");
const gameSlug = process.env.FIFAINDEX_GAME ?? "fc26";

export const FIFAINdex_NATION_SLUGS = {
  Algeria: "97-algeria",
  Argentina: "52-argentina",
  Australia: "195-australia",
  Austria: "4-austria",
  Belgium: "7-belgium",
  "Bosnia-Herzegovina": "8-bosnia-herzegovina",
  Brazil: "54-brazil",
  Canada: "70-canada",
  "Cape Verde": "104-cape-verde",
  Colombia: "56-colombia",
  "Congo DR": "110-dr-congo",
  Croatia: "10-croatia",
  Curaçao: "85-curacao",
  Czechia: "12-czechia",
  Ecuador: "57-ecuador",
  Egypt: "111-egypt",
  England: "14-england",
  France: "18-france",
  Germany: "21-germany",
  Ghana: "117-ghana",
  Haiti: "80-haiti",
  Iran: "161-iran",
  Iraq: "162-iraq",
  "Ivory Coast": "108-ivory-coast",
  Japan: "163-japan",
  Jordan: "164-jordan",
  Mexico: "83-mexico",
  Morocco: "129-morocco",
  Netherlands: "34-netherlands",
  "New Zealand": "198-new-zealand",
  Norway: "36-norway",
  Panama: "87-panama",
  Paraguay: "58-paraguay",
  Portugal: "38-portugal",
  Qatar: "182-qatar",
  "Saudi Arabia": "183-saudi-arabia",
  Scotland: "42-scotland",
  Senegal: "136-senegal",
  "South Africa": "140-south-africa",
  "South Korea": "167-republic-of-korea",
  Spain: "45-spain",
  Sweden: "46-sweden",
  Switzerland: "47-switzerland",
  Tunisia: "145-tunisia",
  Türkiye: "48-turkiye",
  "United States": "95-united-states",
  Uruguay: "60-uruguay",
  Uzbekistan: "191-uzbekistan",
};

/** @deprecated Use FIFAINdex_NATION_SLUGS — kept for backwards compatibility */
export const FIFAINdex_TEAM_SLUGS = FIFAINdex_NATION_SLUGS;

const positionMap = {
  GK: "GK",
  CB: "DF",
  LCB: "DF",
  RCB: "DF",
  LB: "DF",
  RB: "DF",
  LWB: "DF",
  RWB: "DF",
  CDM: "MF",
  CM: "MF",
  CAM: "MF",
  LCM: "MF",
  RCM: "MF",
  LM: "MF",
  RM: "MF",
  ST: "FW",
  CF: "FW",
  LW: "FW",
  RW: "FW",
};

export function parseTeamHtml(html) {
  const $ = cheerio.load(html);
  const players = [];
  const headers = $("table thead th")
    .map((_, cell) => $(cell).text().trim().toLowerCase())
    .get();
  const nationLayout =
    headers.includes("position") && !headers.includes("age");

  $("table tbody tr").each((_, row) => {
    const link = $(row).find('a[href*="/players/"]').first();
    const href = link.attr("href");

    if (!href) {
      return;
    }

    const idMatch = href.match(/\/players\/(\d+)-/);

    if (!idMatch) {
      return;
    }

    const cells = $(row)
      .find("td")
      .map((__, cell) => $(cell).text().trim())
      .get();

    if (cells.length < 5) {
      return;
    }

    let position;
    let age;
    let overall;
    let potential;

    if (nationLayout) {
      position = cells[2] ?? null;
      age = null;
      overall = Number(cells[4]);
      potential = Number(cells[5]);
    } else {
      if (cells.length < 6) {
        return;
      }

      position = cells[3] ?? null;
      age = Number(cells[4]) || null;
      overall = Number(cells[5]);
      potential = Number(cells[6]);
    }

    players.push({
      id: Number(idMatch[1]),
      name: link.text().trim(),
      shirtNumber: Number(cells[0]) || null,
      position,
      positionCode: positionMap[position] ?? null,
      age: Number.isFinite(age) ? age : null,
      rating: Number.isFinite(overall) ? overall / 10 : null,
      potential: Number.isFinite(potential) ? potential : null,
      club: nationLayout ? (cells[3] ?? null) : null,
    });
  });

  return players;
}

export async function createFifaIndexBrowser() {
  fs.mkdirSync(profileDir, { recursive: true });

  const launchOptions = {
    headless: process.env.FIFAINDEX_HEADED !== "true",
    viewport: { width: 1280, height: 900 },
  };

  if (process.env.FIFAINDEX_CHANNEL) {
    launchOptions.channel = process.env.FIFAINDEX_CHANNEL;
  }

  const context = await chromium.launchPersistentContext(profileDir, launchOptions);
  const page = context.pages()[0] ?? (await context.newPage());

  return { context, page };
}

export async function ensureCloudflarePassed(page) {
  await page.goto("https://fifaindex.com/", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const title = (await page.title()).toLowerCase();

    if (!title.includes("just a moment")) {
      return;
    }

    if (process.env.FIFAINDEX_HEADED === "true" && attempt === 0) {
      console.log(
        "Cloudflare verification detected. Complete the check in the browser window if needed...",
      );
    }

    await page.waitForTimeout(2000);
  }

  throw new Error(
    "Cloudflare challenge not passed. Run with FIFAINDEX_HEADED=true and complete verification once.",
  );
}

export async function fetchNationPage(page, nationSlug) {
  const url = `https://fifaindex.com/nations/${nationSlug}/${gameSlug}`;

  let html = await page.evaluate(async (targetUrl) => {
    const response = await fetch(targetUrl, { credentials: "include" });

    if (!response.ok) {
      return { ok: false, status: response.status, html: "" };
    }

    return { ok: true, status: response.status, html: await response.text() };
  }, url);

  if (!html.ok) {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });

    await page
      .waitForSelector("table tbody tr a[href*='/players/']", {
        timeout: 120000,
      })
      .catch(() => null);

    const content = await page.content();

    if (content.toLowerCase().includes("just a moment")) {
      throw new Error(
        "Cloudflare block detected. Run once with FIFAINDEX_HEADED=true to pass verification.",
      );
    }

    if (!content.includes("/players/")) {
      throw new Error(`No player data found for ${url}.`);
    }

    return content;
  }

  if (html.html.toLowerCase().includes("just a moment")) {
    throw new Error(
      "Cloudflare block detected. Run once with FIFAINDEX_HEADED=true to pass verification.",
    );
  }

  if (!html.html.includes("/players/")) {
    throw new Error(`No player data found for ${url}.`);
  }

  return html.html;
}

/** @deprecated Use fetchNationPage */
export async function fetchTeamPage(page, teamSlug) {
  return fetchNationPage(page, teamSlug);
}

export async function scrapeTeamRatings(page, frenchTeamName) {
  const espnName = Object.entries(ESPN_TO_FRENCH).find(
    ([, french]) => french === frenchTeamName,
  )?.[0];
  const nationSlug = FIFAINdex_NATION_SLUGS[espnName];

  if (!nationSlug) {
    throw new Error(`No FIFA Index nation mapped for ${frenchTeamName}.`);
  }

  const html = await fetchNationPage(page, nationSlug);
  return parseTeamHtml(html);
}

/** @deprecated Import from ratings-match.mjs */
export function matchRatingsToSquadLegacy(squadPlayers, fifaPlayers) {
  return matchRatingsToSquad(squadPlayers, fifaPlayers);
}
