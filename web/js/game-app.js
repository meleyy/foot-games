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
  squadName: "Mon équipe",
  assignments: {},
  draftNations: [],
  pickIndex: 0,
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
  app.classList.remove("is-ready");
  app.classList.add("is-changing");

  switch (state.phase) {
    case "home":
      app.innerHTML = renderHome();
      $("#start-btn")?.addEventListener("click", () => {
        state.phase = "setup";
        state.formation = formationById("4-3-3");
        render();
      });
      break;
    case "setup":
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

function renderHome() {
  return `
    <section class="panel hero-panel">
      <div class="hero-badge">26</div>
      <h1>Foot Games</h1>
      <p class="lede">Mode solo · Draft CDM 2026</p>
      <p class="copy">
        11 pays tirés au hasard, 11 joueurs à choisir.
        Compose ton 11 selon ta formation, puis simule la Coupe du Monde.
      </p>
      <div class="actions">
        <button class="btn btn-primary" id="start-btn">Jouer en solo</button>
        <a class="btn btn-ghost" href="/">Voir les données</a>
      </div>
    </section>
  `;
}

function renderSetup() {
  const formations = FORMATIONS.map(
    (formation, index) => `
      <button
        type="button"
        class="formation-pill anim-stagger"
        style="animation-delay:${index * 0.05}s"
        data-formation="${formation.id}"
        ${state.formation?.id === formation.id ? 'aria-pressed="true"' : ""}
      >
        <span class="formation-title">${formation.label}</span>
      </button>
    `,
  ).join("");

  return `
    <section class="panel setup-panel">
      <header class="panel-head">
        <span class="step">01</span>
        <div>
          <h2>Formation</h2>
          <p>Choisis ton système de jeu. Le groupe CDM sera tiré au hasard.</p>
        </div>
      </header>
      <div class="setup-layout">
        <div class="setup-side">
          <label class="field">
            <span>Nom de l'équipe</span>
            <input id="squad-name" value="${state.squadName}" maxlength="24" />
          </label>
          <div class="formation-picker">
            <span class="field-label">Système</span>
            <div class="formation-list">${formations}</div>
          </div>
          <div class="actions setup-actions">
            <button class="btn btn-ghost" id="back-home">Retour</button>
            <button class="btn btn-primary" id="start-draft">Lancer le draft</button>
          </div>
        </div>
        <div class="setup-pitch-wrap draft-center anim-fade">
          <h3 class="center-title" id="setup-formation-label">${state.formation?.label ?? "4-3-3"}</h3>
          <div class="pitch pitch-11 pitch-preview" id="setup-pitch">
            ${renderPreviewSlots(state.formation, { animate: true })}
          </div>
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
          <span class="slot-role">${slot.label}</span>
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
          <span class="slot-role">${slot.label}</span>
          ${
            player
              ? `<strong class="slot-player">${player.name.split(" ").at(-1)}</strong><span class="slot-ovr">${ratingOvr(player.rating)}</span>`
              : `<span class="slot-empty">+</span>`
          }
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
  button.innerHTML = `
    <span class="slot-role">${slot.label}</span>
    <strong class="slot-player">${player.name.split(" ").at(-1)}</strong>
    <span class="slot-ovr">${ratingOvr(player.rating)}</span>
  `;

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

const PITCH_ASPECT = 1265 / 736;

function measureDraftRowHeight(columns, pitchZone, playersHead) {
  const pitchStyle = getComputedStyle(pitchZone);
  const padX = parseFloat(pitchStyle.paddingLeft) + parseFloat(pitchStyle.paddingRight);
  const padY = parseFloat(pitchStyle.paddingTop) + parseFloat(pitchStyle.paddingBottom);
  const columnsStyle = getComputedStyle(columns);
  const rowGap = parseFloat(columnsStyle.rowGap) || 0;
  const headHeight = playersHead.offsetHeight;

  const draftBoard = columns.closest(".draft-board");
  const siteHeader = document.querySelector(".site-header");
  const headerBottom = siteHeader?.getBoundingClientRect().bottom ?? 0;
  const boardStyle = draftBoard ? getComputedStyle(draftBoard) : null;
  const boardGap = boardStyle ? parseFloat(boardStyle.gap) || 0 : 0;
  const draftTop = draftBoard?.querySelector(".draft-top");
  const draftTopHeight = draftTop?.offsetHeight ?? 0;
  const columnsMaxHeight = Math.max(
    220,
    Math.floor(window.innerHeight - headerBottom - draftTopHeight - boardGap - 8),
  );

  columns.style.setProperty("--draft-columns-max-height", `${columnsMaxHeight}px`);
  columns.style.maxHeight = `${columnsMaxHeight}px`;

  const contentWidth = Math.max(0, pitchZone.clientWidth - padX);
  const widthBasedPitchHeight = contentWidth * PITCH_ASPECT + padY;
  const pitchCardHeight = Math.min(widthBasedPitchHeight, columnsMaxHeight);
  const innerWidth = Math.max(0, (pitchCardHeight - padY) / PITCH_ASPECT);

  if (widthBasedPitchHeight > pitchCardHeight + 1) {
    pitchZone.style.setProperty("--draft-pitch-inner-width", `${innerWidth}px`);
  } else {
    pitchZone.style.removeProperty("--draft-pitch-inner-width");
  }

  columns.style.setProperty("--draft-pitch-height", `${Math.round(pitchCardHeight)}px`);
  columns.style.setProperty("--draft-block-height", `${Math.round(pitchCardHeight)}px`);

  return Math.max(0, Math.round(pitchCardHeight - headHeight - rowGap));
}

function syncDraftRowHeight() {
  const pitchZone = $(".draft-zone-pitch");
  const playersHead = $(".draft-zone-players-head");
  const columns = $(".draft-columns");

  if (!pitchZone || !playersHead || !columns) {
    return;
  }

  const height = measureDraftRowHeight(columns, pitchZone, playersHead);

  if (height > 0) {
    columns.style.setProperty("--draft-row-height", `${height}px`);
  }

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

  if (!pitchZone || !playersHead) {
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

function updateDraftPickHeader() {
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
                <span class="slot-role">${slot.label}</span>
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
              <span class="slot-role">${slot.label}</span>
              ${
                player
                  ? `<strong class="slot-player">${player.name.split(" ").at(-1)}</strong><span class="slot-ovr">${ratingOvr(player.rating)}</span>`
                  : `<span class="slot-empty">+</span>`
              }
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
            <span class="nation-label" id="draft-nation-label">Pays ${progress}</span>
            <strong id="draft-nation-name">${nation ?? "—"}</strong>
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
        <a class="btn btn-ghost" href="/game.html">Accueil jeu</a>
      </div>
    </section>
  `;
}

function bindSetup() {
  if (!state.formation) {
    state.formation = formationById("4-3-3");
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
}

function startDraft() {
  state.phase = "draft";
  state.assignments = {};
  state.pickIndex = 0;
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

    updateDraftPickHeader();
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
