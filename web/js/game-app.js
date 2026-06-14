import {
  DEFAULT_AI_FORMATION_ID,
  FORMATIONS,
  buildAiSquad,
  buildKnockoutBracket,
  qualifyWorldCupKnockout,
  canPlacePlayer,
  canPlayRole,
  comparePlayersByShirtNumber,
  drawUniqueNations,
  draftNationPool,
  groupStandings,
  pickRandom,
  pickRandomGroup,
  ratingOvr,
  rollDraftNation,
  rosterPositionLabels,
  roundRobinPairs,
  simulateGroupMatch,
  simulateKnockoutMatch,
  formatKnockoutScore,
  simulateMatch,
  sortPlayersByRole,
  squadBySlot,
  squadStrength,
  teamProfile,
} from "./game-engine.js";
import { nationFlagUrl } from "./nation-flags.js";
import { OnlineClient, fetchActiveOnlineMatch } from "./online-client.js";
import { ONLINE_DRAFT_SECONDS } from "./supabase-config.js";

const ONLINE_NAME_KEY = "foot-games-online-name";
const ONLINE_FORMATION_KEY = "foot-games-online-formation";

const state = {
  data: null,
  phase: "home",
  playMode: "solo",
  formation: null,
  gameMode: "classic",
  squadName: "My Team",
  assignments: {},
  draftNations: [],
  pickIndex: 0,
  rollsLeft: 3,
  selectedPlayer: null,
  groupKey: null,
  replacedTeam: null,
  tournament: null,
  lastPlacedSlot: null,
  draftComplete: false,
  selectedSlotId: null,
  nationRolling: false,
  onlineClient: null,
  onlineMatch: null,
  onlineError: null,
  onlineDraftDeadline: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let nationRollToken = 0;

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nationFlagMarkup(nation) {
  const url = nationFlagUrl(nation);

  if (!url) {
    return '<img class="nation-flag" id="draft-nation-flag" alt="" hidden />';
  }

  return `<img class="nation-flag" id="draft-nation-flag" src="${url}" alt="${nation}" loading="lazy" />`;
}

function setNationDisplay(nation, { complete = false } = {}) {
  const flag = $("#draft-nation-flag");
  const name = $("#draft-nation-name");
  const url = nationFlagUrl(nation);

  if (name) {
    name.textContent = complete ? "Complete" : (nation ?? "—");
  }

  if (!flag) {
    return;
  }

  if (complete || !url) {
    flag.hidden = true;
    flag.removeAttribute("src");
    flag.alt = "";
    return;
  }

  flag.src = url;
  flag.alt = nation ?? "";
  flag.hidden = false;
}

function buildNationRollSequence(pool, finalNation, { minSteps = 14, maxSteps = 20 } = {}) {
  const source = pool.length ? pool : [finalNation];
  const steps = minSteps + Math.floor(Math.random() * (maxSteps - minSteps + 1));
  const sequence = [];
  let last = null;

  for (let index = 0; index < steps - 1; index += 1) {
    let candidate = pickRandom(source);
    let attempts = 0;

    while (candidate === last && source.length > 1 && attempts < 8) {
      candidate = pickRandom(source);
      attempts += 1;
    }

    sequence.push(candidate);
    last = candidate;
  }

  sequence.push(finalNation);
  return sequence;
}

function buildRollDelays(stepCount) {
  const transitions = Math.max(stepCount - 1, 1);
  const delays = [];

  for (let index = 0; index < transitions; index += 1) {
    const progress = index / (transitions - 1 || 1);
    const eased = progress * progress;
    delays.push(36 + eased * 240);
  }

  return delays;
}

function setNationRolling(active) {
  state.nationRolling = active;
  $("#draft-nation-display")?.classList.toggle("is-rolling", active);
  $("#draft-nation-banner")?.classList.toggle("is-rolling", active);
  $("#draft-player-list")?.classList.toggle("is-locked", active);
  updateRollUI();
}

async function playNationRoll(sequence, { onDone } = {}) {
  const finalNation = sequence[sequence.length - 1];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!sequence.length || !finalNation) {
    onDone?.();
    return;
  }

  if (reduceMotion || sequence.length === 1) {
    setNationDisplay(finalNation);
    onDone?.();
    return;
  }

  const token = ++nationRollToken;
  const delays = buildRollDelays(sequence.length);

  setNationRolling(true);

  for (let index = 0; index < sequence.length; index += 1) {
    if (token !== nationRollToken) {
      return;
    }

    setNationDisplay(sequence[index]);

    if (index < sequence.length - 1) {
      await sleep(delays[index]);
    }
  }

  if (token !== nationRollToken) {
    return;
  }

  setNationRolling(false);
  $("#draft-nation-display")?.classList.remove("is-landed");
  void $("#draft-nation-display")?.offsetWidth;
  $("#draft-nation-display")?.classList.add("is-landed");
  onDone?.();
}

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
        lastError = new Error("No players in database.");
        continue;
      }

      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    (lastError instanceof Error ? lastError.message : "Network unavailable") +
      ". Run `npm run dev` then open the URL shown in the terminal.",
  );
}

function isOnlineMode() {
  return state.playMode === "online";
}

function loadOnlineDisplayName() {
  return localStorage.getItem(ONLINE_NAME_KEY)?.trim() || "Mon équipe";
}

function saveOnlineDisplayName(name) {
  const trimmed = name.trim() || "Mon équipe";
  localStorage.setItem(ONLINE_NAME_KEY, trimmed);
  return trimmed;
}

function loadOnlineFormationId() {
  return localStorage.getItem(ONLINE_FORMATION_KEY) || "4-3-3";
}

function saveOnlineFormationId(formationId) {
  localStorage.setItem(ONLINE_FORMATION_KEY, formationId);
}

