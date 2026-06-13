import {
  DEFAULT_AI_FORMATION_ID,
  FORMATIONS,
  buildAiSquad,
  buildKnockoutBracket,
  canPlacePlayer,
  canPlayRole,
  drawUniqueNations,
  groupStandings,
  pickRandomGroup,
  ratingOvr,
  rollDraftNation,
  roundRobinPairs,
  simulateKnockoutRound,
  simulateMatch,
  squadBySlot,
  squadStrength,
  teamProfile,
} from "./game-engine.js";

const state = {
  data: null,
  phase: "home",
  formation: null,
  gameMode: "classic",
  squadName: "Mon équipe",
  assignments: {},
  draftNations: [],
  pickIndex: 0,
  rollsLeft: 3,
  selectedPlayer: null,
  groupKey: null,
  replacedTeam: null,
  tournament: null,
  lastPlacedSlot: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function bootstrap() {
  const sources = ["/api/game/bootstrap", "/data/game-bootstrap.json"];
  let lastError = null;

  for (const source of sources) {
    try {
      const response = await fetch(source);

      if (!response.ok) {
        lastError = new Error(`${source} → HTTP ${response.status}`);
        continue;
      }

      state.data = await response.json();

      if (!state.data?.teams?.length) {
        lastError = new Error("Aucun joueur en base.");
        continue;
      }

      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    (lastError instanceof Error ? lastError.message : "Réseau indisponible") +
      ". Lance `npm run dev` puis ouvre l’URL affichée dans le terminal.",
  );
}

function formationById(id) {
  return FORMATIONS.find((formation) => formation.id === id) ?? FORMATIONS[0];
}

const GAME_MODES = [
  { id: "classic", label: "Classique" },
  { id: "memory", label: "From memory" },
];

function gameModeById(id) {
  return GAME_MODES.find((mode) => mode.id === id) ?? GAME_MODES[0];
}

function gameModeLabel(id) {
  return gameModeById(id).label;
}

function teamRoster(teamName) {
  return state.data.teams.find((team) => team.name === teamName)?.players ?? [];
}

function currentSquad() {
  return squadBySlot(state.formation, state.assignments);
}

function filledCount() {
  return Object.keys(state.assignments).length;
}

function createParticipant(id, name, squad, isUser = false) {
  return {
    id,
    name,
    squad,
    isUser,
    strength: squadStrength(squad),
    profile: teamProfile(squad),
  };
}

function render() {
  const app = $("#app");
  app.dataset.phase = state.phase;
  document.body.classList.toggle("is-home", state.phase === "home");
  app.classList.remove("is-ready");
  app.classList.add("is-changing");

  switch (state.phase) {
    case "home":
      app.innerHTML = renderHome();
      $("#start-btn")?.addEventListener("click", () => {
        state.phase = "setup";
        state.formation = formationById("4-3-3");
        state.gameMode = "classic";
        render();
      });
      break;
    case "setup":
      if (!state.formation) {
        state.formation = formationById("4-3-3");
      }
      app.innerHTML = renderSetup();
      bindSetup();
      break;
    case "draft":
      app.innerHTML = renderDraft();
      bindDraft();
      break;
    case "tournament":
      app.innerHTML = renderTournament();
      bindTournament();
      break;
    case "result":
      app.innerHTML = renderResult();
      bindResult();
      break;
    default:
      app.innerHTML = renderHome();
  }

  requestAnimationFrame(() => {
    app.classList.remove("is-changing");
    app.classList.add("is-ready");
  });
}

function landingStatsLine() {
  if (!state.data) {
    return "48 sélections · 11 joueurs · Draft CDM 2026";
  }

  const nations = state.data.nations?.length ?? 0;
  const teams = state.data.teams?.length ?? 0;
  const players = state.data.teams?.reduce(
    (total, team) => total + (team.players?.length ?? 0),
    0,
  );

  return `${nations} sélections · ${teams} équipes · ${players.toLocaleString("fr-FR")} joueurs`;
}

function allRosterPlayers() {
  return (
    state.data?.teams.flatMap((team) =>
      team.players.map((player) => ({ ...player, teamName: team.name })),
    ) ?? []
  );
}

function landingSquadAssignments(formation) {
  const squad = buildAiSquad(allRosterPlayers(), formation);
  const assignments = {};

  formation.slots.forEach((slot, index) => {
    if (squad[index]) {
      assignments[slot.id] = squad[index];
    }
  });

  return assignments;
}

function playerLastName(name) {
  return name?.split(" ").at(-1) ?? "";
}

function squadNumberForSlot(formation, slot) {
  const index = formation?.slots?.findIndex((entry) => entry.id === slot.id) ?? -1;
  return index >= 0 ? index + 1 : "";
}

function pitchSlotInnerHTML(slot, { player = null, preview = false, formation = null } = {}) {
  if (player) {
    const number = formation ? squadNumberForSlot(formation, slot) : "";
    return `
      <span class="slot-disc" aria-hidden="true"><span class="slot-number">${number}</span></span>
      <span class="slot-name">${playerLastName(player.name)}</span>
    `;
  }

  if (preview) {
    return `<span class="slot-disc"><span class="slot-role">${slot.label}</span></span>`;
  }

  return `
    <span class="slot-disc"><span class="slot-empty">+</span></span>
    <span class="slot-name slot-name--hint">${slot.label}</span>
  `;
}

function renderLandingPitchSlots(formation) {
  const assignments = landingSquadAssignments(formation);

  return formation.slots
    .map((slot, index) => {
      const player = assignments[slot.id];
      const delay = `animation-delay:${index * 0.04}s`;

      return `
        <div
          class="pitch-slot pitch-slot-preview pitch-slot-demo role-${slot.role} is-filled anim-slot"
          style="left:${slot.x}%;top:${slot.y}%;${delay}"
        >
          ${pitchSlotInnerHTML(slot, { player, formation })}
        </div>
      `;
    })
    .join("");
}

function renderHome() {
  const formation = formationById("4-3-3");

  return `
    <section class="landing">
      <div class="landing-hero">
        <div class="landing-hero-copy anim-fade">
          <div class="landing-display" aria-hidden="true">
            <span class="landing-display-num">11</span>
          </div>
          <h1 class="landing-title">
            Tire les dés.<br />
            Compose ton onze<br />
            de rêve.
          </h1>
          <p class="landing-lede">
            11 nations tirées au sort, 11 joueurs à recruter.
            3 relances par tour. Choisis ta formation, puis simule la Coupe du Monde jusqu'à la finale.
          </p>
          <div class="landing-cta">
            <button class="btn btn-primary" id="start-btn">Jouer en solo →</button>
            <button class="btn btn-ghost landing-cta-secondary" type="button" disabled>
              Jouer en ligne (à venir)
            </button>
          </div>
        </div>
        <div class="landing-hero-visual anim-fade">
          <div class="panel landing-pitch-card">
            <p class="landing-pitch-label">${formation.label}</p>
            <div class="pitch pitch-11 pitch-preview landing-pitch">
              ${renderLandingPitchSlots(formation)}
            </div>
          </div>
        </div>
      </div>

      <div class="panel landing-steps">
        <article class="landing-step">
          <div class="landing-step-head">
            <span class="landing-step-num">01</span>
            <span class="landing-step-icon" aria-hidden="true"></span>
          </div>
          <h2 class="landing-step-title">Tirer</h2>
          <p class="landing-step-copy">Un pays au sort à chaque tour · 3 relances</p>
        </article>
        <article class="landing-step">
          <div class="landing-step-head">
            <span class="landing-step-num">02</span>
            <span class="landing-step-icon" aria-hidden="true"></span>
          </div>
          <h2 class="landing-step-title">Composer</h2>
          <p class="landing-step-copy">Choisis un joueur par nation · Formation libre</p>
        </article>
        <article class="landing-step">
          <div class="landing-step-head">
            <span class="landing-step-num">03</span>
            <span class="landing-step-icon" aria-hidden="true"></span>
          </div>
          <h2 class="landing-step-title">Simuler</h2>
          <p class="landing-step-copy">Phase de groupes puis tableau à élimination directe</p>
        </article>
      </div>

      <p class="landing-stats">${landingStatsLine()}</p>
    </section>
  `;
}

function renderSetup() {
  const formations = FORMATIONS.map(
    (formation, index) => `
      <button
        type="button"
        class="option-pill formation-pill anim-stagger"
        style="animation-delay:${index * 0.04}s"
        data-formation="${formation.id}"
        ${state.formation?.id === formation.id ? 'aria-pressed="true"' : ""}
      >
        <span class="option-pill-label">${formation.label}</span>
      </button>
    `,
  ).join("");

  const modes = GAME_MODES.map(
    (mode) => `
      <button
        type="button"
        class="option-pill mode-pill"
        data-mode="${mode.id}"
        ${state.gameMode === mode.id ? 'aria-pressed="true"' : ""}
      >
        <span class="option-pill-label">${mode.label}</span>
      </button>
    `,
  ).join("");

  return `
    <section class="draft-board setup-board">
      <header class="draft-top">
        <div class="draft-top-head">
          <span class="step">01</span>
          <h2 class="draft-top-label">Formation · Préparation</h2>
        </div>
        <p class="draft-hint">Choisis ton système de jeu. Le groupe CDM sera tiré au hasard.</p>
      </header>
      <div class="draft-columns setup-columns">
        <div class="panel draft-zone draft-zone-setup-side anim-slide-left">
          <label class="setup-team-field field">
            <span class="nation-label">Nom de l'équipe</span>
            <input
              id="squad-name"
              class="setup-team-input"
              value="${state.squadName}"
              maxlength="24"
            />
          </label>

          <div class="setup-options" id="setup-options-panel">
            <div class="setup-option-group">
              <span class="nation-label">Formation</span>
              <div class="formation-grid" id="setup-formation-list">${formations}</div>
            </div>
            <div class="setup-option-group">
              <span class="nation-label">Mode</span>
              <div class="mode-grid" id="setup-mode-list">${modes}</div>
            </div>
          </div>

          <div class="actions setup-actions">
            <button class="btn btn-ghost" id="back-home">Retour</button>
            <button class="btn btn-primary" id="start-draft">Lancer le draft</button>
          </div>
        </div>

        <div class="panel draft-zone draft-zone-pitch anim-fade">
          <div class="pitch pitch-11 pitch-preview" id="setup-pitch">
            ${renderPreviewSlots(state.formation, { animate: true })}
          </div>
        </div>

        <div class="panel draft-zone draft-zone-squad draft-zone-setup-summary anim-slide-right">
          <header class="squad-head">
            <h3 id="setup-formation-label">${state.formation?.label ?? "4-3-3"}</h3>
          </header>
          <p class="squad-progress" id="setup-mode-summary">${gameModeLabel(state.gameMode)} · 11 nations</p>
          <p class="copy setup-copy">Valide ta formation pour démarrer le draft.</p>
        </div>
      </div>
    </section>
  `;
}

function renderSquadSidebar() {
  const squad = currentSquad();
  const avg = squadStrength(squad.filter(Boolean));
  const filled = filledCount();

  const rows = state.formation.slots
    .map((slot, index) => {
      const player = state.assignments[slot.id];
      const delay = index * 0.03;

      if (!player) {
        return `
          <div class="squad-row is-empty anim-stagger" style="animation-delay:${delay}s">
            <span class="squad-pos">${slot.label}</span>
            <span class="squad-name">—</span>
            <span class="squad-ovr">—</span>
          </div>
        `;
      }

      return `
        <div class="squad-row anim-stagger ${slot.id === state.lastPlacedSlot ? "is-new" : ""}" style="animation-delay:${delay}s">
          <span class="squad-pos">${slot.label}</span>
          <span class="squad-name">${player.name}</span>
          <span class="squad-ovr">${ratingOvr(player.rating)}</span>
        </div>
      `;
    })
    .join("");

  return `
    <aside class="panel squad-panel">
      <header class="squad-head">
        <h3>${state.squadName}</h3>
        <div class="avg-badge">
          <span>Moyenne</span>
          <strong class="${state.lastPlacedSlot ? "is-bump" : ""}">${filled ? ratingOvr(avg) : "—"}</strong>
        </div>
      </header>
      <p class="squad-progress">${filled} / 11 joueurs</p>
      <div class="squad-list">${rows}</div>
    </aside>
  `;
}

function renderPreviewSlots(formation, { animate = false } = {}) {
  return formation.slots
    .map((slot, index) => {
      const anim = animate ? "anim-slot" : "";
      const delay = animate ? `animation-delay:${index * 0.04}s;` : "";

      return `
        <div
          class="pitch-slot pitch-slot-preview role-${slot.role} ${anim}"
          data-slot-id="${slot.id}"
          style="left:${slot.x}%;top:${slot.y}%;${delay}"
        >
          ${pitchSlotInnerHTML(slot, { preview: true })}
        </div>
      `;
    })
    .join("");
}

function updateSetupPitch(formation) {
  const label = $("#setup-formation-label");
  const pitch = $("#setup-pitch");

  if (!label || !pitch) {
    return;
  }

  label.textContent = formation.label;

  const slots = [...pitch.querySelectorAll(".pitch-slot-preview")];

  if (slots.length !== formation.slots.length) {
    pitch.innerHTML = renderPreviewSlots(formation);
    return;
  }

  formation.slots.forEach((slot, index) => {
    const element = slots[index];
    element.className = `pitch-slot pitch-slot-preview role-${slot.role}`;
    element.dataset.slotId = slot.id;
    element.querySelector(".slot-role").textContent = slot.label;
    element.style.left = `${slot.x}%`;
    element.style.top = `${slot.y}%`;
  });
}

function renderDraftPitchSlots(formation, { animate = false } = {}) {
  return formation.slots
    .map((slot, index) => {
      const player = state.assignments[slot.id];
      const filled = player ? "is-filled" : "is-empty-slot";
      const anim = animate && !player ? "anim-slot" : "";
      const delay = animate && !player ? `animation-delay:${index * 0.04}s;` : "";

      return `
        <button
          type="button"
          class="pitch-slot role-${slot.role} ${anim} ${filled}"
          style="left:${slot.x}%;top:${slot.y}%;${delay}"
          data-slot="${slot.id}"
          ${player ? "disabled" : ""}
        >
          ${pitchSlotInnerHTML(slot, { player, formation })}
        </button>
      `;
    })
    .join("");
}

function renderPlayerListHTML(nation, { animate = true } = {}) {
  const roster = nation
    ? teamRoster(nation)
        .map((player) => ({ ...player, teamName: nation, nation }))
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    : [];

  return roster
    .map((player, index) => {
      const canPlace = canPlacePlayer(player, state.formation, state.assignments);
      const selected =
        state.selectedPlayer?.api_id === player.api_id ? "is-selected" : "";
      const anim = animate ? "anim-stagger" : "";
      const delay = animate ? `style="animation-delay:${index * 0.03}s"` : "";
      const status = canPlace
        ? `<span class="ovr ovr-sm">${ratingOvr(player.rating)}</span>`
        : `<span class="player-row-status">Complet</span>`;

      return `
        <button
          type="button"
          class="player-row ${anim} ${selected} ${canPlace ? "" : "is-disabled"}"
          ${delay}
          data-pick="${player.api_id}"
          ${canPlace ? "" : "disabled"}
          ${canPlace ? "" : 'title="Aucune place disponible pour ce poste"'}
          aria-disabled="${canPlace ? "false" : "true"}"
        >
          <span class="player-row-name">${player.name}</span>
          <span class="player-row-pos">${player.position ?? player.position_code ?? "?"}</span>
          ${status}
        </button>
      `;
    })
    .join("");
}

function updateDraftPlayerAvailability() {
  const nation = state.draftNations[state.pickIndex];

  if (!nation || !state.formation) {
    return;
  }

  const roster = new Map(
    teamRoster(nation)
      .map((player) => ({ ...player, teamName: nation, nation }))
      .map((player) => [String(player.api_id), player]),
  );

  $$("#draft-player-list [data-pick]").forEach((button) => {
    const player = roster.get(button.dataset.pick);

    if (!player) {
      return;
    }

    const canPlace = canPlacePlayer(player, state.formation, state.assignments);

    button.disabled = !canPlace;
    button.classList.toggle("is-disabled", !canPlace);
    button.setAttribute("aria-disabled", canPlace ? "false" : "true");

    if (canPlace) {
      button.removeAttribute("title");
    } else {
      button.title = "Aucune place disponible pour ce poste";
    }

    const status = button.querySelector(".player-row-status, .ovr");

    if (status) {
      status.outerHTML = canPlace
        ? `<span class="ovr ovr-sm">${ratingOvr(player.rating)}</span>`
        : `<span class="player-row-status">Complet</span>`;
    }

    if (
      !canPlace &&
      state.selectedPlayer &&
      String(state.selectedPlayer.api_id) === button.dataset.pick
    ) {
      state.selectedPlayer = null;
    }
  });
}

function renderDraftSquadRows() {
  return state.formation.slots
    .map((slot, index) => {
      const player = state.assignments[slot.id];
      const delay = index * 0.03;

      if (!player) {
        return `
          <div class="squad-row is-empty anim-stagger" data-squad-slot="${slot.id}" style="animation-delay:${delay}s">
            <span class="squad-pos">${slot.label}</span>
            <span class="squad-name">—</span>
            <span class="squad-ovr">—</span>
          </div>
        `;
      }

      return `
        <div class="squad-row anim-stagger" data-squad-slot="${slot.id}" style="animation-delay:${delay}s">
          <span class="squad-pos">${slot.label}</span>
          <span class="squad-name">${player.name}</span>
          <span class="squad-ovr">${ratingOvr(player.rating)}</span>
        </div>
      `;
    })
    .join("");
}

function updateDraftSelectionUI() {
  const hint = $("#draft-hint");

  if (hint) {
    hint.textContent = state.selectedPlayer
      ? "Clique un poste compatible sur le terrain."
      : "Choisis un joueur dans la liste.";
  }

  $$("#draft-player-list [data-pick]").forEach((button) => {
    button.classList.toggle(
      "is-selected",
      Boolean(
        state.selectedPlayer &&
          String(state.selectedPlayer.api_id) === button.dataset.pick,
      ),
    );
  });

  $$("#draft-pitch [data-slot]").forEach((button) => {
    if (button.disabled) {
      return;
    }

    button.classList.remove("is-compatible");

    if (!state.selectedPlayer) {
      return;
    }

    const slot = state.formation.slots.find(
      (entry) => entry.id === button.dataset.slot,
    );

    if (slot && canPlayRole(state.selectedPlayer, slot.role)) {
      button.classList.add("is-compatible");
    }
  });

  updateDraftPlayerAvailability();
}

function updateDraftSlotPlacement(slotId, player) {
  const slot = state.formation.slots.find((entry) => entry.id === slotId);
  const button = $(`#draft-pitch [data-slot="${slotId}"]`);

  if (!button || !slot) {
    return;
  }

  button.disabled = true;
  button.classList.remove("is-compatible", "is-blocked", "is-empty-slot");
  button.classList.add("is-filled", "is-just-placed");
  button.innerHTML = pitchSlotInnerHTML(slot, { player, formation: state.formation });

  window.setTimeout(() => button.classList.remove("is-just-placed"), 500);
}

function updateDraftSquadRow(slotId) {
  const player = state.assignments[slotId];
  const slot = state.formation.slots.find((entry) => entry.id === slotId);
  const row = $(`#draft-squad-list [data-squad-slot="${slotId}"]`);

  if (!row || !player || !slot) {
    return;
  }

  row.classList.remove("is-empty");
  row.classList.add("is-new");
  row.querySelector(".squad-pos").textContent = slot.label;
  row.querySelector(".squad-name").textContent = player.name;
  row.querySelector(".squad-ovr").textContent = ratingOvr(player.rating);
}

function updateDraftSquadMeta() {
  const filled = filledCount();
  const squad = currentSquad().filter(Boolean);
  const avg = squadStrength(squad);
  const progress = $("#draft-squad-progress");
  const avgEl = $("#draft-squad-avg");

  if (progress) {
    progress.textContent = `${filled} / 11 joueurs`;
  }

  if (avgEl) {
    avgEl.textContent = filled ? ratingOvr(avg) : "—";
    avgEl.classList.remove("is-bump");
    void avgEl.offsetWidth;
    if (state.lastPlacedSlot) {
      avgEl.classList.add("is-bump");
    }
  }

  requestAnimationFrame(updateAllScrollFades);
}

function updateScrollFades(selector) {
  const list = $(selector);
  const shell = list?.closest(".list-scroll-shell");

  if (!list || !shell) {
    return;
  }

  const top = shell.querySelector(".list-scroll-edge-top");
  const bottom = shell.querySelector(".list-scroll-edge-bottom");
  const { scrollTop, scrollHeight, clientHeight } = list;
  const canScroll = scrollHeight > clientHeight + 1;

  top?.classList.toggle("is-visible", canScroll && scrollTop > 4);
  bottom?.classList.toggle(
    "is-visible",
    canScroll && scrollTop + clientHeight < scrollHeight - 4,
  );
}

function updateAllScrollFades() {
  updateScrollFades("#draft-player-list");
  updateScrollFades("#draft-squad-list");
}

function syncDraftRowHeight() {
  const siteHeader = document.querySelector(".site-header");
  const app = $("#app");

  if (siteHeader && app) {
    app.style.setProperty("--draft-chrome-height", `${Math.ceil(siteHeader.offsetHeight)}px`);
  }

  updateAllScrollFades();
}

function bindDraftRowHeightSync() {
  const pitchZone = $(".draft-zone-pitch");
  const playersHead = $(".draft-zone-players-head");
  const columns = $(".draft-columns");

  if (!pitchZone || !playersHead || !columns) {
    return;
  }

  const measure = () => {
    requestAnimationFrame(syncDraftRowHeight);
  };

  measure();

  if (!window._draftPitchResizeObserver) {
    window._draftPitchResizeObserver = new ResizeObserver(measure);
  }

  window._draftPitchResizeObserver.disconnect();
  window._draftPitchResizeObserver.observe(columns);
  window._draftPitchResizeObserver.observe(pitchZone);
  window._draftPitchResizeObserver.observe(playersHead);
}

function bindScrollFades() {
  const lists = ["#draft-player-list", "#draft-squad-list"];

  for (const selector of lists) {
    const list = $(selector);

    if (!list || list.dataset.fadesBound === "true") {
      continue;
    }

    list.dataset.fadesBound = "true";
    list.addEventListener("scroll", updateAllScrollFades, { passive: true });
  }

  if (!window._draftScrollFadesResizeBound) {
    window.addEventListener("resize", () => {
      syncDraftRowHeight();
    }, { passive: true });
    window._draftScrollFadesResizeBound = true;
  }

  requestAnimationFrame(updateAllScrollFades);
}

function updateRollUI() {
  const button = $("#draft-roll");
  const count = $("#draft-roll-count");

  if (button) {
    button.disabled = state.rollsLeft <= 0;
  }

  if (count) {
    count.textContent = `${state.rollsLeft}/3`;
  }
}

function updateDraftPickHeader({ resetRolls = false } = {}) {
  if (resetRolls) {
    state.rollsLeft = 3;
  }

  const nation = state.draftNations[state.pickIndex];
  const progress = `${state.pickIndex + 1} / 11`;
  const title = $("#draft-progress");
  const label = $("#draft-nation-label");
  const name = $("#draft-nation-name");
  const banner = $("#draft-nation-banner");
  const list = $("#draft-player-list");

  if (title) {
    title.textContent = `Draft · ${progress}`;
  }

  if (label) {
    label.textContent = `Pays ${progress}`;
  }

  if (name) {
    name.textContent = nation ?? "—";
  }

  if (banner) {
    banner.classList.remove("anim-nation");
    void banner.offsetWidth;
    banner.classList.add("anim-nation");
  }

  if (list) {
    list.innerHTML =
      renderPlayerListHTML(nation) || "<p class='copy'>Effectif vide.</p>";
    updateDraftPlayerAvailability();
    syncDraftRowHeight();
    requestAnimationFrame(updateAllScrollFades);
  }

  updateRollUI();
}

function renderPitch({ mode = "draft", formation = state.formation } = {}) {
  const isPreview = mode === "preview";
  const assignments = isPreview ? {} : state.assignments;

  return `
    <div class="pitch pitch-11 ${isPreview ? "pitch-preview" : ""}">
      ${formation.slots
        .map((slot, index) => {
          const player = assignments[slot.id];
          const filled = player ? "is-filled" : "is-empty-slot";
          const delay = index * 0.04;
          const posStyle = `left:${slot.x}%;top:${slot.y}%;animation-delay:${delay}s`;
          const justPlaced =
            player && slot.id === state.lastPlacedSlot ? "is-just-placed" : "";
          const compatible =
            !isPreview &&
            state.selectedPlayer &&
            canPlayRole(state.selectedPlayer, slot.role)
              ? "is-compatible"
              : "";
          const blocked =
            !isPreview &&
            state.selectedPlayer &&
            !canPlayRole(state.selectedPlayer, slot.role)
              ? "is-blocked"
              : "";

          if (isPreview) {
            return `
              <div
                class="pitch-slot pitch-slot-preview role-${slot.role} anim-slot"
                style="${posStyle}"
              >
                ${pitchSlotInnerHTML(slot, { preview: true })}
              </div>
            `;
          }

          return `
            <button
              type="button"
              class="pitch-slot role-${slot.role} anim-slot ${filled} ${justPlaced} ${compatible} ${blocked}"
              style="${posStyle}"
              data-slot="${slot.id}"
              ${player ? "disabled" : ""}
            >
              ${pitchSlotInnerHTML(slot, { player, formation })}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderDraft() {
  const nation = state.draftNations[state.pickIndex];
  const progress = `${state.pickIndex + 1} / 11`;
  const hint = state.selectedPlayer
    ? "Clique un poste compatible sur le terrain."
    : "Choisis un joueur dans la liste.";
  const filled = filledCount();
  const avg = squadStrength(currentSquad().filter(Boolean));

  return `
    <section class="draft-board">
      <header class="draft-top">
        <div class="draft-top-head">
          <span class="step">02</span>
          <h2 class="draft-top-label" id="draft-progress">Draft · ${progress}</h2>
        </div>
        <p class="draft-hint" id="draft-hint">${hint}</p>
      </header>
      <div class="draft-columns">
        <div class="panel draft-zone draft-zone-players-head anim-slide-left">
          <div class="nation-banner anim-nation" id="draft-nation-banner">
            <div class="nation-banner-main">
              <div class="nation-banner-copy">
                <span class="nation-label" id="draft-nation-label">Pays ${progress}</span>
                <strong id="draft-nation-name">${nation ?? "—"}</strong>
              </div>
              <button
                type="button"
                class="btn-roll"
                id="draft-roll"
                ${state.rollsLeft <= 0 ? "disabled" : ""}
              >
                <span class="btn-roll-label">Relancer</span>
                <span class="btn-roll-count" id="draft-roll-count">${state.rollsLeft}/3</span>
              </button>
            </div>
          </div>
        </div>

        <div class="panel draft-zone draft-zone-players-list anim-slide-left">
          <div class="list-scroll-shell">
            <div class="list-scroll-edge list-scroll-edge-top" aria-hidden="true"></div>
            <div class="player-list list-scroll" id="draft-player-list">
              ${renderPlayerListHTML(nation) || "<p class='copy'>Effectif vide.</p>"}
            </div>
            <div class="list-scroll-edge list-scroll-edge-bottom" aria-hidden="true"></div>
          </div>
        </div>
        <div class="panel draft-zone draft-zone-pitch anim-fade">
          <div class="pitch pitch-11" id="draft-pitch">
            ${renderDraftPitchSlots(state.formation, { animate: true })}
          </div>
        </div>
        <div class="panel draft-zone draft-zone-squad anim-slide-right" id="draft-squad-panel">
          <header class="squad-head">
            <h3>${state.squadName}</h3>
            <div class="avg-badge">
              <span>Moyenne</span>
              <strong id="draft-squad-avg">${filled ? ratingOvr(avg) : "—"}</strong>
            </div>
          </header>
          <p class="squad-progress" id="draft-squad-progress">${filled} / 11 joueurs</p>
          <div class="list-scroll-shell">
            <div class="list-scroll-edge list-scroll-edge-top" aria-hidden="true"></div>
            <div class="squad-list list-scroll" id="draft-squad-list">${renderDraftSquadRows()}</div>
            <div class="list-scroll-edge list-scroll-edge-bottom" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderTournament() {
  const t = state.tournament;
  const groupTable = t.groupTable
    .map(
      (row, index) => `
        <tr class="${row.team.isUser ? "is-user" : ""}">
          <td>${index + 1}</td>
          <td>${row.team.name}</td>
          <td>${row.played}</td>
          <td>${row.points}</td>
          <td>${row.gf - row.ga}</td>
        </tr>
      `,
    )
    .join("");

  const matches = t.visibleMatches
    .map(
      (match, index) => `
        <article class="match-card anim-stagger ${match.highlight ? "is-highlight" : ""}" style="animation-delay:${index * 0.05}s">
          <div class="match-meta">${match.round}</div>
          <div class="match-line">
            <span>${match.home}</span>
            <strong>${match.score}</strong>
            <span>${match.away}</span>
          </div>
        </article>
      `,
    )
    .join("");

  return `
    <section class="panel tournament-panel">
      <header class="panel-head">
        <span class="step">03</span>
        <div>
          <h2>${t.title}</h2>
          <p>${t.subtitle}</p>
        </div>
      </header>
      <p class="group-info">
        Groupe <strong>${state.groupKey}</strong> · tu remplaces <strong>${state.replacedTeam}</strong>
      </p>
      <div class="tournament-grid">
        <div>
          <h3>Classement</h3>
          <table class="standings">
            <thead><tr><th>#</th><th>Équipe</th><th>J</th><th>Pts</th><th>Diff</th></tr></thead>
            <tbody>${groupTable}</tbody>
          </table>
        </div>
        <div>
          <h3>Matchs</h3>
          <div class="match-list">${matches}</div>
        </div>
      </div>
      <div class="actions">
        ${
          t.canContinue
            ? `<button class="btn btn-primary" id="tournament-next">${t.nextLabel}</button>`
            : `<button class="btn btn-primary" id="see-result">Voir le bilan</button>`
        }
      </div>
    </section>
  `;
}

function renderResult() {
  const t = state.tournament;
  const won = t.champion?.isUser;

  return `
    <section class="panel hero-panel ${won ? "is-win" : ""}">
      <div class="hero-badge">26</div>
      <h2>${won ? "Champions du monde !" : "Éliminé"}</h2>
      <p class="lede">${t.champion?.name ?? "—"} remporte la CDM 2026</p>
      <p class="copy">
        Groupe ${state.groupKey} · Moyenne ${ratingOvr(squadStrength(currentSquad()))} OVR
      </p>
      <div class="squad-recap">
        ${currentSquad()
          .filter(Boolean)
          .map(
            (player) =>
              `<span class="chip">${player.name} · ${ratingOvr(player.rating)}</span>`,
          )
          .join("")}
      </div>
      <div class="actions">
        <button class="btn btn-primary" id="play-again">Rejouer</button>
        <a class="btn btn-ghost" href="/">Accueil</a>
      </div>
    </section>
  `;
}

function bindSetup() {
  if (!state.formation) {
    state.formation = formationById("4-3-3");
  }

  if (!state.gameMode) {
    state.gameMode = "classic";
  }

  $$("[data-formation]").forEach((pill) => {
    pill.classList.toggle("is-selected", pill.dataset.formation === state.formation.id);
    pill.setAttribute(
      "aria-pressed",
      pill.dataset.formation === state.formation.id ? "true" : "false",
    );

    pill.addEventListener("click", () => {
      if (pill.dataset.formation === state.formation?.id) {
        return;
      }

      state.formation = formationById(pill.dataset.formation);

      $$("[data-formation]").forEach((entry) => {
        entry.classList.toggle("is-selected", entry.dataset.formation === state.formation.id);
        entry.setAttribute(
          "aria-pressed",
          entry.dataset.formation === state.formation.id ? "true" : "false",
        );
      });

      updateSetupPitch(state.formation);
    });
  });

  $$("[data-mode]").forEach((pill) => {
    pill.classList.toggle("is-selected", pill.dataset.mode === state.gameMode);
    pill.setAttribute(
      "aria-pressed",
      pill.dataset.mode === state.gameMode ? "true" : "false",
    );

    pill.addEventListener("click", () => {
      if (pill.dataset.mode === state.gameMode) {
        return;
      }

      state.gameMode = pill.dataset.mode;

      $$("[data-mode]").forEach((entry) => {
        entry.classList.toggle("is-selected", entry.dataset.mode === state.gameMode);
        entry.setAttribute(
          "aria-pressed",
          entry.dataset.mode === state.gameMode ? "true" : "false",
        );
      });

      const summary = $("#setup-mode-summary");
      if (summary) {
        summary.textContent = `${gameModeLabel(state.gameMode)} · 11 nations`;
      }
    });
  });

  $("#squad-name")?.addEventListener("input", (event) => {
    state.squadName = event.target.value.trim() || "Mon équipe";
  });

  $("#back-home")?.addEventListener("click", () => {
    state.phase = "home";
    render();
  });

  $("#start-draft")?.addEventListener("click", () => {
    startDraft();
  });

  requestAnimationFrame(syncDraftRowHeight);
}

function startDraft() {
  state.phase = "draft";
  state.assignments = {};
  state.pickIndex = 0;
  state.rollsLeft = 3;
  state.selectedPlayer = null;
  state.draftNations = drawUniqueNations(state.data.nations, 11);
  render();
}

function bindDraft() {
  const playerList = $("#draft-player-list");
  const pitch = $("#draft-pitch");

  bindScrollFades();
  bindDraftRowHeightSync();
  requestAnimationFrame(syncDraftRowHeight);

  $("#draft-roll")?.addEventListener("click", () => {
    if (state.rollsLeft <= 0) {
      return;
    }

    const nextNation = rollDraftNation(
      state.draftNations,
      state.data.nations,
      state.pickIndex,
    );

    if (!nextNation) {
      return;
    }

    state.draftNations[state.pickIndex] = nextNation;
    state.rollsLeft -= 1;
    state.selectedPlayer = null;
    updateDraftPickHeader();
    updateDraftSelectionUI();
  });

  playerList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pick]");

    if (!button || button.disabled) {
      return;
    }

    const nation = state.draftNations[state.pickIndex];
    const player = teamRoster(nation)
      .map((entry) => ({ ...entry, teamName: nation, nation }))
      .find((entry) => String(entry.api_id) === button.dataset.pick);

    if (!player) {
      return;
    }

    if (
      state.selectedPlayer &&
      String(state.selectedPlayer.api_id) === button.dataset.pick
    ) {
      state.selectedPlayer = null;
    } else {
      state.selectedPlayer = player;
    }

    state.lastPlacedSlot = null;
    updateDraftSelectionUI();
  });

  pitch?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slot]");

    if (!button || button.disabled || !state.selectedPlayer) {
      return;
    }

    const slot = state.formation.slots.find(
      (entry) => entry.id === button.dataset.slot,
    );

    if (!slot || !canPlayRole(state.selectedPlayer, slot.role)) {
      return;
    }

    const placedPlayer = {
      ...state.selectedPlayer,
      nation: state.draftNations[state.pickIndex],
    };

    state.assignments[slot.id] = placedPlayer;
    state.lastPlacedSlot = slot.id;
    state.selectedPlayer = null;

    updateDraftSlotPlacement(slot.id, placedPlayer);
    updateDraftSquadRow(slot.id);
    updateDraftSquadMeta();
    state.pickIndex += 1;

    if (state.pickIndex >= 11) {
      startTournament();
      return;
    }

    updateDraftPickHeader({ resetRolls: true });
    updateDraftSelectionUI();
  });
}

function aiParticipant(teamName, formation, suffix = "") {
  const roster = teamRoster(teamName);
  const squad = buildAiSquad(roster, formation);
  return createParticipant(`${teamName}${suffix}`, teamName, squad);
}

function startTournament() {
  const group = pickRandomGroup(state.data.groups);
  state.groupKey = group.groupKey;
  state.replacedTeam = group.replacedTeam;

  const aiFormation = formationById(DEFAULT_AI_FORMATION_ID);
  const userSquad = currentSquad();
  const user = createParticipant("user", state.squadName, userSquad, true);

  const participants = group.teams.map((name, index) => {
    if (index === group.replaceIndex) {
      return user;
    }

    return aiParticipant(name, aiFormation);
  });

  const pairs = roundRobinPairs(participants.map((team) => team.id));
  const groupResults = [];
  const visibleMatches = [];

  for (const [homeId, awayId] of pairs) {
    const home = participants.find((team) => team.id === homeId);
    const away = participants.find((team) => team.id === awayId);
    const { goalsA, goalsB } = simulateMatch(home.profile, away.profile);

    groupResults.push({ homeId, awayId, goalsA, goalsB });
    visibleMatches.push({
      round: `Groupe ${group.groupKey}`,
      home: home.name,
      away: away.name,
      score: `${goalsA} - ${goalsB}`,
      highlight: home.isUser || away.isUser,
    });
  }

  const groupTable = groupStandings(participants, groupResults);
  const qualified = groupTable.slice(0, 2).map((row) => row.team);

  state.tournament = {
    step: "group",
    participants,
    groupTable,
    visibleMatches,
    qualified,
    knockoutRounds: [],
    roundIndex: 0,
    title: "Phase de groupes",
    subtitle: "Les 2 premiers se qualifient.",
    canContinue: true,
    nextLabel: "Simuler les 8es de finale",
    champion: null,
  };

  state.phase = "tournament";
  render();
}

function simulateOtherGroups() {
  const qualifiers = [...state.tournament.qualified];
  const aiFormation = formationById(DEFAULT_AI_FORMATION_ID);

  for (const [groupKey, teams] of Object.entries(state.data.groups)) {
    if (groupKey === state.groupKey) {
      continue;
    }

    const groupParticipants = teams.map((name) =>
      aiParticipant(name, aiFormation, `-${groupKey}`),
    );
    const results = roundRobinPairs(groupParticipants.map((team) => team.id)).map(
      ([homeId, awayId]) => {
        const home = groupParticipants.find((team) => team.id === homeId);
        const away = groupParticipants.find((team) => team.id === awayId);
        const { goalsA, goalsB } = simulateMatch(home.profile, away.profile);
        return { homeId, awayId, goalsA, goalsB };
      },
    );

    const table = groupStandings(groupParticipants, results);
    qualifiers.push(table[0].team, table[1].team);
  }

  return qualifiers.slice(0, 16);
}

function bindTournament() {
  $("#tournament-next")?.addEventListener("click", () => {
    const t = state.tournament;

    if (t.step === "group") {
      const bracket = buildKnockoutBracket(simulateOtherGroups());
      t.knockoutRounds = [bracket];
      t.roundIndex = 0;
      t.step = "knockout";
      playKnockoutRound(t);
      return;
    }

    if (t.step === "knockout") {
      if (t.roundIndex < t.knockoutRounds.length - 1) {
        t.roundIndex += 1;
        playKnockoutRound(t);
        return;
      }

      t.champion = t.knockoutRounds.at(-1)[0]?.winner ?? null;
      state.phase = "result";
      render();
    }
  });

  $("#see-result")?.addEventListener("click", () => {
    state.phase = "result";
    render();
  });
}

function playKnockoutRound(t) {
  const labels = ["8es de finale", "Quarts de finale", "Demi-finales", "Finale"];
  const label = labels[t.roundIndex] ?? "Tour suivant";
  const current = t.knockoutRounds[t.roundIndex];
  const getProfile = (team) => team?.profile ?? teamProfile(team?.squad ?? []);
  const next = simulateKnockoutRound(current, getProfile);

  t.visibleMatches = current.map((match) => ({
    round: label,
    home: match.home?.name ?? "—",
    away: match.away?.name ?? "—",
    score: match.score ?? "—",
    highlight: Boolean(match.home?.isUser || match.away?.isUser),
  }));

  if (next.length > 1) {
    t.knockoutRounds.push(next);
    t.title = label;
    t.subtitle = `${next.length * 2} équipes en lice`;
    t.nextLabel =
      next.length === 2
        ? "Voir la finale"
        : `Simuler ${labels[t.roundIndex + 1] ?? "la suite"}`;
    t.canContinue = true;
  } else {
    t.champion = current[0]?.winner ?? next[0]?.home ?? null;
    t.title = "Finale terminée";
    t.subtitle = `${t.champion?.name ?? "—"} est champion`;
    t.canContinue = false;
  }

  render();
}

function bindResult() {
  $("#play-again")?.addEventListener("click", () => {
    state.phase = "setup";
    state.assignments = {};
    state.pickIndex = 0;
    state.rollsLeft = 3;
    state.selectedPlayer = null;
    state.tournament = null;
    state.groupKey = null;
    state.replacedTeam = null;
    render();
  });
}

async function init() {
  try {
    await bootstrap();
    render();
  } catch (error) {
    $("#app").innerHTML = `
      <section class="panel">
        <h2>Erreur</h2>
        <p>${error.message}</p>
      </section>
    `;
  }
}

init();
