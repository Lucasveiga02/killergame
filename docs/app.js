/***********************
 * CONFIG
 ***********************/
const API_BASE = "https://killergame-pauline25.onrender.com";

/**
 * Endpoints attendus côté backend (à implémenter si pas déjà fait) :
 * - GET  /api/players
 *     -> [{ id: "p01", display: "Lucas Veiga", search: "lucas veiga" }, ...]
 *
 * - GET  /api/mission?player=<displayName>
 *     -> { ok:true, player:{id, display}, mission:{ text }, target:{ display }, mission_done:bool }
 *
 * - POST /api/mission_done
 *     body: { player_id: "p01" }
 *     -> { ok:true, mission_done:true }
 *
 * - POST /api/guess
 *     body: { player_id:"pXX", accused_killer_id:"pYY", guessed_mission:"..." }
 *     -> { ok:true, stored:true }
 *
 * - GET  /api/leaderboard
 *     -> [{ display, points, mission_done, discovered_by_target, found_killer, guess_killer_display, guess_mission }, ...]
 */

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
  list: [],          // raw array
  byDisplay: new Map(), // display -> player
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
  const views = ["viewHome", "viewMission", "viewGuess", "viewAdmin"];
  for (const v of views) $(v).classList.toggle("hidden", v !== viewId);
  clearAlert();
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

