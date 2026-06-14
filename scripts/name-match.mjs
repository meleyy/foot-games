import { normalizeName } from "./ea-ratings-api.mjs";
import { aliasEaName, isBlockedMatch } from "./player-aliases.mjs";

export function nameTokens(value) {
  return normalizeName(value).split(" ").filter(Boolean);
}

function acceptMatch(targetName, candidate) {
  if (!candidate) {
    return null;
  }

  if (isBlockedMatch(targetName, candidate.name)) {
    return null;
  }

  return candidate;
}

export function findEaPlayerMatch(targetName, candidates) {
  const target = String(targetName ?? "").trim();
  const targetNorm = normalizeName(target);

  if (!targetNorm || candidates.length === 0) {
    return null;
  }

  const exact = candidates.find(
    (candidate) => normalizeName(candidate.name) === targetNorm,
  );

  if (exact) {
    return acceptMatch(target, exact);
  }

  const alias = aliasEaName(target);

  if (alias) {
    const aliasNorm = normalizeName(alias);
    const aliasMatch = candidates.find(
      (candidate) => normalizeName(candidate.name) === aliasNorm,
    );

    if (aliasMatch) {
      return acceptMatch(target, aliasMatch);
    }
  }

  const targetTokens = nameTokens(target);

  if (targetTokens.length === 0) {
    return null;
  }

  const tokenMatches = candidates.filter((candidate) => {
    const candidateTokens = new Set(nameTokens(candidate.name));
    return targetTokens.every((token) => candidateTokens.has(token));
  });

  if (tokenMatches.length === 1) {
    return acceptMatch(target, tokenMatches[0]);
  }

  if (targetTokens.length >= 2) {
    const lastName = targetTokens.at(-1);
    const firstToken = targetTokens[0];
    const refined = candidates.filter((candidate) => {
      const tokens = nameTokens(candidate.name);

      return (
        tokens.at(-1) === lastName &&
        (tokens[0] === firstToken ||
          tokens[0].startsWith(firstToken[0]) ||
          firstToken.startsWith(tokens[0][0]))
      );
    });

    if (refined.length === 1) {
      return acceptMatch(target, refined[0]);
    }
  }

  if (tokenMatches.length > 1) {
    const shortest = tokenMatches.sort(
      (left, right) =>
        nameTokens(left.name).length - nameTokens(right.name).length,
    )[0];

    return acceptMatch(target, shortest);
  }

  return null;
}
