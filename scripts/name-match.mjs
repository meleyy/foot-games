import { normalizeName } from "./ea-ratings-api.mjs";

export function nameTokens(value) {
  return normalizeName(value).split(" ").filter(Boolean);
}

export function findEaPlayerMatch(targetName, candidates) {
  const targetNorm = normalizeName(targetName);

  if (!targetNorm || candidates.length === 0) {
    return null;
  }

  const exact = candidates.find(
    (candidate) => normalizeName(candidate.name) === targetNorm,
  );

  if (exact) {
    return exact;
  }

  const targetTokens = nameTokens(targetName);

  if (targetTokens.length === 0) {
    return null;
  }

  const tokenMatches = candidates.filter((candidate) => {
    const candidateTokens = new Set(nameTokens(candidate.name));
    return targetTokens.every((token) => candidateTokens.has(token));
  });

  if (tokenMatches.length === 1) {
    return tokenMatches[0];
  }

  const lastName = targetTokens.at(-1);
  const lastNameMatches = candidates.filter((candidate) =>
    nameTokens(candidate.name).includes(lastName),
  );

  if (lastNameMatches.length === 1) {
    return lastNameMatches[0];
  }

  if (targetTokens.length >= 2 && lastNameMatches.length > 1) {
    const firstInitial = targetTokens[0][0];
    const refined = lastNameMatches.filter((candidate) => {
      const tokens = nameTokens(candidate.name);

      return (
        tokens.at(-1) === lastName &&
        tokens.some((token) => token.startsWith(firstInitial))
      );
    });

    if (refined.length === 1) {
      return refined[0];
    }
  }

  if (tokenMatches.length > 1) {
    return tokenMatches.sort(
      (left, right) => nameTokens(left.name).length - nameTokens(right.name).length,
    )[0];
  }

  return null;
}
