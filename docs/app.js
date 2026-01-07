/***********************
 * CONFIG
 ***********************/
const API_BASE = "https://killergame-pauline25.onrender.com";
const ADMIN_NAME = "Lucas";
const ADMIN_PASSWORD = "Veiga";
const MISSION_TIMEOUT_SEC = 10;

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
  list: [],            // [{id, display}, ...]
  byDisplay: new Map() // display -> player
};

let countdownTimer = null;
let countdownRemaining = MISSION_TIMEOUT_SEC;

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

function stopCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

function showView(viewId) {
  // ✅ Timer uniquement sur l'écran mission
  if (viewId !== "viewMission") stopCountdown();

  const views = ["viewHome", "viewMission", "viewGuess", "viewAdmin"];
  for (const v of views) {
    const el = $(v);
    if (el) el.classList.toggle("hidden", v !== viewId);
  }
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
async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: "GET" });
  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(`GET ${path} failed (${res.status}): ${txt}`);
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
    throw new Error(`POST ${path} failed (${res.status}): ${txt}`);
  }
  return res.json();
}

/***********************
 * PLAYERS (DATALIST)
 ***********************/
function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadPlayers() {
  const data = await apiGet("/api/players");
  playersIndex.list = Array.isArray(data) ? data : [];
  playersIndex.byDisplay = new Map();

  for (const p of playersIndex.list) {
    if (p && p.display) playersIndex.byDisplay.set(p.display, p);
  }

  const dl = $("playersDatalist");
  if (!dl) throw new Error("Missing <datalist id='playersDatalist'> in index.html");

  dl.innerHTML = playersIndex.list
    .map(p => `<option value="${escapeHtml(p.display)}"></option>`)
    .join("");
}

function resolvePlayerDisplay(inputText) {
  const raw = (inputText || "").trim();
  if (!raw) return null;

  if (playersIndex.byDisplay.has(raw)) return playersIndex.byDisplay.get(raw);

  const n = normalize(raw);
  const candidates = playersIndex.list.filter(p => normalize(p.display) === n);
  if (candidates.length === 1) return candidates[0];

  return null;
}

/***********************
 * COUNTDOWN (MISSION ONLY)
 ***********************/
function startCountdown(seconds = MISSION_TIMEOUT_SEC) {
  stopCountdown();
  countdownRemaining = seconds;
  const el = $("countdown");
  if (el) el.textContent = String(countdownRemaining);

  countdownTimer = setInterval(() => {
    countdownRemaining -= 1;
    if (el) el.textContent = String(Math.max(0, countdownRemaining));
    if (countdownRemaining <= 0) {
      logoutToHome();
    }
  }, 1000);
}

/***********************
 * NAV / SESSION
 ***********************/
function logoutToHome() {
  stopCountdown();
  session = { player: null, mission: null, target: null, missionDone: false };

  if ($("inputName")) $("inputName").value = "";
  if ($("killerInput")) $("killerInput").value = "";
  if ($("guessMission")) $("guessMission").value = "";

  if ($("guessStatus")) $("guessStatus").textContent = "";
  if ($("missionStatus")) $("missionStatus").textContent = "";
  if ($("adminStatus")) $("adminStatus").textContent = "";
  if ($("adminPass")) $("adminPass").value = "";

  showView("viewHome");
}

/***********************
 * MISSION FLOW
 ***********************/
async function loginAndFetchMission(displayName) {
  clearAlert();

  if (!playersIndex.list.length) await loadPlayers();

  const player = resolvePlayerDisplay(displayName);
  if (!player) {
    showAlert("Choisis un nom valide dans la liste déroulante (pas de saisie approximative).");
    return;
  }

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
  showView("viewMission");
  startCountdown(MISSION_TIMEOUT_SEC);
}

function renderMissionScreen() {
  if ($("whoami")) $("whoami").textContent = session.player ? `Connecté : ${session.player.display}` : "";
  if ($("missionText")) $("missionText").textContent = session.mission?.text || "—";
  if ($("targetText")) $("targetText").textContent = session.target?.display || "—";

  if ($("missionStatus")) {
    $("missionStatus").textContent = session.missionDone
      ? "Statut : mission déjà déclarée comme réalisée ✅"
      : "Statut : mission non déclarée (pour l’instant).";
  }

  const isAdmin = session.player && session.player.display === ADMIN_NAME;
  const adminBox = $("adminBox");
  if (adminBox) adminBox.classList.toggle("hidden", !isAdmin);

  if ($("adminPass")) $("adminPass").value = "";
  if ($("adminStatus")) $("adminStatus").textContent = "";
}

/***********************
 * MISSION DONE
 ***********************/
async function markMissionDone() {
  clearAlert();
  if (!session.player) {
    showAlert("Session expirée. Reviens à l’accueil et reconnecte-toi.");
    logoutToHome();
    return;
  }

  if ($("missionStatus")) $("missionStatus").textContent = "Enregistrement…";

  const resp = await apiPost("/api/mission_done", { player_id: session.player.id });
  if (resp?.ok === false) {
    showAlert(resp?.error || "Erreur lors de la validation.");
    if ($("missionStatus")) $("missionStatus").textContent = "";
    return;
  }

  session.missionDone = true;
  renderMissionScreen();
}

/***********************
 * GUESS FLOW
 ***********************/
function goToGuess() {
  clearAlert();
  if (!session.player) {
    showAlert("Tu dois d’abord te connecter pour faire un guess.");
    showView("viewHome");
    return;
  }
  if ($("guessStatus")) $("guessStatus").textContent = "";
  showView("viewGuess"); // stopCountdown auto via showView
}

