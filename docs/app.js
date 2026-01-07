/***********************
 * CONFIG
 ***********************/
const API_BASE = "https://killergame-pauline25.onrender.com";
const ADMIN_NAME = "Lucas";
const ADMIN_PASSWORD = "Veiga";

/***********************
 * STATE
 ***********************/
let session = {
  player: null,      // {id, display}
  mission: null,     // {text}
  target: null,      // {display}
  missionDone: false,
};

let playersIndex = {
  list: [],
  byDisplay: new Map(),
};

let countdownTimer = null;
let countdownRemaining = 10;

/***********************
 * DOM HELPERS
 ***********************/
const $ = (id) => document.getElementById(id);

function showAlert(msg) {
  const el = $("globalAlert");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearAlert() {
  const el = $("globalAlert");
  el.textContent = "";
  el.classList.add("hidden");
}

function showView(viewId) {
  ["viewHome", "viewMission", "viewGuess", "viewAdmin"]
    .forEach(v => $(v).classList.toggle("hidden", v !== viewId));
  clearAlert();
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/***********************
 * API HELPERS
 ***********************/
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/***********************
 * PLAYERS
 ***********************/
async function loadPlayers() {
  const data = await apiGet("/api/players");
  playersIndex.list = data;
  playersIndex.byDisplay.clear();

  const dl = $("playersDatalist");
  dl.innerHTML = "";

  data.forEach(p => {
    playersIndex.byDisplay.set(p.display, p);
    dl.insertAdjacentHTML("beforeend", `<option value="${p.display}"></option>`);
  });
}

function resolvePlayer(input) {
  const raw = input.trim();
  if (playersIndex.byDisplay.has(raw)) return playersIndex.byDisplay.get(raw);

  const n = normalize(raw);
  const matches = playersIndex.list.filter(p => normalize(p.display) === n);
  return matches.length === 1 ? matches[0] : null;
}

/***********************
 * COUNTDOWN
 ***********************/
function startCountdown(sec = 10) {
  stopCountdown();
  countdownRemaining = sec;
  $("countdown").textContent = sec;

  countdownTimer = setInterval(() => {
    countdownRemaining--;
    $("countdown").textContent = Math.max(0, countdownRemaining);
    if (countdownRemaining <= 0) logoutToHome();
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

/***********************
 * NAV / SESSION
 ***********************/
function logoutToHome() {
  stopCountdown();
  session = { player: null, mission: null, target: null, missionDone: false };

  $("inputName").value = "";
  $("killerInput").value = "";
  $("guessMission").value = "";
  $("missionStatus").textContent = "";
  $("guessStatus").textContent = "";

  showView("viewHome");
}

/***********************
 * LOGIN + MISSION
 ***********************/
async function loginAndFetchMission(name) {
  const player = resolvePlayer(name);
  if (!player) {
    showAlert("Choisis un nom valide dans la liste.");
    return;
  }

  const data = await apiGet(`/api/mission?player=${encodeURIComponent(player.display)}`);
  if (!data.ok) {
    showAlert(data.error || "Erreur mission.");
    return;
  }

  session.player = data.player;
  session.mission = data.mission;
  session.target = data.target;
  session.missionDone = data.mission_done;

  renderMissionScreen();
  showView("viewMission");
  startCountdown(10);
}

function renderMissionScreen() {
  $("whoami").textContent = `Connecté : ${session.player.display}`;
  $("missionText").textContent = session.mission.text;
  $("targetText").textContent = session.target.display;
  $("missionStatus").textContent = session.missionDone
    ? "Mission déjà déclarée comme réalisée ✅"
    : "Mission non encore déclarée.";

  // Admin box
  const isAdmin = session.player.display === ADMIN_NAME;
  $("adminBox").classList.toggle("hidden", !isAdmin);
  $("adminPass").value = "";
  $("adminStatus").textContent = "";
}

/***********************
 * MISSION DONE
 ***********************/
async function markMissionDone() {
  await apiPost("/api/mission_done", { player_id: session.player.id });
  session.missionDone = true;
  renderMissionScreen();
}

/***********************
 * GUESS
 ***********************/
function goToGuess() {
  stopCountdown();
  showView("viewGuess");
}

async function submitGuess() {
  const accused = resolvePlayer($("killerInput").value);
  if (!accused) {
    showAlert("Choisis un nom valide.");
    return;
  }

  const mission = $("guessMission").value.trim();
  if (!mission) {
    showAlert("Décris la mission.");
    return;
  }

  await apiPost("/api/guess", {
    player_id: session.player.id,
    accused_killer_id: accused.id,
    guessed_mission: mission,
  });

  $("guessStatus").textContent = "Guess enregistré ✅";
}

/***********************
 * ADMIN
 ***********************/
async function unlockAdmin() {
  if ($("adminPass").value !== ADMIN_PASSWORD) {
    $("adminStatus").textContent = "Mot de passe incorrect ❌";
    return;
  }
  $("adminStatus").textContent = "Accès autorisé ✅";
  showView("viewAdmin");
  await refreshAdmin();
}

async function refreshAdmin() {
  const data = await apiGet("/api/leaderboard");
  const tbody = $("adminTbody");

  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${r.display}</td>
      <td>${r.points}</td>
      <td>${r.mission_done ? "Oui" : "Non"}</td>
      <td>${r.discovered_by_target ? "Oui" : "Non"}</td>
      <td>${r.found_killer ? "Oui" : "Non"}</td>
      <td>${r.guess_killer_display || "—"}</td>
      <td>${r.guess_mission || "—"}</td>
    </tr>
  `).join("");
}

/***********************
 * EVENTS
 ***********************/
function wireEvents() {
  $("btnHomeHeader").onclick = logoutToHome;
  $("btnHomeMission").onclick = logoutToHome;
  $("btnHomeGuess").onclick = logoutToHome;
  $("btnHomeAdmin").onclick = logoutToHome;

  $("formLogin").onsubmit = e => {
    e.preventDefault();
    loginAndFetchMission($("inputName").value);
  };

  $("btnMissionDone").onclick = markMissionDone;
  $("btnGoGuessFromMission").onclick = goToGuess;
  $("formGuess").onsubmit = e => {
    e.preventDefault();
    submitGuess();
  };

  $("btnAdminUnlock").onclick = unlockAdmin;
  $("btnRefreshAdmin").onclick = refreshAdmin;
}

/***********************
 * INIT
 ***********************/
async function init() {
  wireEvents();
  showView("viewHome");
  await loadPlayers();
}

init();