/***********************
 * API HELPERS
 ***********************/
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: "GET" });
  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(`API GET ${path} failed (${res.status}): ${txt}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(`API POST ${path} failed (${res.status}): ${txt}`);
  }
  return res.json();
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}

/***********************
 * PLAYERS AUTOCOMPLETE
 ***********************/
async function loadPlayers() {
  // Cache in-memory for this page session
  const data = await apiGet("/api/players");
  playersIndex.list = Array.isArray(data) ? data : [];
  playersIndex.byDisplay = new Map();
  for (const p of playersIndex.list) {
    if (p && p.display) playersIndex.byDisplay.set(p.display, p);
  }

  const dl = $("playersDatalist");
  dl.innerHTML = playersIndex.list
    .map((p) => `<option value="${escapeHtml(p.display)}"></option>`)
    .join("");
}

function resolvePlayerDisplay(inputText) {
  // user might pick from datalist; enforce exact display match if possible
  const raw = (inputText || "").trim();
  if (playersIndex.byDisplay.has(raw)) return playersIndex.byDisplay.get(raw);

  // fallback: normalized matching (useful if user types without accents)
  const n = normalize(raw);
  const candidates = playersIndex.list.filter((p) => normalize(p.display) === n);
  if (candidates.length === 1) return candidates[0];

  return null; // ambiguous or not found
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
 * COUNTDOWN (MISSION SCREEN)
 ***********************/
function startCountdown(seconds = 10) {
  stopCountdown();
  countdownRemaining = seconds;
  $("countdown").textContent = String(countdownRemaining);

  countdownTimer = setInterval(() => {
    countdownRemaining -= 1;
    $("countdown").textContent = String(Math.max(0, countdownRemaining));
    if (countdownRemaining <= 0) {
      stopCountdown();
      logoutToHome();
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

/***********************
 * SESSION / NAV
 ***********************/
function logoutToHome() {
  stopCountdown();
  session = { player: null, mission: null, target: null, missionDone: false };
  $("inputName").value = "";
  $("killerInput").value = "";
  $("guessMission").value = "";
  $("guessStatus").textContent = "";
  $("missionStatus").textContent = "";
  $("adminBlock").classList.add("hidden");
  showView("viewHome");
}

function updateAdminVisibility() {
  // Admin menu visible only when logged in AND exact name matches "Lucas Veiga"
  const isAdmin = session.player && session.player.display === "Lucas Veiga";
  $("adminBlock").classList.toggle("hidden", !isAdmin);
}

/***********************
 * FLOWS
 ***********************/
async function loginAndFetchMission(displayName) {
  clearAlert();

  // Ensure players are loaded
  if (!playersIndex.list.length) await loadPlayers();

  const player = resolvePlayerDisplay(displayName);
  if (!player) {
  showAlert("Choisis un nom valide dans la liste déroulante (pas de saisie libre approximative).");
  return;
  }

  // Fetch mission data
  const payload = await apiGet(`/api/mission?player=${encodeURIComponent(player.display)}`);

  if (!payload || payload.ok === false) {
    showAlert(payload?.error || "Impossible de récupérer la mission.");
    return;
  }

  session.player = payload.player || player;
  session.mission = payload.mission || { text: "—" };
  session.target = payload.target || { display: "—" };
  session.missionDone = !!payload.mission_done;

  renderMissionScreen();
  updateAdminVisibility();
  showView("viewMission");
  startCountdown(10);
}

function resolvePlayerByLooseName(inputText) {
  // fallback: find by normalized "includes" if exact match isn't possible
  const n = normalize(inputText);
  if (!n) return null;

  // Prefer exact normalized match
  const exact = playersIndex.list.find((p) => normalize(p.display) === n);
  if (exact) return exact;

  // If user typed only a first name, we accept if unique
  const first = playersIndex.list.filter((p) => normalize(p.display).startsWith(n));
  if (first.length === 1) return first[0];

  return null;
}

function renderMissionScreen() {
  $("whoami").textContent = session.player ? `Connecté : ${session.player.display}` : "";
  $("missionText").textContent = session.mission?.text || "—";
  $("targetText").textContent = session.target?.display || "—";
  $("missionStatus").textContent = session.missionDone ? "Statut : mission déjà déclarée comme réalisée ✅" : "Statut : mission non déclarée (pour l’instant).";
}

/***********************
 * GUESS FLOW
 ***********************/
function goToGuess() {
  clearAlert();
  stopCountdown(); // user chose to leave mission screen; still keep auto-log out available via Home button
  if (!session.player) {
    showAlert("Tu dois d’abord te connecter avec ton nom pour faire un guess.");
    showView("viewHome");
    return;
  }
  $("guessStatus").textContent = "";
  showView("viewGuess");
}

async function submitGuess() {
  clearAlert();
  if (!session.player) {
    showAlert("Session expirée. Reviens à l’accueil et reconnecte-toi.");
    showView("viewHome");
    return;
  }

  const accused = resolvePlayerDisplay($("killerInput").value);
  if (!accused) {
    showAlert("Choisis un killer valide dans la liste déroulante (pas de saisie libre approximative).");
    return;
  }

  const guessedMission = $("guessMission").value.trim();
  if (!guessedMission) {
    showAlert("Décris la mission devinée.");
    return;
  }

  // Optional: prevent self-accusation
  if (accused.id && session.player.id && accused.id === session.player.id) {
    showAlert("Tu ne peux pas t’accuser toi-même 😉");
    return;
  }

  $("guessStatus").textContent = "Envoi du guess…";

  const resp = await apiPost("/api/guess", {
    player_id: session.player.id || null,
    accused_killer_id: accused.id || null,
    accused_killer_display: accused.display, // fallback if backend uses display
    guessed_mission: guessedMission,
  });

  if (resp?.ok === false) {
    $("guessStatus").textContent = "";
    showAlert(resp?.error || "Erreur lors de l’enregistrement du guess.");
    return;
  }

  $("guessStatus").textContent = "Guess enregistré ✅";
}

/***********************
 * MISSION DONE
 ***********************/
async function markMissionDone() {
  clearAlert();
  if (!session.player) {
    showAlert("Session expirée. Reviens à l’accueil et reconnecte-toi.");
    showView("viewHome");
    return;
  }

  $("missionStatus").textContent = "Enregistrement…";

  const resp = await apiPost("/api/mission_done", {
    player_id: session.player.id || null,
    player_display: session.player.display,
  });

  if (resp?.ok === false) {
    showAlert(resp?.error || "Erreur lors de la validation.");
    $("missionStatus").textContent = "";
    return;
  }

  session.missionDone = true;
  renderMissionScreen();
}

/***********************
 * ADMIN
 ***********************/
async function goToAdmin() {
  clearAlert();
  if (!session.player || session.player.display !== "Lucas Veiga") {
    showAlert("Accès refusé.");
    return;
  }
  showView("viewAdmin");
  await refreshAdmin();
}

async function refreshAdmin() {
  clearAlert();
  const tbody = $("adminTbody");
  tbody.innerHTML = `<tr><td colspan="7" class="muted">Chargement…</td></tr>`;

  const data = await apiGet("/api/leaderboard");
  const rows = Array.isArray(data) ? data : [];

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Aucune donnée.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    const yesNo = (b) => (b ? "Oui" : "Non");
    return `
      <tr>
        <td>${escapeHtml(r.display ?? "—")}</td>
        <td>${escapeHtml(String(r.points ?? 0))}</td>
        <td>${escapeHtml(yesNo(!!r.mission_done))}</td>
        <td>${escapeHtml(yesNo(!!r.discovered_by_target))}</td>
        <td>${escapeHtml(yesNo(!!r.found_killer))}</td>
        <td>${escapeHtml(r.guess_killer_display ?? "—")}</td>
        <td>${escapeHtml(r.guess_mission ?? "—")}</td>
      </tr>
    `;
  }).join("");
}

/***********************
 * WIRING
 ***********************/
function wireEvents() {
  // Global home button
  $("btnHomeHeader").addEventListener("click", logoutToHome);

  // HOME
  $("formLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await loginAndFetchMission($("inputName").value);
    } catch (err) {
      console.error(err);
      showAlert("Impossible de joindre le serveur (API). Vérifie Render / CORS.");
    }
  });

  $("btnGoGuessFromHome").addEventListener("click", () => {
    try { goToGuess(); } catch (err) { console.error(err); showAlert("Erreur."); }
  });

  $("btnGoMissionFromHome").addEventListener("click", () => {
    if (!session.player) {
      showAlert("Tu n’es pas connecté. Entre ton nom et récupère ta mission.");
      return;
    }
    renderMissionScreen();
    showView("viewMission");
    startCountdown(10);
  });

  $("btnGoAdmin").addEventListener("click", async () => {
    try { await goToAdmin(); } catch (err) { console.error(err); showAlert("Erreur admin / API."); }
  });

  // MISSION
  $("btnMissionDone").addEventListener("click", async () => {
    try { await markMissionDone(); } catch (err) { console.error(err); showAlert("Erreur API."); }
  });

  $("btnGoGuessFromMission").addEventListener("click", () => {
    try { goToGuess(); } catch (err) { console.error(err); showAlert("Erreur."); }
  });

  $("btnHomeMission").addEventListener("click", logoutToHome);

  // GUESS
  $("btnHomeGuess").addEventListener("click", logoutToHome);

  $("formGuess").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await submitGuess(); } catch (err) { console.error(err); showAlert("Erreur API."); }
  });

  // ADMIN
  $("btnHomeAdmin").addEventListener("click", logoutToHome);
  $("btnRefreshAdmin").addEventListener("click", async () => {
    try { await refreshAdmin(); } catch (err) { console.error(err); showAlert("Erreur API."); }
  });
}

/***********************
 * INIT
 ***********************/
async function init() {
  wireEvents();
  showView("viewHome");

  // Load players once at startup (for autocomplete + robust matching)
  try {
    await loadPlayers();
  } catch (err) {
    console.error(err);
    showAlert("API inaccessible (Render). Le site s’affiche, mais rien ne fonctionnera sans l’API.");
  }
}

init();