async function submitGuess() {
  clearAlert();
  if (!session.player) {
    showAlert("Session expirée. Reviens à l’accueil et reconnecte-toi.");
    logoutToHome();
    return;
  }

  const accused = resolvePlayerDisplay($("killerInput")?.value || "");
  if (!accused) {
    showAlert("Choisis un killer valide dans la liste déroulante.");
    return;
  }

  const guessedMission = ($("guessMission")?.value || "").trim();
  if (!guessedMission) {
    showAlert("Décris la mission devinée.");
    return;
  }

  if (accused.id === session.player.id) {
    showAlert("Tu ne peux pas t’accuser toi-même 😉");
    return;
  }

  if ($("guessStatus")) $("guessStatus").textContent = "Envoi du guess…";

  const resp = await apiPost("/api/guess", {
    player_id: session.player.id,
    accused_killer_id: accused.id,
    guessed_mission: guessedMission,
  });

  if (resp?.ok === false) {
    if ($("guessStatus")) $("guessStatus").textContent = "";
    showAlert(resp?.error || "Erreur lors de l’enregistrement du guess.");
    return;
  }

  if ($("guessStatus")) $("guessStatus").textContent = "Guess enregistré ✅";
}

/***********************
 * ADMIN (Lucas + password)
 ***********************/
async function unlockAdmin() {
  clearAlert();
  if (!session.player || session.player.display !== ADMIN_NAME) {
    showAlert("Accès refusé.");
    return;
  }

  const pass = ($("adminPass")?.value || "").trim();
  if (pass !== ADMIN_PASSWORD) {
    if ($("adminStatus")) $("adminStatus").textContent = "Mot de passe incorrect ❌";
    return;
  }

  if ($("adminStatus")) $("adminStatus").textContent = "Accès autorisé ✅";
  showView("viewAdmin"); // stopCountdown auto via showView
  await refreshAdmin();
}

async function refreshAdmin() {
  clearAlert();
  const tbody = $("adminTbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="muted">Chargement…</td></tr>`;

  const data = await apiGet("/api/leaderboard");
  const rows = Array.isArray(data) ? data : [];

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Aucune donnée.</td></tr>`;
    return;
  }

  const yesNo = (b) => (b ? "Oui" : "Non");

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.display ?? "—")}</td>
      <td>${escapeHtml(String(r.points ?? 0))}</td>
      <td>${escapeHtml(yesNo(!!r.mission_done))}</td>
      <td>${escapeHtml(yesNo(!!r.discovered_by_target))}</td>
      <td>${escapeHtml(yesNo(!!r.found_killer))}</td>
      <td>${escapeHtml(r.guess_killer_display ?? "—")}</td>
      <td>${escapeHtml(r.guess_mission ?? "—")}</td>
    </tr>
  `).join("");
}

async function resetStateFromAdmin() {
  clearAlert();
  const ok = confirm("⚠️ Reset état du jeu ? (missions_done/guesses/points seront remis à zéro)");
  if (!ok) return;

  try {
    const resp = await apiPost("/api/admin/reset", { password: ADMIN_PASSWORD });
    if (resp?.ok === false) {
      showAlert(resp?.error || "Reset impossible.");
      return;
    }
    showAlert("État reset ✅");
    await refreshAdmin();
  } catch (err) {
    console.error(err);
    showAlert("Erreur reset (API).");
  }
}

/***********************
 * WIRING
 ***********************/
function wireEvents() {
  $("btnHomeHeader")?.addEventListener("click", logoutToHome);

  $("formLogin")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await loginAndFetchMission($("inputName")?.value || "");
    } catch (err) {
      console.error(err);
      showAlert("Impossible de joindre le serveur (API). Vérifie Render / CORS.");
    }
  });

  $("btnMissionDone")?.addEventListener("click", async () => {
    try { await markMissionDone(); }
    catch (err) { console.error(err); showAlert("Erreur API."); }
  });

  $("btnGoGuessFromMission")?.addEventListener("click", () => {
    try { goToGuess(); }
    catch (err) { console.error(err); showAlert("Erreur."); }
  });

  $("btnHomeMission")?.addEventListener("click", logoutToHome);

  $("btnAdminUnlock")?.addEventListener("click", async () => {
    try { await unlockAdmin(); }
    catch (err) { console.error(err); showAlert("Erreur admin / API."); }
  });

  $("btnHomeGuess")?.addEventListener("click", logoutToHome);

  $("formGuess")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await submitGuess(); }
    catch (err) { console.error(err); showAlert("Erreur API."); }
  });

  $("btnHomeAdmin")?.addEventListener("click", logoutToHome);

  $("btnRefreshAdmin")?.addEventListener("click", async () => {
    try { await refreshAdmin(); }
    catch (err) { console.error(err); showAlert("Erreur API."); }
  });

  $("btnResetState")?.addEventListener("click", resetStateFromAdmin);

  // BONUS: si tu veux éviter de te faire logout pendant que tu tapes le mdp admin sur l'écran mission
  $("adminPass")?.addEventListener("focus", stopCountdown);
  $("adminPass")?.addEventListener("input", stopCountdown);
}

/***********************
 * INIT
 ***********************/
async function init() {
  wireEvents();
  showView("viewHome");

  try {
    await loadPlayers();
  } catch (err) {
    console.error(err);
    showAlert("API inaccessible : impossible de charger la liste des joueurs.");
  }
}

init();