function onlineDraftTimerLabel() {
  const minutes = String(Math.floor(ONLINE_DRAFT_SECONDS / 60)).padStart(2, "0");
  const seconds = String(ONLINE_DRAFT_SECONDS % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatOnlineScore(result, isPlayerA) {
  if (!result) {
    return "0–0";
  }

  const youGoals = isPlayerA ? result.homeGoals ?? 0 : result.awayGoals ?? 0;
  const oppGoals = isPlayerA ? result.awayGoals ?? 0 : result.homeGoals ?? 0;

  if (!result.penalties) {
    return `${youGoals}–${oppGoals}`;
  }

  const youPen = isPlayerA ? result.penalties.scoreA : result.penalties.scoreB;
  const oppPen = isPlayerA ? result.penalties.scoreB : result.penalties.scoreA;

  return `${youGoals}–${oppGoals} (${youPen}–${oppPen} t.a.b.)`;
}

function squadAverageFromAssignments(assignments) {
  const players = Object.values(assignments ?? {}).filter(Boolean);

  if (!players.length) {
    return null;
  }

  return squadStrength(players);
}

function renderFormationPills({ selectedId, buttonClass = "formation-pill" } = {}) {
  return FORMATIONS.map(
    (formation) => `
      <button
        type="button"
        class="option-pill ${buttonClass}"
        data-formation="${formation.id}"
        ${selectedId === formation.id ? 'aria-pressed="true"' : ""}
      >
        <span class="option-pill-label">${formation.label}</span>
      </button>
    `,
  ).join("");
}

function renderOnlineSquadRecap(assignments, formationId, title) {
  if (!assignments || !Object.keys(assignments).length) {
    return "";
  }

  const formation = formationById(formationId);
  const avg = squadAverageFromAssignments(assignments);

  const rows = formation.slots
    .map((slot) => {
      const player = assignments[slot.id];

      if (!player) {
        return "";
      }

      return `
        <li class="online-squad-row">
          <span class="online-squad-pos">${slot.label}</span>
          <span class="online-squad-player">${player.name}</span>
          <span class="online-squad-ovr">${ratingOvr(player.rating)}</span>
        </li>
      `;
    })
    .join("");

  return `
    <article class="online-squad-recap">
      <h3 class="online-squad-title">${title}${avg ? ` · OVR ${ratingOvr(avg)}` : ""}</h3>
      <ol class="online-squad-list">${rows}</ol>
    </article>
  `;
}

let onlineDraftTimerId = null;
let onlineDraftSaveTimerId = null;

function clearOnlineDraftTimer() {
  if (onlineDraftTimerId) {
    clearInterval(onlineDraftTimerId);
    onlineDraftTimerId = null;
  }
}

function clearOnlineDraftSaveTimer() {
  if (onlineDraftSaveTimerId) {
    clearTimeout(onlineDraftSaveTimerId);
    onlineDraftSaveTimerId = null;
  }
}

function onlineDraftStatePayload() {
  return {
    formationId: state.formation?.id ?? "4-3-3",
    assignments: state.assignments,
    draftNations: state.draftNations,
    pickIndex: state.pickIndex,
    rollsLeft: state.rollsLeft,
  };
}

function scheduleOnlineDraftSave() {
  if (!isOnlineMode() || state.phase !== "draft") {
    return;
  }

  const client = onlineClient();
  const match = state.onlineMatch;

  if (!client || !match || match.status !== "draft" || client.youSubmitted(match)) {
    return;
  }

  clearOnlineDraftSaveTimer();
  onlineDraftSaveTimerId = window.setTimeout(() => {
    void saveOnlineDraftProgress();
  }, 800);
}

async function saveOnlineDraftProgress() {
  const client = onlineClient();
  const match = state.onlineMatch;

  if (!client || !match?.id || match.status !== "draft" || client.youSubmitted(match)) {
    return;
  }

  try {
    await client.saveDraftProgress({
      matchId: match.id,
      formationId: state.formation?.id ?? "4-3-3",
      draftState: onlineDraftStatePayload(),
    });
  } catch {
    // Best-effort sync; realtime will still drive match state.
  }
}

function onlineClient() {
  return state.onlineClient;
}

function onlineOpponentName() {
  const client = onlineClient();
  const match = state.onlineMatch;
  return client && match ? client.opponentName(match) : "Adversaire";
}

function ensureOnlineClient() {
  if (state.onlineClient) {
    return state.onlineClient;
  }

  state.onlineClient = new OnlineClient({
    onMatchUpdate: (match) => {
      state.onlineMatch = match;
      state.onlineError = null;
      applyOnlineMatchState(match);
    },
    onError: (message) => {
      state.onlineError = message;
      if (state.phase === "online-queue") {
        render();
      }
    },
  });

  return state.onlineClient;
}

function applyOnlineMatchState(match) {
  if (!isOnlineMode() || !match) {
    return;
  }

  if (match.status === "abandoned" || match.status === "cancelled") {
    clearOnlineDraftTimer();
    state.onlineError = "Match abandonné (temps écoulé sans équipe valide).";
    void resetOnlineSession().then(() => {
      state.phase = "home";
      render();
    });
    return;
  }

  if (match.status === "draft") {
    const client = onlineClient();
    state.squadName = client?.youName(match) ?? state.squadName;
    const formationId = client?.isPlayerA(match)
      ? match.player_a_formation ?? match.player_a_draft_state?.formationId
      : match.player_b_formation ?? match.player_b_draft_state?.formationId;
    state.formation = formationById(
      formationId ?? state.formation?.id ?? loadOnlineFormationId(),
    );
    state.onlineDraftDeadline = match.draft_ends_at;

    if (client?.youSubmitted(match)) {
      if (state.phase !== "online-waiting") {
        state.phase = "online-waiting";
      }
      render();
      return;
    }

    if (state.phase === "online-queue" || state.phase !== "draft") {
      startOnlineDraft();
      return;
    }

    if (state.phase === "online-waiting") {
      startOnlineDraft();
      return;
    }

    if (state.phase === "draft") {
      syncOnlineDraftTimer();
      const hint = $("#draft-hint");
      if (hint && isOnlineMode()) {
        hint.innerHTML = onlineDraftHeaderHint();
      }
      return;
    }

    return;
  }

  if (match.status === "resolving") {
    if (state.phase !== "online-waiting") {
      state.phase = "online-waiting";
    }
    render();
    void ensureOnlineClient().resolveMatch(match.id);
    return;
  }

  if (match.status === "result" && match.result) {
    clearOnlineDraftTimer();
    state.phase = "online-result";
    render();
  }
}

function syncOnlineDraftTimer() {
  const label = $("#online-draft-timer");

  if (!label || !state.onlineDraftDeadline) {
    return;
  }

  const remainingMs = new Date(state.onlineDraftDeadline).getTime() - Date.now();
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const seconds = String(remainingSec % 60).padStart(2, "0");
  label.textContent = `${minutes}:${seconds}`;

  if (remainingSec <= 0 && !onlineClient()?.youSubmitted(state.onlineMatch)) {
    void expireOnlineDraft();
  }
}

async function expireOnlineDraft() {
  const client = onlineClient();
  const match = state.onlineMatch;

  if (!client || !match?.id || client.youSubmitted(match)) {
    return;
  }

  clearOnlineDraftTimer();
  await saveOnlineDraftProgress();

  try {
    await client.checkDraftExpiry(match.id);
  } catch (error) {
    state.onlineError = error instanceof Error ? error.message : "Expiration du draft impossible.";
    render();
  }
}

function startOnlineDraftTimer() {
  clearOnlineDraftTimer();
  syncOnlineDraftTimer();
  onlineDraftTimerId = window.setInterval(syncOnlineDraftTimer, 1000);
}

function startOnlineDraft() {
  const client = onlineClient();
  const match = state.onlineMatch;
  const draftState = client?.yourDraftState(match);

  state.phase = "draft";
  state.selectedPlayer = null;
  state.selectedSlotId = null;
  state.draftComplete = false;

  if (draftState?.draftNations?.length === 11) {
    state.draftNations = draftState.draftNations;
    state.assignments = draftState.assignments ?? {};
    state.pickIndex = Number.isFinite(draftState.pickIndex)
      ? draftState.pickIndex
      : filledCount();
    state.rollsLeft = Number.isFinite(draftState.rollsLeft) ? draftState.rollsLeft : 3;
  } else {
    state.assignments = {};
    state.pickIndex = 0;
    state.rollsLeft = 3;
    state.draftNations = drawUniqueNations(state.data.nations, 11);
  }

  render();
  startOnlineDraftTimer();

  if (filledCount() >= 11) {
    enterDraftReview();
    return;
  }

  const nation = state.draftNations[state.pickIndex];
  if (nation) {
    void revealDraftNation(nation, { resetRolls: state.pickIndex === 0 });
  }

  void saveOnlineDraftProgress();
}

async function submitOnlineDraft() {
  const client = ensureOnlineClient();
  const match = state.onlineMatch;

  if (!match?.id || filledCount() < 11) {
    return;
  }

  clearOnlineDraftTimer();
  clearOnlineDraftSaveTimer();
  await saveOnlineDraftProgress();

  try {
    await client.submitDraft({
      matchId: match.id,
      formationId: state.formation?.id ?? "4-3-3",
      assignments: state.assignments,
    });
    state.phase = "online-waiting";
    render();
  } catch (error) {
    state.onlineError = error instanceof Error ? error.message : "Envoi impossible.";
    render();
  }
}

async function resetOnlineSession() {
  clearOnlineDraftTimer();
  clearOnlineDraftSaveTimer();
  const client = state.onlineClient;
  state.onlineClient = null;
  state.onlineMatch = null;
  state.onlineError = null;
  state.onlineDraftDeadline = null;
  state.playMode = "solo";

  if (client) {
    await client.disconnect();
  }
}

async function tryResumeOnlineMatch() {
  try {
    const active = await fetchActiveOnlineMatch();

    if (!active?.matchId) {
      return;
    }

    state.playMode = "online";
    state.onlineError = null;
    const client = ensureOnlineClient();
    await client.watchMatch(active.matchId);
  } catch {
    // Ignore resume errors on the landing page.
  }
}

async function enterOnlineQueue() {
  await resetOnlineSession();
  state.playMode = "online";
  state.squadName = saveOnlineDisplayName(state.squadName);
  saveOnlineFormationId(state.formation?.id ?? "4-3-3");
  state.phase = "online-queue";
  state.onlineError = null;
  render();

  try {
    const client = ensureOnlineClient();
    const outcome = await client.joinQueue(state.squadName);

    if (outcome.status === "matched" && outcome.matchId) {
      await client.watchMatch(outcome.matchId);
    }
  } catch (error) {
    state.onlineError = error instanceof Error ? error.message : "Connexion impossible.";
    render();
  }
}

function formationById(id) {
  return FORMATIONS.find((formation) => formation.id === id) ?? FORMATIONS[0];
}

const GAME_MODES = [
  { id: "classic", label: "Classic" },
  { id: "memory", label: "From memory" },
];

function gameModeById(id) {
  return GAME_MODES.find((mode) => mode.id === id) ?? GAME_MODES[0];
}

function gameModeLabel(id) {
  return gameModeById(id).label;
}

function isMemoryMode() {
  return state.gameMode === "memory";
}

function displayRating(rating) {
  return isMemoryMode() ? "?" : ratingOvr(rating);
}

function displayAvgRating(avg, filled = true) {
  if (!filled) {
    return "—";
  }

  return isMemoryMode() ? "?" : ratingOvr(avg);
}

function sortRosterPlayers(players) {
  return sortPlayersByRole(players, (left, right) => {
    const numberDiff = comparePlayersByShirtNumber(left, right);

    if (numberDiff !== 0) {
      return numberDiff;
    }

    return left.name.localeCompare(right.name, "en");
  });
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

function syncChromeHeight() {
  const siteHeader = document.querySelector(".site-header");
  const app = $("#app");

  if (siteHeader && app) {
    app.style.setProperty("--draft-chrome-height", `${Math.ceil(siteHeader.offsetHeight)}px`);
  }
}

function render() {
  const app = $("#app");
  app.dataset.phase = state.phase;
  document.body.classList.toggle("is-home", state.phase === "home");

  if (["setup", "draft", "tournament"].includes(state.phase)) {
    syncChromeHeight();
  }

  switch (state.phase) {
    case "home":
      if (!$(".landing")) {
        app.innerHTML = renderHome();
      }
      bindHome();
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
    case "online-setup":
      app.innerHTML = renderOnlineSetup();
      bindOnlineSetup();
      break;
    case "online-queue":
      app.innerHTML = renderOnlineQueue();
      bindOnlineQueue();
      break;
    case "online-waiting":
      app.innerHTML = renderOnlineWaiting();
      bindOnlineWaiting();
      break;
    case "online-result":
      app.innerHTML = renderOnlineResult();
      bindOnlineResult();
      break;
    default:
      app.innerHTML = renderHome();
      bindHome();
  }
}

function landingStatsLine() {
  if (!state.data) {
    return "48 teams · 11 players · World Cup 2026 Draft";
  }

  const nations = state.data.nations?.length ?? 0;
  const teams = state.data.teams?.length ?? 0;
  const players = state.data.teams?.reduce(
    (total, team) => total + (team.players?.length ?? 0),
    0,
  );

  return `${nations} teams · ${teams} squads · ${players.toLocaleString("en-US")} players`;
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

function playerShirtNumber(player) {
  const number = Number(player?.shirt_number);
  return Number.isFinite(number) ? number : null;
}

function formatPlayerShirtNumber(player) {
  const number = playerShirtNumber(player);
  return number == null ? "—" : String(number);
}

function pitchSlotInnerHTML(slot, { player = null, preview = false } = {}) {
  if (player) {
    const number = playerShirtNumber(player) ?? "?";
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
    .map((slot) => {
      const player = assignments[slot.id];

      return `
        <div
          class="pitch-slot pitch-slot-preview pitch-slot-demo role-${slot.role} is-filled"
          style="left:${slot.x}%;top:${slot.y}%"
        >
          ${pitchSlotInnerHTML(slot, { player })}
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
        <div class="landing-hero-copy">
          <div class="landing-display" aria-hidden="true">
            <span class="landing-display-num">11</span>
          </div>
          <h1 class="landing-title">
            Roll the dice.<br />
            Build your dream<br />
            eleven.
          </h1>
          <p class="landing-lede">
            Draw 11 nations, draft 11 players.
            3 rerolls per round. Pick your formation, then simulate the World Cup through to the final.
          </p>
          <div class="landing-cta">
            <button class="btn btn-primary" id="start-btn">Play solo →</button>
            <button class="btn btn-ghost landing-cta-secondary" type="button" id="online-btn">
              Jouer en ligne 1v1 →
            </button>
          </div>
        </div>
        <div class="landing-hero-visual">
          <div class="panel landing-pitch-card">
            <p class="landing-pitch-label">${formation.label}</p>
            <div class="pitch pitch-11 pitch-preview landing-pitch" id="landing-pitch">
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
          <h2 class="landing-step-title">Draft</h2>
          <p class="landing-step-copy">One nation per round · 3 rerolls</p>
        </article>
        <article class="landing-step">
          <div class="landing-step-head">
            <span class="landing-step-num">02</span>
            <span class="landing-step-icon" aria-hidden="true"></span>
          </div>
          <h2 class="landing-step-title">Build</h2>
          <p class="landing-step-copy">Pick one player per nation · Any formation</p>
        </article>
        <article class="landing-step">
          <div class="landing-step-head">
            <span class="landing-step-num">03</span>
            <span class="landing-step-icon" aria-hidden="true"></span>
          </div>
          <h2 class="landing-step-title">Simulate</h2>
          <p class="landing-step-copy">Group stage then knockout bracket</p>
        </article>
      </div>

      <p class="landing-stats" id="landing-stats">${landingStatsLine()}</p>
    </section>
  `;
}

function refreshLandingStats() {
  if (state.phase !== "home") {
    return;
  }

  const stats = $("#landing-stats");

  if (stats) {
    const next = landingStatsLine();
    if (stats.textContent !== next) {
      stats.textContent = next;
    }
  }
}

function bindHome() {
  const startBtn = $("#start-btn");
  const onlineBtn = $("#online-btn");

  if (startBtn && startBtn.dataset.bound !== "true") {
    startBtn.dataset.bound = "true";
    startBtn.addEventListener("click", () => {
      void resetOnlineSession().then(() => {
        state.phase = "setup";
        state.formation = formationById("4-3-3");
        state.gameMode = "classic";
        render();
      });
    });
  }

  if (onlineBtn && onlineBtn.dataset.bound !== "true") {
    onlineBtn.dataset.bound = "true";
    onlineBtn.addEventListener("click", () => {
      void enterOnlineSetup();
    });
  }
}

async function enterOnlineSetup() {
  await resetOnlineSession();
  state.playMode = "online";
  state.phase = "online-setup";
  state.squadName = loadOnlineDisplayName();
  state.formation = formationById(loadOnlineFormationId());
  state.onlineError = null;
  render();
}

function renderOnlineSetup() {
  const draftMinutes = Math.floor(ONLINE_DRAFT_SECONDS / 60);

  return `
    <section class="draft-board setup-board online-setup-board">
      <header class="draft-top">
        <div class="draft-top-head">
          <span class="step">1v1</span>
          <h2 class="draft-top-label">Préparation en ligne</h2>
        </div>
        <p class="draft-hint">Choisis ton pseudo et ta formation avant la mise en file d'attente.</p>
      </header>
      <div class="draft-columns setup-columns">
        <div class="panel draft-zone draft-zone-setup-side">
          <label class="setup-team-field field">
            <span class="nation-label">Pseudo</span>
            <input
              id="online-squad-name"
              class="setup-team-input"
              value="${state.squadName}"
              maxlength="24"
              placeholder="Mon équipe"
            />
          </label>

          <div class="setup-options">
            <div class="setup-option-group">
              <span class="nation-label">Formation</span>
              <div class="formation-grid" id="online-setup-formation-list">
                ${renderFormationPills({ selectedId: state.formation?.id })}
              </div>
            </div>
            <p class="copy online-setup-note">
              Draft parallèle de ${draftMinutes} minutes · simulation serveur à la fin.
            </p>
            ${state.onlineError ? `<p class="online-error" role="alert">${state.onlineError}</p>` : ""}
            <div class="actions setup-actions">
              <button class="btn btn-ghost" type="button" id="online-setup-back">Accueil</button>
              <button class="btn btn-primary" type="button" id="online-start-queue">Lancer la recherche →</button>
            </div>
          </div>
        </div>

        <div class="panel draft-zone draft-zone-pitch">
          <div class="pitch pitch-11 pitch-preview" id="online-setup-pitch">
            ${renderPreviewSlots(state.formation)}
          </div>
        </div>

        <div class="panel draft-zone draft-zone-squad draft-zone-setup-summary">
          <header class="squad-head">
            <h3>${state.formation?.label ?? "4-3-3"}</h3>
          </header>
          <p class="squad-progress">Matchmaking automatique</p>
          <p class="copy setup-copy">Tu affronteras un adversaire aléatoire en file d'attente.</p>
        </div>
      </div>
    </section>
  `;
}

function bindOnlineSetup() {
  $("#online-squad-name")?.addEventListener("input", (event) => {
    state.squadName = event.target.value.trim() || "Mon équipe";
  });

  $$("#online-setup-formation-list [data-formation]").forEach((button) => {
    button.addEventListener("click", () => {
      state.formation = formationById(button.dataset.formation);
      render();
    });
  });

  $("#online-setup-back")?.addEventListener("click", () => {
    void resetOnlineSession().then(() => {
      state.phase = "home";
      render();
    });
  });

  $("#online-start-queue")?.addEventListener("click", () => {
    const input = $("#online-squad-name");
    state.squadName = saveOnlineDisplayName(input?.value ?? state.squadName);
    saveOnlineFormationId(state.formation?.id ?? "4-3-3");
    void enterOnlineQueue();
  });
}

function renderOnlineQueue() {
  const opponent = state.onlineMatch ? onlineOpponentName() : null;

  return `
    <section class="panel hero-panel online-waiting-panel">
      <div class="hero-badge">1v1</div>
      <h2>${opponent ? "Adversaire trouvé !" : "Recherche d'adversaire…"}</h2>
      <p class="lede">${opponent ? `Contre ${opponent}` : "Mise en file d'attente"}</p>
      <p class="copy">${opponent ? "Préparation du draft…" : "Un joueur aléatoire va te rejoindre."}</p>
      ${state.onlineError ? `<p class="online-error" role="alert">${state.onlineError}</p>` : ""}
      <div class="actions">
        <button class="btn btn-ghost" type="button" id="online-cancel-queue">Annuler</button>
      </div>
    </section>
  `;
}

function bindOnlineQueue() {
  $("#online-cancel-queue")?.addEventListener("click", () => {
    void resetOnlineSession().then(() => {
      state.phase = "home";
      render();
    });
  });
}

function renderOnlineWaiting() {
  const client = onlineClient();
  const match = state.onlineMatch;
  const opponent = onlineOpponentName();

  return `
    <section class="panel hero-panel online-waiting-panel">
      <h2>Équipe envoyée</h2>
      <p class="lede">En attente de ${opponent}…</p>
      <p class="copy">
        ${
          client?.opponentSubmitted(match)
            ? "Simulation du match en cours…"
            : "Ton adversaire termine encore son draft."
        }
      </p>
    </section>
  `;
}

function bindOnlineWaiting() {}

function renderOnlineResult() {
  const client = onlineClient();
  const match = state.onlineMatch;
  const result = match?.result;
  const playerId = client?.playerId;
  const isPlayerA = client?.isPlayerA(match);
  const won = result?.winnerId === playerId;
  const draw = !result?.winnerId && result?.reason !== "forfeit";
  const scoreLine = formatOnlineScore(result, isPlayerA);
  const forfeit = result?.reason === "forfeit";
  const abandoned = result?.reason === "abandoned";
  const showSquads = !abandoned && match?.player_a_assignments && match?.player_b_assignments;

  return `
    <section class="panel hero-panel online-result-panel ${won ? "is-win" : draw ? "" : "is-loss"}">
      <div class="hero-badge">1v1</div>
      <h2>${abandoned ? "Match annulé" : draw ? "Match nul" : won ? "Victoire !" : "Défaite"}</h2>
      <p class="lede online-scoreline">
        ${client?.youName(match) ?? state.squadName}
        <strong>${scoreLine}</strong>
        ${onlineOpponentName()}
      </p>
      ${
        forfeit
          ? `<p class="copy">${won ? "Victoire par forfait (adversaire absent ou équipe incomplète)." : "Défaite par forfait."}</p>`
          : abandoned
            ? `<p class="copy">Aucune équipe valide n'a été envoyée à temps.</p>`
            : result?.penalties
              ? `<p class="copy">Score après prolongation · tirs au but inclus.</p>`
              : ""
      }
      ${
        showSquads
          ? `<div class="online-result-squads">
              ${renderOnlineSquadRecap(match.player_a_assignments, match.player_a_formation, match.player_a_name)}
              ${renderOnlineSquadRecap(match.player_b_assignments, match.player_b_formation, match.player_b_name)}
            </div>`
          : ""
      }
      <div class="actions">
        <button class="btn btn-primary" id="online-play-again">Rejouer en ligne</button>
        <button class="btn btn-ghost" id="online-back-home-result">Accueil</button>
      </div>
    </section>
  `;
}

function bindOnlineResult() {
  $("#online-play-again")?.addEventListener("click", () => {
    void enterOnlineSetup();
  });

  $("#online-back-home-result")?.addEventListener("click", () => {
    void resetOnlineSession().then(() => {
      state.phase = "home";
      render();
    });
  });
}

function onlineDraftHeaderHint() {
  const client = onlineClient();
  const match = state.onlineMatch;
  const opponent = onlineOpponentName();
  const timer = onlineDraftTimerLabel();
  const opponentReady = client?.opponentSubmitted(match);
  const opponentStatus = opponentReady
    ? " · Adversaire prêt"
    : " · Adversaire en draft";

  if (state.draftComplete) {
    return `1v1 vs ${opponent} · Vérifie ton équipe puis envoie${opponentStatus}`;
  }

  return `1v1 vs ${opponent} · Temps restant <strong id="online-draft-timer">${timer}</strong>${opponentStatus}`;
}

function onlineDraftPlayerHint(complete) {
  if (complete) {
    return "Réorganise ton onze si besoin, puis envoie ton équipe.";
  }

  if (state.selectedPlayer) {
    return "Clique sur un poste compatible sur le terrain.";
  }

  return "Choisis un joueur dans la liste.";
}

function renderSetup() {
  const formations = FORMATIONS.map(
    (formation, index) => `
      <button
        type="button"
        class="option-pill formation-pill"
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
          <h2 class="draft-top-label">Formation · Setup</h2>
        </div>
        <p class="draft-hint">Choose your setup. Your World Cup group will be drawn at random.</p>
      </header>
      <div class="draft-columns setup-columns">
        <div class="panel draft-zone draft-zone-setup-side">
          <label class="setup-team-field field">
            <span class="nation-label">Team name</span>
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
            <div class="actions setup-actions">
              <button class="btn btn-ghost" id="back-home">Back</button>
              <button class="btn btn-primary" id="start-draft">Start draft</button>
            </div>
          </div>
        </div>

        <div class="panel draft-zone draft-zone-pitch">
          <div class="pitch pitch-11 pitch-preview" id="setup-pitch">
            ${renderPreviewSlots(state.formation)}
          </div>
        </div>

        <div class="panel draft-zone draft-zone-squad draft-zone-setup-summary">
          <header class="squad-head">
            <h3 id="setup-formation-label">${state.formation?.label ?? "4-3-3"}</h3>
          </header>
          <p class="squad-progress" id="setup-mode-summary">${gameModeLabel(state.gameMode)} · 11 nations</p>
          <p class="copy setup-copy">Confirm your formation to start the draft.</p>
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
            <span class="squad-number">—</span>
            <span class="squad-name">—</span>
            <span class="squad-ovr">—</span>
          </div>
        `;
      }

      return `
        <div class="squad-row anim-stagger ${slot.id === state.lastPlacedSlot ? "is-new" : ""}" style="animation-delay:${delay}s">
          <span class="squad-pos">${slot.label}</span>
          <span class="squad-number">${formatPlayerShirtNumber(player)}</span>
          <span class="squad-name">${player.name}</span>
          <span class="squad-ovr">${displayRating(player.rating)}</span>
        </div>
      `;
    })
    .join("");

  return `
    <aside class="panel squad-panel">
      <header class="squad-head">
        <h3>${state.squadName}</h3>
        <div class="avg-badge">
          <span>Average</span>
          <strong class="${state.lastPlacedSlot ? "is-bump" : ""}">${displayAvgRating(avg, filled > 0)}</strong>
        </div>
      </header>
      <p class="squad-progress">${filled} / 11 players</p>
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
  const review = state.draftComplete;

  return formation.slots
    .map((slot, index) => {
      const player = state.assignments[slot.id];
      const filled = player ? "is-filled" : "is-empty-slot";
      const anim = animate && !player ? "anim-slot" : "";
      const delay = animate && !player ? `animation-delay:${index * 0.04}s;` : "";
      const selected =
        review && state.selectedSlotId === slot.id ? "is-slot-selected" : "";

      return `
        <button
          type="button"
          class="pitch-slot role-${slot.role} ${anim} ${filled} ${selected}"
          style="left:${slot.x}%;top:${slot.y}%;${delay}"
          data-slot="${slot.id}"
          ${player && !review ? "disabled" : ""}
        >
          ${pitchSlotInnerHTML(slot, { player })}
        </button>
      `;
    })
    .join("");
}

function renderPlayerListHTML(nation, { animate = true } = {}) {
  const roster = nation
    ? sortRosterPlayers(
        teamRoster(nation).map((player) => ({ ...player, teamName: nation, nation })),
      )
    : [];
  const positionLabels = rosterPositionLabels(roster, state.formation);

  return roster
    .map((player, index) => {
      const canPlace = canPlacePlayer(player, state.formation, state.assignments);
      const selected =
        state.selectedPlayer?.api_id === player.api_id ? "is-selected" : "";
      const anim = animate ? "anim-stagger" : "";
      const delay = animate ? `style="animation-delay:${index * 0.03}s"` : "";
      const status = canPlace
        ? `<span class="ovr ovr-sm">${displayRating(player.rating)}</span>`
        : `<span class="player-row-status">Full</span>`;

      return `
        <button
          type="button"
          class="player-row ${anim} ${selected} ${canPlace ? "" : "is-disabled"}"
          ${delay}
          data-pick="${player.api_id}"
          ${canPlace ? "" : "disabled"}
          ${canPlace ? "" : 'title="No available slot for this position"'}
          aria-disabled="${canPlace ? "false" : "true"}"
        >
          <span class="player-row-number">${formatPlayerShirtNumber(player)}</span>
          <span class="player-row-name">${player.name}</span>
          <span class="player-row-pos">${positionLabels.get(player.api_id) ?? "?"}</span>
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
      button.title = "No available slot for this position";
    }

    const status = button.querySelector(".player-row-status, .ovr");

    if (status) {
      status.outerHTML = canPlace
        ? `<span class="ovr ovr-sm">${displayRating(player.rating)}</span>`
        : `<span class="player-row-status">Full</span>`;
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
    .map((slot) => {
      const player = state.assignments[slot.id];

      if (!player) {
        return `
          <div class="squad-row is-empty" data-squad-slot="${slot.id}">
            <span class="squad-pos">${slot.label}</span>
            <span class="squad-number">—</span>
            <span class="squad-name">—</span>
            <span class="squad-ovr">—</span>
          </div>
        `;
      }

      return `
        <div class="squad-row" data-squad-slot="${slot.id}">
          <span class="squad-pos">${slot.label}</span>
          <span class="squad-number">${formatPlayerShirtNumber(player)}</span>
          <span class="squad-name">${player.name}</span>
          <span class="squad-ovr">${displayRating(player.rating)}</span>
        </div>
      `;
    })
    .join("");
}

function updateDraftSelectionUI() {
  if (state.draftComplete) {
    updateDraftMoveUI();
    return;
  }

  const hint = $("#draft-hint");

  if (hint && isOnlineMode()) {
    hint.textContent = state.draftComplete
      ? "Réorganise ton onze si besoin, puis envoie ton équipe."
      : state.selectedSlotId
        ? "Choisis un autre poste compatible."
        : "Réorganise ton onze si besoin, puis envoie ton équipe.";
  } else if (hint && !isOnlineMode()) {
    hint.textContent = state.selectedPlayer
      ? "Click a compatible position on the pitch."
      : "Pick a player from the list.";
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

  button.disabled = Boolean(player && !state.draftComplete);
  button.classList.remove("is-compatible", "is-blocked", "is-slot-selected");

  if (!player) {
    button.classList.remove("is-filled", "is-just-placed");
    button.classList.add("is-empty-slot");
    button.innerHTML = pitchSlotInnerHTML(slot);
    return;
  }

  button.classList.remove("is-empty-slot");
  button.classList.add("is-filled", "is-just-placed");
  button.innerHTML = pitchSlotInnerHTML(slot, { player });

  window.setTimeout(() => button.classList.remove("is-just-placed"), 220);
}

function refreshDraftSquadRow(slotId) {
  const player = state.assignments[slotId];
  const slot = state.formation.slots.find((entry) => entry.id === slotId);
  const row = $(`#draft-squad-list [data-squad-slot="${slotId}"]`);

  if (!row || !slot) {
    return;
  }

  if (!player) {
    row.classList.add("is-empty");
    row.querySelector(".squad-number").textContent = "—";
    row.querySelector(".squad-name").textContent = "—";
    row.querySelector(".squad-ovr").textContent = "—";
    return;
  }

  row.classList.remove("is-empty");
  row.querySelector(".squad-pos").textContent = slot.label;
  row.querySelector(".squad-number").textContent = formatPlayerShirtNumber(player);
  row.querySelector(".squad-name").textContent = player.name;
  row.querySelector(".squad-ovr").textContent = displayRating(player.rating);
}

function moveDraftPlayer(fromSlotId, toSlotId) {
  if (fromSlotId === toSlotId) {
    return false;
  }

  const fromSlot = state.formation.slots.find((entry) => entry.id === fromSlotId);
  const toSlot = state.formation.slots.find((entry) => entry.id === toSlotId);
  const fromPlayer = state.assignments[fromSlotId];
  const toPlayer = state.assignments[toSlotId];

  if (!fromSlot || !toSlot || !fromPlayer) {
    return false;
  }

  if (!canPlayRole(fromPlayer, toSlot.role)) {
    return false;
  }

  if (toPlayer && !canPlayRole(toPlayer, fromSlot.role)) {
    return false;
  }

  if (toPlayer) {
    state.assignments[fromSlotId] = toPlayer;
    state.assignments[toSlotId] = fromPlayer;
  } else {
    state.assignments[toSlotId] = fromPlayer;
    delete state.assignments[fromSlotId];
  }

  updateDraftSlotPlacement(fromSlotId, state.assignments[fromSlotId] ?? null);
  updateDraftSlotPlacement(toSlotId, state.assignments[toSlotId] ?? null);
  refreshDraftSquadRow(fromSlotId);
  refreshDraftSquadRow(toSlotId);
  updateDraftSquadMeta();
  scheduleOnlineDraftSave();
  return true;
}

function updateDraftMoveUI() {
  const hint = $("#draft-hint");

  if (hint && isOnlineMode()) {
    hint.textContent = state.draftComplete
      ? "Réorganise ton onze si besoin, puis envoie ton équipe."
      : state.selectedSlotId
        ? "Choisis un autre poste compatible."
        : "Réorganise ton onze si besoin, puis envoie ton équipe.";
  } else if (hint && !isOnlineMode()) {
    hint.textContent = state.selectedSlotId
      ? "Pick another compatible position."
      : "Rearrange your eleven if needed, then start the simulation.";
  }

  $$("#draft-pitch [data-slot]").forEach((button) => {
    button.classList.toggle("is-slot-selected", button.dataset.slot === state.selectedSlotId);
    button.classList.remove("is-compatible");

    if (!state.selectedSlotId) {
      return;
    }

    const fromPlayer = state.assignments[state.selectedSlotId];
    const slot = state.formation.slots.find((entry) => entry.id === button.dataset.slot);

    if (!fromPlayer || !slot || button.dataset.slot === state.selectedSlotId) {
      return;
    }

    const fromSlot = state.formation.slots.find(
      (entry) => entry.id === state.selectedSlotId,
    );
    const toPlayer = state.assignments[slot.id];

    if (!canPlayRole(fromPlayer, slot.role)) {
      return;
    }

    if (!toPlayer || (fromSlot && canPlayRole(toPlayer, fromSlot.role))) {
      button.classList.add("is-compatible");
    }
  });
}

function handleDraftPitchReviewClick(button) {
  const slotId = button.dataset.slot;

  if (!slotId) {
    return;
  }

  if (!state.selectedSlotId) {
    if (!state.assignments[slotId]) {
      return;
    }

    state.selectedSlotId = slotId;
    updateDraftMoveUI();
    return;
  }

  if (state.selectedSlotId === slotId) {
    state.selectedSlotId = null;
    updateDraftMoveUI();
    return;
  }

  if (moveDraftPlayer(state.selectedSlotId, slotId)) {
    state.selectedSlotId = null;
    updateDraftMoveUI();
  }
}

function enterDraftReview() {
  state.draftComplete = true;
  state.pickIndex = 11;
  state.selectedPlayer = null;
  state.selectedSlotId = null;

  const title = $("#draft-progress");
  const label = $("#draft-nation-label");
  const roll = $("#draft-roll");
  const list = $("#draft-player-list");
  const pitchHint = $("#draft-pitch-hint");
  const reviewActions = $("#draft-review-actions");

  if (title) {
    title.textContent = "Draft · Complete";
  }

  if (label) {
    label.textContent = "Lineup";
  }

  setNationDisplay(null, { complete: true });

  if (roll) {
    roll.hidden = true;
  }

  if (list) {
    list.innerHTML =
      "<p class='copy draft-list-done'>Squad complete. Adjust positions on the pitch.</p>";
  }

  if (pitchHint) {
    pitchHint.hidden = false;
  }

  if (reviewActions) {
    reviewActions.hidden = false;
  }

  $$("#draft-pitch [data-slot]").forEach((slotButton) => {
    slotButton.disabled = false;
  });

  updateDraftMoveUI();
  updateDraftSquadMeta();
  requestAnimationFrame(updateAllScrollFades);
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
  row.querySelector(".squad-number").textContent = formatPlayerShirtNumber(player);
  row.querySelector(".squad-name").textContent = player.name;
  row.querySelector(".squad-ovr").textContent = displayRating(player.rating);
}

function updateDraftSquadMeta() {
  const filled = filledCount();
  const squad = currentSquad().filter(Boolean);
  const avg = squadStrength(squad);
  const progress = $("#draft-squad-progress");
  const avgEl = $("#draft-squad-avg");

  if (progress) {
    progress.textContent = `${filled} / 11 players`;
  }

  if (avgEl) {
    avgEl.textContent = displayAvgRating(avg, filled > 0);
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
  updateScrollFades("#tournament-standings-list");
  updateScrollFades("#tournament-match-list");
  updateScrollFades("#tournament-bracket-list");
}

function syncDraftRowHeight() {
  syncChromeHeight();
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
  const lists = [
    "#draft-player-list",
    "#draft-squad-list",
    "#tournament-standings-list",
    "#tournament-match-list",
    "#tournament-bracket-list",
  ];

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
    button.disabled = state.nationRolling || state.rollsLeft <= 0;
  }

  if (count) {
    count.textContent = `${state.rollsLeft}/3`;
  }
}

function refreshDraftPlayerList(nation) {
  const list = $("#draft-player-list");

  if (!list) {
    return;
  }

  list.innerHTML =
    renderPlayerListHTML(nation) || "<p class='copy'>Empty squad.</p>";
  updateDraftPlayerAvailability();
  syncDraftRowHeight();
  requestAnimationFrame(updateAllScrollFades);
}

function updateDraftPickMeta({ resetRolls = false } = {}) {
  if (resetRolls) {
    state.rollsLeft = 3;
  }

  const progress = `${state.pickIndex + 1} / 11`;
  const title = $("#draft-progress");
  const label = $("#draft-nation-label");

  if (title) {
    title.textContent = `Draft · ${progress}`;
  }

  if (label) {
    label.textContent = `Nation ${progress}`;
  }

  updateRollUI();
}

function revealDraftNation(nation, { resetRolls = false, animate = true } = {}) {
  updateDraftPickMeta({ resetRolls });

  const pool = draftNationPool(
    state.draftNations,
    state.data.nations,
    state.pickIndex,
    { excludeCurrent: false },
  );
  const sequence = animate
    ? buildNationRollSequence(
        pool.length > 1 ? pool : state.data.nations,
        nation,
      )
    : [nation];

  return playNationRoll(sequence, {
    onDone: () => {
      refreshDraftPlayerList(nation);
      updateDraftSelectionUI();
    },
  });
}

function updateDraftPickHeader({ resetRolls = false, animate = true } = {}) {
  const nation = state.draftNations[state.pickIndex];
  return revealDraftNation(nation, { resetRolls, animate });
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
              ${pitchSlotInnerHTML(slot, { player })}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderDraft() {
  const complete = state.draftComplete;
  const nation = complete ? null : state.draftNations[state.pickIndex];
  const progress = complete ? "Complete" : `${state.pickIndex + 1} / 11`;
  const hint = complete
    ? isOnlineMode()
      ? onlineDraftPlayerHint(true)
      : "Rearrange your eleven if needed, then start the simulation."
    : isOnlineMode()
      ? onlineDraftPlayerHint(false)
      : state.selectedPlayer
        ? "Click a compatible position on the pitch."
        : "Pick a player from the list.";
  const filled = filledCount();
  const avg = squadStrength(currentSquad().filter(Boolean));

  return `
    <section class="draft-board">
      <header class="draft-top">
        <div class="draft-top-head">
          <span class="step">02</span>
          <h2 class="draft-top-label" id="draft-progress">Draft · ${progress}</h2>
        </div>
        <p class="draft-hint" id="draft-hint">
          ${isOnlineMode() ? onlineDraftHeaderHint() : hint}
        </p>
      </header>
      <div class="draft-columns">
        <div class="panel draft-zone draft-zone-players-head">
          <div class="nation-banner" id="draft-nation-banner">
            <div class="nation-banner-main">
              <div class="nation-banner-copy">
                <span class="nation-label" id="draft-nation-label">${complete ? "Lineup" : `Nation ${progress}`}</span>
                <div class="nation-display" id="draft-nation-display">
                  ${complete ? '<img class="nation-flag" id="draft-nation-flag" alt="" hidden />' : nationFlagMarkup(nation)}
                  <strong class="nation-name" id="draft-nation-name">${complete ? "Complete" : (nation ?? "—")}</strong>
                </div>
              </div>
              <button
                type="button"
                class="btn-roll"
                id="draft-roll"
                ${complete ? "hidden" : ""}
                ${!complete && state.rollsLeft <= 0 ? "disabled" : ""}
              >
                <span class="btn-roll-label">Reroll</span>
                <span class="btn-roll-count" id="draft-roll-count">${state.rollsLeft}/3</span>
              </button>
            </div>
          </div>
        </div>

        <div class="panel draft-zone draft-zone-players-list">
          <div class="list-scroll-shell">
            <div class="list-scroll-edge list-scroll-edge-top" aria-hidden="true"></div>
            <div class="player-list list-scroll" id="draft-player-list">
              ${
                complete
                  ? "<p class='copy draft-list-done'>Équipe complète. Ajuste les postes sur le terrain.</p>"
                  : renderPlayerListHTML(nation) || "<p class='copy'>Effectif vide.</p>"
              }
            </div>
            <div class="list-scroll-edge list-scroll-edge-bottom" aria-hidden="true"></div>
          </div>
          <div class="actions draft-review-actions" id="draft-review-actions" ${complete ? "" : "hidden"}>
            <button class="btn btn-primary" id="launch-simulation">${isOnlineMode() ? "Envoyer mon équipe" : "Start simulation"}</button>
          </div>
        </div>
        <div class="panel draft-zone draft-zone-pitch">
          <div class="pitch-shell">
            <p class="pitch-move-hint" id="draft-pitch-hint" ${complete ? "" : "hidden"}>
              ${isOnlineMode() ? "Tu peux déplacer les joueurs vers d'autres postes compatibles." : "You can move players to other compatible positions."}
            </p>
            <div class="pitch pitch-11" id="draft-pitch">
              ${renderDraftPitchSlots(state.formation)}
            </div>
          </div>
        </div>
        <div class="panel draft-zone draft-zone-squad" id="draft-squad-panel">
          <header class="squad-head">
            <h3>${state.squadName}</h3>
            <div class="avg-badge">
              <span>Average</span>
              <strong id="draft-squad-avg">${displayAvgRating(avg, filled > 0)}</strong>
            </div>
          </header>
          <p class="squad-progress" id="draft-squad-progress">${filled} / 11 players</p>
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

function renderTournamentPitchSlots(formation) {
  return formation.slots
    .map((slot) => {
      const player = state.assignments[slot.id];

      return `
        <div
          class="pitch-slot pitch-slot-preview role-${slot.role} ${player ? "is-filled" : "is-empty-slot"}"
          style="left:${slot.x}%;top:${slot.y}%"
        >
          ${pitchSlotInnerHTML(slot, { player })}
        </div>
      `;
    })
    .join("");
}

const KNOCKOUT_ROUND_LABELS = [
  { title: "16es de finale", short: "16ES" },
  { title: "8es de finale", short: "8ES" },
  { title: "Quarts de finale", short: "QUARTS" },
  { title: "Demi-finales", short: "DEMIS" },
  { title: "Finale", short: "FINALE" },
];

const SIM_SPEEDS = {
  lent: {
    label: "Lent",
    kickoffMs: 900,
    msPerMinute: 58,
    minSegmentMs: 750,
    postGoalPauseMs: 700,
    afterLastGoalMs: 1300,
    emptyMatchMs: 5600,
    penaltyIntroMs: 950,
    penaltyIntervalMs: 1150,
    tickMs: 85,
  },
  normal: {
    label: "Normal",
    kickoffMs: 550,
    msPerMinute: 34,
    minSegmentMs: 480,
    postGoalPauseMs: 450,
    afterLastGoalMs: 800,
    emptyMatchMs: 3400,
    penaltyIntroMs: 600,
    penaltyIntervalMs: 720,
    tickMs: 55,
  },
  rapide: {
    label: "Rapide",
    kickoffMs: 280,
    msPerMinute: 18,
    minSegmentMs: 260,
    postGoalPauseMs: 240,
    afterLastGoalMs: 420,
    emptyMatchMs: 1800,
    penaltyIntroMs: 320,
    penaltyIntervalMs: 380,
    tickMs: 35,
  },
  "tres-rapide": {
    label: "Très rapide",
    kickoffMs: 120,
    msPerMinute: 8,
    minSegmentMs: 90,
    postGoalPauseMs: 80,
    afterLastGoalMs: 160,
    emptyMatchMs: 700,
    penaltyIntroMs: 120,
    penaltyIntervalMs: 140,
    tickMs: 16,
  },
};

let tournamentSimTimer = null;

function simSpeedConfig(speedId) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return {
      kickoffMs: 0,
      msPerMinute: 0,
      minSegmentMs: 0,
      postGoalPauseMs: 40,
      afterLastGoalMs: 40,
      emptyMatchMs: 120,
      penaltyIntroMs: 40,
      penaltyIntervalMs: 40,
      tickMs: 0,
    };
  }

  return SIM_SPEEDS[speedId] ?? SIM_SPEEDS.normal;
}

function clearTournamentSim() {
  if (tournamentSimTimer) {
    clearTimeout(tournamentSimTimer);
    tournamentSimTimer = null;
  }
}

function scheduleSimStep(callback, delayMs) {
  tournamentSimTimer = setTimeout(callback, delayMs);
}

function assignGoalMinutes(events) {
  if (!events.length) {
    return [];
  }

  const minutes = [];
  let cursor = 0;

  for (let index = 0; index < events.length; index += 1) {
    const remainingGoals = events.length - index;
    const remainingMinutes = 90 - cursor;
    const jump = Math.max(
      4,
      Math.min(
        remainingMinutes - remainingGoals * 2,
        Math.floor(remainingMinutes / (remainingGoals + 1)) + Math.floor(Math.random() * 10),
      ),
    );

    cursor = Math.min(90, cursor + jump);
    minutes.push(cursor);
  }

  return minutes;
}

function knockoutRoundMeta(index) {
  return KNOCKOUT_ROUND_LABELS[index] ?? { title: "Tour suivant", short: "SUITE" };
}

function formatScoreLine(goalsA, goalsB) {
  return `${goalsA}–${goalsB}`;
}

function renderScorerLine(label, names) {
  if (!names?.length) {
    return "";
  }

  return `<span class="run-scorer-line"><span class="run-scorer-label">${label}</span> ${names.join(", ")}</span>`;
}

function isUserFixture(fixture) {
  return Boolean(fixture.homeTeam?.isUser || fixture.awayTeam?.isUser);
}

function userVisibleMatches(t) {
  return t.matchQueue.filter(isUserFixture);
}

function renderMatchEventsList(match) {
  const events =
    match.status === "live" ? (match.revealedEvents ?? []) : (match.events ?? []);
  const penaltyKicks =
    match.status === "live"
      ? (match.revealedPenaltyKicks ?? [])
      : (match.penalties?.kicks ?? []);

  if (!events.length && !penaltyKicks.length) {
    return match.status === "live"
      ? '<p class="run-events-empty">Le match est en cours…</p>'
      : '<p class="run-events-empty">Aucun but.</p>';
  }

  const goalItems = events
    .map(
      (event) => `
        <li class="run-event is-goal run-event--reveal">
          <span class="run-event-minute">${event.minute ?? "–"}'</span>
          <span class="run-event-player">${event.player}</span>
          <span class="run-event-result">But</span>
        </li>
      `,
    )
    .join("");

  const penItems = penaltyKicks
    .map(
      (kick) => `
        <li class="run-event ${kick.scored ? "is-goal" : "is-miss"} run-event--reveal">
          <span class="run-event-minute">${kick.round}</span>
          <span class="run-event-player">${kick.player}</span>
          <span class="run-event-result">${kick.scored ? "But" : "Raté"}</span>
        </li>
      `,
    )
    .join("");

  return `
    <ul class="run-event-list">
      ${goalItems}
      ${penaltyKicks.length ? `<li class="run-event-divider" aria-hidden="true">Tirs au but</li>${penItems}` : ""}
    </ul>
  `;
}

function liveScorersFor(match) {
  const userIsAway = Boolean(match.awayTeam?.isUser);
  const events = match.revealedEvents ?? [];

  return {
    scorersFor: events
      .filter((event) => (userIsAway ? event.side === "away" : event.side === "home"))
      .map((event) => event.player),
    scorersAgainst: events
      .filter((event) => (userIsAway ? event.side === "home" : event.side === "away"))
      .map((event) => event.player),
  };
}

function renderRunMatchRow(match) {
  const userIsAway = Boolean(match.awayTeam?.isUser);
  const status = match.status ?? "pending";
  const activeTab = match.activeTab ?? "resume";
  const isLive = status === "live";

  let opponent = match.away;

  if (userIsAway) {
    opponent = match.home;
  }

  const liveGoalsA = match.liveGoalsA ?? 0;
  const liveGoalsB = match.liveGoalsB ?? 0;
  const displayGoalsA = isLive ? liveGoalsA : match.goalsA;
  const displayGoalsB = isLive ? liveGoalsB : match.goalsB;

  const scoreText =
    status === "done"
      ? match.penalties
        ? `${formatScoreLine(match.goalsA, match.goalsB)}<span class="run-pens">(${match.penalties.scoreA}–${match.penalties.scoreB} t.a.b.)</span>`
        : formatScoreLine(match.goalsA, match.goalsB)
      : "";

  const matchup = `<span class="run-tag">vs</span><strong class="run-team">${opponent}</strong>`;

  const liveScorers = liveScorersFor(match);
  const resumePanel =
    isLive || status === "done"
      ? `<div class="run-goals">
          ${renderScorerLine("BUTS", isLive ? liveScorers.scorersFor : userIsAway ? match.scorersB ?? [] : match.scorersA ?? [])}
          ${renderScorerLine(
            "ENCAISSÉS",
            isLive ? liveScorers.scorersAgainst : userIsAway ? match.scorersA ?? [] : match.scorersB ?? [],
          )}
        </div>`
      : "";

  const tabs =
    isLive || status === "done"
      ? `
        <div class="run-match-tabs" role="tablist" aria-label="Détail du match">
          <button type="button" class="run-tab ${activeTab === "resume" ? "is-active" : ""}" data-run-tab="resume" role="tab" aria-selected="${activeTab === "resume"}">Résumé</button>
          <button type="button" class="run-tab ${activeTab === "events" ? "is-active" : ""}" data-run-tab="events" role="tab" aria-selected="${activeTab === "events"}">Buts</button>
        </div>
      `
      : "";

  const tabPanels =
    isLive || status === "done"
      ? `
        <div class="run-tab-panels">
          <div class="run-tab-panel ${activeTab === "resume" ? "is-active" : ""}" data-run-panel="resume" role="tabpanel">${resumePanel}</div>
          <div class="run-tab-panel ${activeTab === "events" ? "is-active" : ""}" data-run-panel="events" role="tabpanel">${renderMatchEventsList(match)}</div>
        </div>
      `
      : "";

  const liveScoreBlock =
    match.livePhase === "penalties"
      ? `<strong>${formatScoreLine(displayGoalsA, displayGoalsB)}</strong><span class="run-pens">(${match.livePenaltiesA ?? 0}–${match.livePenaltiesB ?? 0} t.a.b.)</span>`
      : `<strong>${formatScoreLine(displayGoalsA, displayGoalsB)}</strong>`;

  return `
    <article
      class="run-match ${isLive ? "is-live" : ""} ${status === "done" ? "is-done" : ""} ${status === "pending" ? "is-pending" : ""} is-user"
      data-match-id="${match.id}"
    >
      <div class="run-stage">${match.roundShort ?? match.round}</div>
      <div class="run-body">
        <div class="run-matchup">${matchup}</div>
        ${tabs}
        ${tabPanels}
      </div>
      <div class="run-score" aria-live="polite">
        ${
          status === "pending"
            ? '<span class="run-pending">···</span>'
            : isLive
              ? `${liveScoreBlock}<span class="run-minute">${match.liveMinute ?? 0}'</span><span class="run-live" aria-hidden="true"></span>`
              : `<strong>${scoreText}</strong><span class="run-check" aria-hidden="true">✓</span>`
        }
      </div>
    </article>
  `;
}

function updateTournamentMatchRow(fixture) {
  const row = document.querySelector(`[data-match-id="${fixture.id}"]`);

  if (!row) {
    updateTournamentMatchList();
    return;
  }

  const parent = row.parentElement;
  row.outerHTML = renderRunMatchRow(fixture);
  requestAnimationFrame(() => {
    parent
      ?.querySelector(`[data-match-id="${fixture.id}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

function renderTournamentMatchCards(matches) {
  return matches.map((match) => renderRunMatchRow(match)).join("");
}

function renderTournamentBracket(t) {
  if (t.step !== "knockout" || !t.knockoutRounds?.length) {
    return '<p class="copy bracket-empty">L\'arbre apparaîtra après la phase de groupes.</p>';
  }

  return t.knockoutRounds
    .map((round, roundIndex) => {
      const meta = knockoutRoundMeta(roundIndex);
      const matches = round
        .filter((match) => match.home && match.away)
        .map((match) => {
          const isUser = Boolean(match.home?.isUser || match.away?.isUser);
          const played = Boolean(match.winner);
          const score = played
            ? match.penalties
              ? `${match.goalsA}–${match.goalsB} (${match.penalties.scoreA}–${match.penalties.scoreB} t.a.b.)`
              : `${match.goalsA}–${match.goalsB}`
            : "–";

          return `
            <div class="bracket-match ${isUser ? "is-user" : ""} ${played ? "is-played" : ""}">
              <span class="bracket-team ${match.winner === match.home ? "is-winner" : ""}">${match.home.name}</span>
              <span class="bracket-score">${score}</span>
              <span class="bracket-team ${match.winner === match.away ? "is-winner" : ""}">${match.away.name}</span>
            </div>
          `;
        })
        .join("");

      return `
        <section class="bracket-round">
          <h4 class="bracket-round-label">${meta.short}</h4>
          <div class="bracket-round-matches">${matches}</div>
        </section>
      `;
    })
    .join("");
}

function renderTournamentContextPanel(t) {
  if (t.step === "group") {
    return `
      <header class="squad-head">
        <h3>Groupe ${state.groupKey}</h3>
      </header>
      <p class="squad-progress">Tu remplaces <strong>${state.replacedTeam}</strong></p>
      <div class="list-scroll-shell">
        <div class="list-scroll-edge list-scroll-edge-top" aria-hidden="true"></div>
        <div class="standings-scroll list-scroll" id="tournament-standings-list">
          <table class="standings standings--compact">
            <thead>
              <tr><th>#</th><th>Équipe</th><th>J</th><th>Pts</th><th>Diff</th></tr>
            </thead>
            <tbody id="tournament-standings-body">${renderTournamentStandingsRows(t.groupTable)}</tbody>
          </table>
        </div>
        <div class="list-scroll-edge list-scroll-edge-bottom" aria-hidden="true"></div>
      </div>
    `;
  }

  return `
    <header class="squad-head">
      <h3>Arbre</h3>
    </header>
    <p class="squad-progress">Phase à élimination directe</p>
    <div class="list-scroll-shell">
      <div class="list-scroll-edge list-scroll-edge-top" aria-hidden="true"></div>
      <div class="bracket-scroll list-scroll" id="tournament-bracket-list">${renderTournamentBracket(t)}</div>
      <div class="list-scroll-edge list-scroll-edge-bottom" aria-hidden="true"></div>
    </div>
  `;
}

function updateTournamentMatchList() {
  const list = $("#tournament-match-list");
  const t = state.tournament;

  if (!list || !t) {
    return;
  }

  list.innerHTML = renderTournamentMatchCards(userVisibleMatches(t));
  requestAnimationFrame(() => {
    updateScrollFades("#tournament-match-list");
    list
      .querySelector(".run-match.is-live, .run-match.is-done:last-child")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

function updateTournamentStandings() {
  const body = $("#tournament-standings-body");

  if (!body || !state.tournament || state.tournament.step !== "group") {
    return;
  }

  body.innerHTML = renderTournamentStandingsRows(state.tournament.groupTable);
}

function updateTournamentBracket() {
  const bracket = $("#tournament-bracket-list");
  const t = state.tournament;

  if (!bracket || !t || t.step !== "knockout") {
    return;
  }

  bracket.innerHTML = renderTournamentBracket(t);
  requestAnimationFrame(() => updateScrollFades("#tournament-bracket-list"));
}

function updateTournamentContext() {
  updateTournamentStandings();
  updateTournamentBracket();
}

function updateTournamentChrome() {
  const t = state.tournament;

  if (!t) {
    return;
  }

  const title = $("#tournament-title");
  const hint = $("#tournament-hint");
  const progress = $("#tournament-match-progress");
  const nextBtn = $("#tournament-next");
  const simBtn = $("#tournament-sim-next");
  const userMatches = userVisibleMatches(t);
  const doneCount = userMatches.filter((match) => match.status === "done").length;

  if (title) {
    title.textContent = t.title;
  }

  if (hint) {
    hint.textContent = t.subtitle;
  }

  if (progress) {
    progress.textContent = `${doneCount} / ${userMatches.length} matchs`;
  }

  if (nextBtn) {
    nextBtn.hidden = !t.canContinue || t.simRunning;
    nextBtn.textContent = t.nextLabel;
  }

  if (simBtn) {
    const pending = t.matchQueue.some((match) => match.status === "pending");
    simBtn.hidden = t.simMode !== "step" || !pending || t.simRunning;
  }

  const resultBtn = $("#see-result");
  if (resultBtn) {
    resultBtn.hidden = Boolean(t.canContinue || t.simRunning || !t.champion);
  }

  $$("[data-sim-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.simMode === t.simMode);
    button.setAttribute("aria-pressed", button.dataset.simMode === t.simMode ? "true" : "false");
  });

  $$("[data-sim-speed]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.simSpeed === t.simSpeed);
    button.setAttribute("aria-pressed", button.dataset.simSpeed === t.simSpeed ? "true" : "false");
  });
}

function currentRoundQueue(t) {
  if (t.step === "group") {
    return t.matchQueue.filter((match) => match.type === "group");
  }

  return t.matchQueue.filter((match) => match.knockoutRoundIndex === t.roundIndex);
}

function isCurrentRoundComplete(t) {
  const fixtures = currentRoundQueue(t);
  return fixtures.length > 0 && fixtures.every((match) => match.status === "done");
}

function applyGroupResult(t, result) {
  t.groupResults.push({
    homeId: result.homeId,
    awayId: result.awayId,
    goalsA: result.goalsA,
    goalsB: result.goalsB,
  });
  t.groupTable = groupStandings(t.participants, t.groupResults);
  updateTournamentStandings();
}

function applyMatchResult(fixture, result) {
  Object.assign(fixture, {
    goalsA: result.goalsA,
    goalsB: result.goalsB,
    scorersA: result.scorersA,
    scorersB: result.scorersB,
    events: result.events,
    penalties: result.penalties ?? null,
    winner: result.winner ?? fixture.winner,
    status: "done",
    activeTab: fixture.activeTab ?? "resume",
    livePhase: null,
    liveMinute: null,
    liveGoalsA: null,
    liveGoalsB: null,
    livePenaltiesA: null,
    livePenaltiesB: null,
    revealedEvents: null,
    revealedPenaltyKicks: null,
  });

  if (fixture.bracketRef) {
    Object.assign(fixture.bracketRef, {
      goalsA: result.goalsA,
      goalsB: result.goalsB,
      scorersA: result.scorersA,
      scorersB: result.scorersB,
      events: result.events,
      penalties: result.penalties ?? null,
      winner: result.winner,
      score: formatKnockoutScore(result),
    });
  }
}

function computeMatchResult(fixture) {
  if (fixture.type === "group") {
    return simulateGroupMatch(fixture.homeTeam, fixture.awayTeam);
  }

  return simulateKnockoutMatch(fixture.homeTeam, fixture.awayTeam);
}

function initLiveMatch(fixture) {
  Object.assign(fixture, {
    status: "live",
    livePhase: "regulation",
    liveMinute: 0,
    liveGoalsA: 0,
    liveGoalsB: 0,
    livePenaltiesA: 0,
    livePenaltiesB: 0,
    revealedEvents: [],
    revealedPenaltyKicks: [],
    activeTab: fixture.activeTab ?? "resume",
  });
}

function revealGoalEvent(fixture, event, minute) {
  fixture.revealedEvents.push({ ...event, minute });

  if (event.side === "home") {
    fixture.liveGoalsA += 1;
  } else {
    fixture.liveGoalsB += 1;
  }
}

function animateLiveMinutes(fixture, fromMinute, toMinute, durationMs, speed, onComplete) {
  const target = Math.max(fromMinute, toMinute);

  if (durationMs <= 0 || speed.tickMs <= 0 || fromMinute >= target) {
    fixture.liveMinute = target;
    updateTournamentMatchRow(fixture);
    onComplete();
    return;
  }

  const steps = Math.max(1, Math.min(target - fromMinute, Math.ceil(durationMs / speed.tickMs)));
  const stepDuration = durationMs / steps;
  let step = 0;

  const tick = () => {
    step += 1;
    fixture.liveMinute = Math.min(target, fromMinute + Math.round((step / steps) * (target - fromMinute)));
    updateTournamentMatchRow(fixture);

    if (step >= steps) {
      onComplete();
      return;
    }

    scheduleSimStep(tick, stepDuration);
  };

  tick();
}

function playRegulationPlayback(fixture, result, speed, onComplete) {
  const events = result.events ?? [];
  const minutes = assignGoalMinutes(events);
  let eventIndex = 0;

  const finishRegulation = () => {
    animateLiveMinutes(fixture, fixture.liveMinute ?? 0, 90, speed.afterLastGoalMs, speed, onComplete);
  };

  const playNextGoal = () => {
    if (eventIndex >= events.length) {
      finishRegulation();
      return;
    }

    const fromMinute = eventIndex === 0 ? 0 : minutes[eventIndex - 1];
    const toMinute = minutes[eventIndex];
    const segmentMs = Math.max(speed.minSegmentMs, (toMinute - fromMinute) * speed.msPerMinute);

    animateLiveMinutes(fixture, fromMinute, toMinute, segmentMs, speed, () => {
      revealGoalEvent(fixture, events[eventIndex], toMinute);
      updateTournamentMatchRow(fixture);
      eventIndex += 1;
      scheduleSimStep(playNextGoal, speed.postGoalPauseMs);
    });
  };

  if (!events.length) {
    animateLiveMinutes(fixture, 0, 90, speed.emptyMatchMs, speed, onComplete);
    return;
  }

  fixture.liveMinute = 0;
  fixture.livePhase = "regulation";
  updateTournamentMatchRow(fixture);
  scheduleSimStep(playNextGoal, speed.kickoffMs);
}

function playPenaltyPlayback(fixture, penalties, speed, onComplete) {
  const kicks = penalties.kicks ?? [];
  let kickIndex = 0;

  fixture.livePhase = "penalties";
  fixture.livePenaltiesA = 0;
  fixture.livePenaltiesB = 0;
  fixture.revealedPenaltyKicks = [];
  updateTournamentMatchRow(fixture);

  const playNextKick = () => {
    if (kickIndex >= kicks.length) {
      onComplete();
      return;
    }

    const kick = kicks[kickIndex];
    fixture.revealedPenaltyKicks.push(kick);

    if (kick.scored) {
      if (kick.side === "home") {
        fixture.livePenaltiesA += 1;
      } else {
        fixture.livePenaltiesB += 1;
      }
    }

    kickIndex += 1;
    updateTournamentMatchRow(fixture);
    scheduleSimStep(playNextKick, speed.penaltyIntervalMs);
  };

  scheduleSimStep(playNextKick, speed.penaltyIntroMs);
}

function finishUserMatch(fixture, result) {
  applyMatchResult(fixture, result);

  if (fixture.type === "group") {
    applyGroupResult(state.tournament, result);
  }
}

function playUserMatchPlayback(fixture, onComplete) {
  const t = state.tournament;
  const result = computeMatchResult(fixture);
  const speed = simSpeedConfig(t.simSpeed);

  initLiveMatch(fixture);
  t.simRunning = true;
  updateTournamentMatchList();
  updateTournamentChrome();

  const complete = () => {
    finishUserMatch(fixture, result);
    updateTournamentMatchRow(fixture);
    updateTournamentContext();
    t.simRunning = false;
    updateTournamentChrome();
    onComplete();
  };

  const afterRegulation = () => {
    if (result.penalties) {
      playPenaltyPlayback(fixture, result.penalties, speed, complete);
      return;
    }

    complete();
  };

  playRegulationPlayback(fixture, result, speed, afterRegulation);
}

function resolveTournamentMatch(fixture) {
  const result = computeMatchResult(fixture);
  applyMatchResult(fixture, result);

  if (fixture.type === "group") {
    applyGroupResult(state.tournament, result);
  }
}

function finalizeSimulationBatch() {
  const t = state.tournament;

  if (!t) {
    return;
  }

  t.simRunning = false;

  if (t.step === "group" && isCurrentRoundComplete(t)) {
    t.qualified = t.groupTable.slice(0, 2).map((row) => row.team);
    t.canContinue = true;
    t.nextLabel = "Lancer les 16es de finale";
    t.subtitle = "Phase de groupes terminée. Les 2 premiers sont qualifiés.";
    updateTournamentChrome();
    return;
  }

  if (t.step === "knockout" && isCurrentRoundComplete(t)) {
    const currentRound = t.knockoutRounds[t.roundIndex] ?? [];
    const winners = currentRound.map((match) => match.winner).filter(Boolean);
    const nextRound = [];

    for (let index = 0; index < winners.length; index += 2) {
      nextRound.push({ home: winners[index], away: winners[index + 1] });
    }

    const playable = nextRound.filter((match) => match.home && match.away);

    if (playable.length > 0) {
      t.knockoutRounds.push(nextRound);
      const nextMeta = knockoutRoundMeta(t.roundIndex + 1);
      t.canContinue = true;
      t.nextLabel =
        playable.length === 1 ? "Jouer la finale" : `Lancer les ${nextMeta.title.toLowerCase()}`;
      t.subtitle = `${playable.length * 2} équipes encore en lice.`;
    } else {
      t.champion = winners[0] ?? currentRound.find((match) => match.winner)?.winner ?? null;
      t.canContinue = false;
      t.title = "Tournoi terminé";
      t.subtitle = `${t.champion?.name ?? "—"} remporte la Coupe du Monde.`;
    }

    updateTournamentChrome();
  }
}

function runTournamentSimulation() {
  const t = state.tournament;

  if (!t || t.simRunning) {
    return;
  }

  const next = t.matchQueue.find((match) => match.status === "pending");

  if (!next) {
    finalizeSimulationBatch();
    return;
  }

  if (!isUserFixture(next)) {
    resolveTournamentMatch(next);
    updateTournamentContext();
    runTournamentSimulation();
    return;
  }

  playUserMatchPlayback(next, () => {
    if (t.simMode === "auto") {
      runTournamentSimulation();
    } else if (!t.matchQueue.some((match) => match.status === "pending")) {
      finalizeSimulationBatch();
    }
  });
}

function queueKnockoutRound(t, matches, roundIndex) {
  const meta = knockoutRoundMeta(roundIndex);
  const fixtures = matches
    .filter((match) => match.home && match.away)
    .map((match, index) => ({
      id: `k-${roundIndex}-${index}`,
      type: "knockout",
      round: meta.title,
      roundShort: meta.short,
      knockoutRoundIndex: roundIndex,
      homeTeam: match.home,
      awayTeam: match.away,
      home: match.home.name,
      away: match.away.name,
      bracketRef: match,
      status: "pending",
      activeTab: "resume",
    }));

  t.matchQueue.push(...fixtures);
  t.title = meta.title;
  t.subtitle = "Avance match par match pour suivre ton parcours.";
  t.canContinue = false;
  updateTournamentMatchList();
  updateTournamentBracket();
  updateTournamentChrome();

  if (t.simMode === "auto") {
    runTournamentSimulation();
  }
}

function beginKnockoutStage(t) {
  const bracket = buildKnockoutBracket(simulateWorldCupQualifiers());
  t.knockoutRounds = [bracket];
  t.roundIndex = 0;
  t.step = "knockout";

  const panel = $("#tournament-context-panel");
  if (panel) {
    panel.innerHTML = renderTournamentContextPanel(t);
    bindScrollFades();
    requestAnimationFrame(updateAllScrollFades);
  }

  queueKnockoutRound(t, bracket, 0);
}

function setRunMatchTab(matchId, tabId) {
  const fixture = state.tournament?.matchQueue.find((match) => match.id === matchId);

  if (!fixture) {
    return;
  }

  fixture.activeTab = tabId;
  updateTournamentMatchList();
}

function renderTournamentStandingsRows(groupTable) {
  return groupTable
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
}

function renderTournament() {
  const t = state.tournament;
  const avg = squadStrength(currentSquad().filter(Boolean));
  const userMatches = userVisibleMatches(t);
  const doneCount = userMatches.filter((match) => match.status === "done").length;

  return `
    <section class="draft-board tournament-board">
      <header class="draft-top">
        <div class="draft-top-head">
          <span class="step">03</span>
          <h2 class="draft-top-label" id="tournament-title">${t.title}</h2>
        </div>
        <p class="draft-hint" id="tournament-hint">${t.subtitle}</p>
      </header>
      <div class="draft-columns tournament-columns">
        <div class="panel draft-zone draft-zone-tournament-pitch">
          <header class="squad-head tournament-pitch-head">
            <h3>${state.squadName}</h3>
            <div class="avg-badge">
              <span>Moyenne</span>
              <strong>${displayAvgRating(avg)}</strong>
            </div>
          </header>
          <div class="pitch pitch-11" id="tournament-pitch">
            ${renderTournamentPitchSlots(state.formation)}
          </div>
        </div>

        <div class="panel draft-zone draft-zone-tournament-run" id="tournament-matches-panel">
          <header class="squad-head run-head">
            <h3>Le parcours</h3>
            <div class="run-toolbar">
              <div class="run-controls" role="group" aria-label="Mode de simulation">
                <button type="button" class="run-mode-btn ${t.simMode === "step" ? "is-active" : ""}" data-sim-mode="step" aria-pressed="${t.simMode === "step"}">Match par match</button>
                <button type="button" class="run-mode-btn ${t.simMode === "auto" ? "is-active" : ""}" data-sim-mode="auto" aria-pressed="${t.simMode === "auto"}">Automatique</button>
              </div>
              <div class="run-speed-controls" role="group" aria-label="Vitesse de simulation">
                <span class="run-speed-label">Vitesse</span>
                ${Object.entries(SIM_SPEEDS)
                  .map(
                    ([id, speed]) => `
                      <button
                        type="button"
                        class="run-speed-btn ${t.simSpeed === id ? "is-active" : ""}"
                        data-sim-speed="${id}"
                        aria-pressed="${t.simSpeed === id}"
                      >${speed.label}</button>
                    `,
                  )
                  .join("")}
              </div>
            </div>
          </header>
          <p class="squad-progress" id="tournament-match-progress">${doneCount} / ${userMatches.length} matchs</p>
          <div class="list-scroll-shell">
            <div class="list-scroll-edge list-scroll-edge-top" aria-hidden="true"></div>
            <div class="run-feed list-scroll" id="tournament-match-list">${renderTournamentMatchCards(userMatches)}</div>
            <div class="list-scroll-edge list-scroll-edge-bottom" aria-hidden="true"></div>
          </div>
          <div class="actions tournament-actions">
            <button class="btn btn-primary" type="button" id="tournament-sim-next" ${t.simMode === "step" && t.matchQueue.some((match) => match.status === "pending") && !t.simRunning ? "" : "hidden"}>Simuler le match suivant</button>
            <button class="btn btn-primary" type="button" id="tournament-next" ${t.canContinue && !t.simRunning ? "" : "hidden"}>${t.nextLabel}</button>
            <button class="btn btn-primary" type="button" id="see-result" ${!t.canContinue && !t.simRunning && t.champion ? "" : "hidden"}>Voir le résultat</button>
          </div>
        </div>

        <div class="panel draft-zone draft-zone-tournament-context" id="tournament-context-panel">
          ${renderTournamentContextPanel(t)}
        </div>
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
      <h2>${won ? "World champions!" : "Eliminated"}</h2>
      <p class="lede">${t.champion?.name ?? "—"} wins the 2026 World Cup</p>
      <p class="copy">
        Group ${state.groupKey} · Average ${ratingOvr(squadStrength(currentSquad()))} OVR
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
        <button class="btn btn-primary" id="play-again">Play again</button>
        <a class="btn btn-ghost" href="/">Home</a>
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
    state.squadName = event.target.value.trim() || "My Team";
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
  state.selectedSlotId = null;
  state.draftComplete = false;
  state.draftNations = drawUniqueNations(state.data.nations, 11);
  render();
}

function bindDraft() {
  const playerList = $("#draft-player-list");
  const pitch = $("#draft-pitch");

  bindScrollFades();
  bindDraftRowHeightSync();
  requestAnimationFrame(syncDraftRowHeight);

  if (state.pickIndex === 0 && !state.draftComplete && filledCount() === 0) {
    const introNation = state.draftNations[0];
    const list = $("#draft-player-list");

    if (list) {
      list.innerHTML = "<p class='copy nation-roll-wait'>Drawing nation…</p>";
    }

    void revealDraftNation(introNation, { animate: true });
  }

  $("#draft-roll")?.addEventListener("click", async () => {
    if (state.draftComplete || state.rollsLeft <= 0 || state.nationRolling) {
      return;
    }

    const currentNation = state.draftNations[state.pickIndex];
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
    updateDraftSelectionUI();

    const pool = draftNationPool(
      state.draftNations,
      state.data.nations,
      state.pickIndex,
      { excludeCurrent: false },
    );
    const animationPool = [...new Set([currentNation, ...pool])];
    const sequence = buildNationRollSequence(animationPool, nextNation);

    if ($("#draft-player-list")) {
      $("#draft-player-list").innerHTML =
        "<p class='copy nation-roll-wait'>Drawing nation…</p>";
    }

    await playNationRoll(sequence, {
      onDone: () => {
        refreshDraftPlayerList(nextNation);
        updateDraftSelectionUI();
      },
    });
  });

  playerList?.addEventListener("click", (event) => {
    if (state.draftComplete || state.nationRolling) {
      return;
    }

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

    if (!button) {
      return;
    }

    if (state.draftComplete) {
      handleDraftPitchReviewClick(button);
      return;
    }

    if (button.disabled || !state.selectedPlayer || state.nationRolling) {
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
      scheduleOnlineDraftSave();
      enterDraftReview();
      return;
    }

    const nextNation = state.draftNations[state.pickIndex];
    void revealDraftNation(nextNation, { resetRolls: true });
    updateDraftSelectionUI();
    scheduleOnlineDraftSave();
  });

  $("#launch-simulation")?.addEventListener("click", () => {
    if (isOnlineMode()) {
      void submitOnlineDraft();
      return;
    }

    startTournament();
  });
}

function aiParticipant(teamName, formation, suffix = "") {
  const roster = teamRoster(teamName);
  const squad = buildAiSquad(roster, formation);
  return createParticipant(`${teamName}${suffix}`, teamName, squad);
}

function startTournament() {
  clearTournamentSim();
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

  const matchQueue = roundRobinPairs(participants.map((team) => team.id)).map(
    ([homeId, awayId], index) => {
      const home = participants.find((team) => team.id === homeId);
      const away = participants.find((team) => team.id === awayId);

      return {
        id: `g-${index}`,
        type: "group",
        round: `Groupe ${group.groupKey}`,
        roundShort: "GROUPES",
        homeTeam: home,
        awayTeam: away,
        home: home.name,
        away: away.name,
        status: "pending",
        activeTab: "resume",
      };
    },
  );

  state.tournament = {
    step: "group",
    participants,
    groupResults: [],
    groupTable: groupStandings(participants, []),
    matchQueue,
    knockoutRounds: [],
    roundIndex: 0,
    title: "Phase de groupes",
    subtitle: "Avance match par match pour suivre ton parcours.",
    canContinue: false,
    nextLabel: "Lancer les 16es de finale",
    champion: null,
    simMode: "step",
    simSpeed: "normal",
    simRunning: false,
  };

  state.phase = "tournament";
  render();
}

function simulateAllGroupTables() {
  const aiFormation = formationById(DEFAULT_AI_FORMATION_ID);
  const groupTables = [state.tournament.groupTable];

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

    groupTables.push(groupStandings(groupParticipants, results));
  }

  return groupTables;
}

function simulateWorldCupQualifiers() {
  return qualifyWorldCupKnockout(simulateAllGroupTables());
}

function bindTournament() {
  bindScrollFades();
  bindDraftRowHeightSync();
  requestAnimationFrame(syncDraftRowHeight);

  const matchList = $("#tournament-match-list");

  if (matchList && matchList.dataset.tabsBound !== "true") {
    matchList.dataset.tabsBound = "true";
    matchList.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-run-tab]");

      if (!tab) {
        return;
      }

      const matchId = tab.closest("[data-match-id]")?.dataset.matchId;

      if (matchId) {
        setRunMatchTab(matchId, tab.dataset.runTab);
      }
    });
  }

  $$("[data-sim-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const t = state.tournament;
      const mode = button.dataset.simMode;

      if (!t || t.simRunning || t.simMode === mode) {
        return;
      }

      t.simMode = mode;
      updateTournamentChrome();

      if (mode === "auto" && t.matchQueue.some((match) => match.status === "pending")) {
        runTournamentSimulation();
      }
    });
  });

  $$("[data-sim-speed]").forEach((button) => {
    button.addEventListener("click", () => {
      const t = state.tournament;
      const speed = button.dataset.simSpeed;

      if (!t || t.simRunning || t.simSpeed === speed) {
        return;
      }

      t.simSpeed = speed;
      updateTournamentChrome();
    });
  });

  $("#tournament-sim-next")?.addEventListener("click", () => {
    if (state.tournament?.simMode === "step") {
      runTournamentSimulation();
    }
  });

  $("#tournament-next")?.addEventListener("click", () => {
    const t = state.tournament;

    if (!t || t.simRunning || !t.canContinue) {
      return;
    }

    if (t.step === "group") {
      beginKnockoutStage(t);
      return;
    }

    if (t.step === "knockout") {
      t.roundIndex += 1;
      t.canContinue = false;
      queueKnockoutRound(t, t.knockoutRounds[t.roundIndex], t.roundIndex);
    }
  });

  $("#see-result")?.addEventListener("click", () => {
    clearTournamentSim();
    state.phase = "result";
    render();
  });
}

function bindResult() {
  $("#play-again")?.addEventListener("click", () => {
    clearTournamentSim();
    state.phase = "setup";
    state.assignments = {};
    state.pickIndex = 0;
    state.rollsLeft = 3;
    state.selectedPlayer = null;
    state.selectedSlotId = null;
    state.draftComplete = false;
    state.tournament = null;
    state.groupKey = null;
    state.replacedTeam = null;
    render();
  });
}

async function init() {
  if (state.phase === "home" && $(".landing")) {
    bindHome();
  } else {
    render();
  }

  try {
    await bootstrap();
    refreshLandingStats();
    await tryResumeOnlineMatch();
  } catch (error) {
    if (state.phase !== "home") {
      $("#app").innerHTML = `
        <section class="panel">
          <h2>Error</h2>
          <p>${error.message}</p>
        </section>
      `;
      return;
    }

    const stats = $("#landing-stats");
    if (stats) {
      stats.textContent = "Unable to load game data. Run npm run dev.";
    }
  }
}

init();
