/**
 * FC 26 ratings for players added/updated in The World's Game patch
 * who are not listed on fcratings.com nation pages.
 * Source: EA FC 26 World Cup mode / FUT national team cards (June 2026).
 */
import { normalizeName } from "./ea-ratings-api.mjs";

export const FC26_WORLD_CUP_RATINGS = new Map(
  [
    ["Neymar", { rating: 8.3, position: "CAM", positionCode: "MF" }],
    ["Neymar Jr", { rating: 8.3, position: "CAM", positionCode: "MF" }],
  ].map(([name, data]) => [normalizeName(name), data]),
);

export function worldCupRatingFor(name) {
  return FC26_WORLD_CUP_RATINGS.get(normalizeName(String(name ?? "").trim())) ?? null;
}
