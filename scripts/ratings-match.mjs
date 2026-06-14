import { aliasEaName } from "./player-aliases.mjs";
import { normalizeName } from "./ea-ratings-api.mjs";

export function matchRatingsToSquad(squadPlayers, sourcePlayers) {
  const ratingByName = new Map(
    sourcePlayers.map((player) => [normalizeName(player.name), player]),
  );
  let matched = 0;

  for (const player of squadPlayers) {
    const playerNorm = normalizeName(player.name);
    const alias = aliasEaName(player.name);
    const sourcePlayer =
      ratingByName.get(playerNorm) ??
      (alias ? ratingByName.get(normalizeName(alias)) : null);

    if (!sourcePlayer?.rating) {
      continue;
    }

    player.rating = sourcePlayer.rating;
    player.potential = sourcePlayer.potential ?? null;
    if (sourcePlayer.position) {
      player.position = sourcePlayer.position;
    }
    if (sourcePlayer.positionCode) {
      player.positionCode = sourcePlayer.positionCode;
    }
    player.ratingMatched = true;
    matched += 1;
  }

  return matched;
}
