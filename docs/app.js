/***********************
 * STATIC DATA PATHS
 ***********************/
const PLAYERS_URL = "./data/players.json";
const ASSIGNMENTS_URL = "./data/assignments.json";
const TIMEOUT_SEC = 10;

/***********************
 * STATE
 ***********************/
let players = [];          // [{id, display, search?}, ...]
let assignments = {};      // { "Lucas": { target:"Pauline", mission:"..." }, ... }

let countdownTimer = null;

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

function normalize(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/\s+/g, " ");
}

function showHome() {
  stopCountdown();
  clearAlert();
  $("viewHome").classList.remove("hidden");
  $("viewMission").classList.add("hidden");
  $("inputName").value = "";
}

function showMission(playerName, missionText, targetText) {
  clearAlert();
  $("whoami").textContent = `Connecté : ${playerName}`;
  $("missionText").textContent = missionText || "—";
  $("targetText").textContent = targetText || "—";

  $("viewHome").classList.add("hidden");
  $("viewMission").classList.remove("hidden");

  startCountdown(TIMEOUT_SEC);
}

/***********************
 * COUNTDOWN (MISSION ONLY)
 ***********************/
function stopCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

function startCountdown(seconds) {
  stopCountdown();
  let remaining = seconds;
  $("countdown").textContent = String(remaining);

  countdownTimer = setInterval(() => {
    remaining -= 1;
    $("countdown").textContent = String(Math.max(0, remaining));
    if (remaining <= 0) {
      showHome();
    }
  }, 1000);
}

/***********************
 * LOAD STATIC FILES
 ***********************/
async function loadJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return res.json();
}

async function initData() {
  players = await loadJson(PLAYERS_URL);
  assignments = await loadJson(ASSIGNMENTS_URL);

  // build datalist
  const dl = $("playersDatalist");
  dl.innerHTML = players
    .map((p) => `<option value="${escapeHtml(p.display || p.id)}"></option>`)
    .join("");
}

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/***********************
 * RESOLVE PLAYER
 ***********************/
function resolvePlayer(inputText) {
  const raw = (inputText || "").trim();
  if (!raw) return null;

  // exact match by display/id
  const exact = players.find((p) => (p.display || p.id) === raw);
  if (exact) return exact;

  // accent-insensitive match
  const n = normalize(raw);
  const candidates = players.filter((p) => normalize(p.display || p.id) === n);
  if (candidates.length === 1) return candidates[0];

  return null;
}

function findAssignmentForPlayer(playerName) {
  // assignments is a dict keyed by player name (ID)
  // allow accent-insensitive key match
  if (assignments[playerName]) return assignments[playerName];

  const wanted = normalize(playerName);
  for (const k of Object.keys(assignments || {})) {
    if (normalize(k) === wanted) return assignments[k];
  }
  return null;
}

/***********************
 * EVENTS
 ***********************/
function wireEvents() {
  $("formLogin").addEventListener("submit", (e) => {
    e.preventDefault();

    const player = resolvePlayer($("inputName").value);
    if (!player) {
      showAlert("Choisis un prénom valide dans la liste déroulante.");
      return;
    }

    const name = player.id || player.display;
    const a = findAssignmentForPlayer(name);

    if (!a) {
      showAlert("Aucune mission trouvée pour ce prénom (vérifie assignments.json).");
      return;
    }

    showMission(name, a.mission, a.target);
  });

  $("btnHomeMission").addEventListener("click", showHome);
}

/***********************
 * INIT
 ***********************/
(async function init() {
  try {
    wireEvents();
    showHome();
    await initData();
  } catch (err) {
    console.error(err);
    showAlert("Erreur chargement des fichiers JSON. Vérifie docs/data/players.json et assignments.json.");
  }
})();
