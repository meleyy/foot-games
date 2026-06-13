const groupsEl = document.querySelector("#groups");
const statsEl = document.querySelector("#stats");
const panel = document.querySelector("#panel");
const panelTitle = document.querySelector("#panel-title");
const panelBody = document.querySelector("#panel-body");

function formatRating(value) {
  if (value == null) {
    return "—";
  }

  return Number(value).toFixed(1);
}

function formatDate(iso) {
  if (!iso) {
    return "—";
  }

  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function renderStats(overview) {
  statsEl.innerHTML = `
    <div class="stat-card">
      <strong>${overview.nationCount}</strong>
      <span>nations CDM</span>
    </div>
    <div class="stat-card">
      <strong>${overview.loadedTeamCount}</strong>
      <span>équipes en base</span>
    </div>
    <div class="stat-card">
      <strong>${overview.playerCount}</strong>
      <span>joueurs</span>
    </div>
    <div class="stat-card">
      <strong>${overview.ratedCount ?? 0}</strong>
      <span>notes EA</span>
    </div>
  `;

  const meta = document.querySelector("#rating-meta");
  if (meta) {
    meta.textContent =
      `${overview.ratingSource ?? "EA FC 26"}. ` +
      `Dernier import notes : ${formatDate(overview.ratingsImportedAt ?? overview.lastEaImport)}.`;
  }
}

function renderGroups(overview) {
  groupsEl.innerHTML = overview.groups
    .map(
      (group) => `
        <article class="group-card">
          <h3>Groupe ${group.group}</h3>
          <div class="team-list">
            ${group.teams
              .map(
                (team) => `
                  <button
                    class="team-button${team.inDatabase ? "" : " missing"}"
                    type="button"
                    data-team="${encodeURIComponent(team.name)}"
                  >
                    <div class="team-top">
                      <span class="team-name">${team.name}</span>
                      <span class="badge${team.inDatabase ? "" : " warning"}">
                        ${team.inDatabase ? formatRating(team.topRating) : "?"}
                      </span>
                    </div>
                    <div class="team-meta">
                      ${
                        team.inDatabase
                          ? `${team.playerCount} joueurs · moy. ${formatRating(team.avgRating)}`
                          : "Effectif non importé"
                      }
                    </div>
                  </button>
                `,
              )
              .join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderPlayers(teamName, players) {
  panelTitle.textContent = teamName;

  if (players.length === 0) {
    panelBody.innerHTML =
      '<p class="empty-state">Aucun joueur importé pour cette sélection.</p>';
    return;
  }

  panelBody.innerHTML = `
    <table class="players-table">
      <thead>
        <tr>
          <th>Joueur</th>
          <th>Poste</th>
          <th>Note</th>
          <th>Club</th>
        </tr>
      </thead>
      <tbody>
        ${players
          .map(
            (player) => `
              <tr>
                <td>${player.name}</td>
                <td>${player.position_code ?? player.position ?? "—"}</td>
                <td class="rating">${formatRating(player.rating)}</td>
                <td>${player.club ?? "—"}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function openPanel() {
  panel.classList.remove("hidden");
  panel.setAttribute("aria-hidden", "false");
}

function closePanel() {
  panel.classList.add("hidden");
  panel.setAttribute("aria-hidden", "true");
}

function buildOverviewFromBootstrap(bootstrap) {
  const teamsByName = new Map(
    (bootstrap.teams ?? []).map((team) => [team.name, team]),
  );

  const groups = Object.entries(bootstrap.groups ?? {}).map(([group, nations]) => ({
    group,
    teams: nations.map((name) => {
      const team = teamsByName.get(name);
      const players = team?.players ?? [];
      const ratings = players
        .map((player) => player.rating)
        .filter((rating) => rating != null);

      return {
        name,
        playerCount: players.length,
        avgRating:
          ratings.length > 0
            ? ratings.reduce((sum, rating) => sum + Number(rating), 0) /
              ratings.length
            : null,
        topRating: ratings.length > 0 ? Math.max(...ratings) : null,
        inDatabase: players.length > 0,
      };
    }),
  }));

  const loadedTeamCount = groups
    .flatMap((group) => group.teams)
    .filter((team) => team.inDatabase).length;

  return {
    nationCount: groups.reduce((total, group) => total + group.teams.length, 0),
    loadedTeamCount,
    playerCount: bootstrap.playerCount ?? 0,
    ratedCount: bootstrap.playerCount ?? 0,
    ratingsImportedAt: bootstrap.generatedAt ?? null,
    lastEaImport: null,
    ratingSource: "FIFA Index FC 26",
    groups,
  };
}

async function loadOverview() {
  const sources = ["/api/overview", "/data/game-bootstrap.json"];
  let lastError = null;

  for (const source of sources) {
    try {
      const response = await fetch(source);

      if (!response.ok) {
        lastError = new Error(`${source} → HTTP ${response.status}`);
        continue;
      }

      const payload = await response.json();
      return source.endsWith("game-bootstrap.json")
        ? buildOverviewFromBootstrap(payload)
        : payload;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Impossible de charger les groupes.");
}

async function loadTeam(teamName) {
  const sources = [
    `/api/teams/${encodeURIComponent(teamName)}`,
    "/data/game-bootstrap.json",
  ];
  let lastError = null;

  for (const source of sources) {
    try {
      const response = await fetch(source);

      if (!response.ok) {
        lastError = new Error(`${source} → HTTP ${response.status}`);
        continue;
      }

      const payload = await response.json();

      if (source.endsWith("game-bootstrap.json")) {
        const team = (payload.teams ?? []).find((entry) => entry.name === teamName);

        if (!team) {
          lastError = new Error(`Équipe inconnue : ${teamName}`);
          continue;
        }

        return {
          team: teamName,
          players: team.players ?? [],
        };
      }

      return payload;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Impossible de charger l’effectif.");
}

groupsEl.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-team]");

  if (!button) {
    return;
  }

  const teamName = decodeURIComponent(button.dataset.team);

  openPanel();
  panelBody.innerHTML = '<p class="empty-state">Chargement…</p>';

  try {
    const payload = await loadTeam(teamName);
    renderPlayers(payload.team, payload.players);
  } catch (error) {
    panelTitle.textContent = teamName;
    panelBody.innerHTML = `<p class="error">${error.message}</p>`;
  }
});

panel.addEventListener("click", (event) => {
  if (event.target.matches("[data-close]")) {
    closePanel();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePanel();
  }
});

try {
  const overview = await loadOverview();
  renderStats(overview);
  renderGroups(overview);
} catch (error) {
  groupsEl.innerHTML = `<p class="error">${error.message}</p>`;
}
