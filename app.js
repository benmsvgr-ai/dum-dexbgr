
const SHEET_ID = window.BOGORDEX_MASTER_SHEET_ID || "1PcKcAJ0d8eco6gonlSxwffzmqEl-FjAsJ2tbxctzdnU";
const GAS_URL = window.BOGORDEX_GAS_URL || "";
const SHEETS = {
  lokasi: window.BOGORDEX_MASTER_SHEET_LOKASI || "MASTER_LOKASI",
  quest: window.BOGORDEX_MASTER_SHEET_QUEST || "MASTER_QUEST",
  badge: window.BOGORDEX_MASTER_SHEET_BADGE || "MASTER_BADGE"
};
window.addEventListener("error", (ev) => {
  try {
    const el = document.getElementById("statusText");
    if (el && ev && ev.message) el.textContent = "Error: " + ev.message;
  } catch(_){}
});

function sheetUrl(sheetName){
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tqx=out:json`;
}

const state = {
  gpsBase: [106.79884, -6.59725],
  offsetMeters: { x: 0, y: 0 },
  playerWorld: [106.79884, -6.59725],
  hasRealGps: false,
  geoWatch: null,
  gpsSmooth: null,
  gpsLastAt: 0,
  move: { up:false, down:false, left:false, right:false },
  manualMoveKey: '',
  manualMoveBaseBearing: null,
  manualMoveTargetBearing: null,
  moveSpeedMeters: 28.0,
  gpsAcceptedAt: 0,
  gpsLastAccepted: null,
  cameraFollowLastAt: 0,
  playerMarker: null,
  playerMarkerEl: null,
  playerFrameTick: 0,
  playerStepFrame: 0,
  collisionEnabled: true,
  roadOnlyMode: false,
  roadRadiusPx: 74,
  collisionRadiusPx: 36,
  collisionCooldown: 0,
  maxOffsetMeters: 1800,
  renderRadiusMeters: 820,
  renderBoundsCenter: null,
  gpsPrevWorld: null,
  gpsMovingUntil: 0,
  facing: "down",
  pois: [],
  quests: [],
  badges: [],
  completedQuests: new Set(),
  unlockedBadges: new Set(),
  playerProgress: {
    level: 1,
    exp: 0,
    coin: 0
  },
  activePoiId: null,
  activePoiMode: null,
  activeQuestPoiId: null,
  portalNoticeRadiusMeters: 36,
  portalSeenIds: new Set(),
  portalDismissedIds: new Set(),
  visitedPortals: new Set(),
  completedPortals: new Set(),
  lastPortalNoticeId: null,
  lastPortalNoticeAt: 0,
  portalNoticeCooldownMs: 14000,
  deviceHeadingEnabled: false,
  deviceHeadingBearing: null,
  deviceHeadingLastAt: 0,
  deviceHeadingRaw: null,
  deviceHeadingSmooth: null,
  headingCameraLastAt: 0,
  lastCameraCenter: null,
  compassRequested: false,
  lastPoi: null,
  discovered: new Set(),
  layers: { transit:true, gov:true, health:true, umkm:true },
  browsing: false,
  snapTimer: null,
  portalPulse: 0,
  activeNpcId: null,
  npcQuestCount: 0,
  reportMarkers: [],
  userReports: [],
  npcMarkers: [],
  eventMarkers: [],
  eventPortals: [],
  navigationTarget: null,
  navigationRouteCoords: null,
  navigationRouteRawCoords: null,
  navigationArrived: false,
  navigationIsBuilding: false,
  osrmNearestPending: false,
  osrmLastNearestAt: 0,
  osrmLastNearestCoord: null,
  osrmRouteRequestAt: 0,
  npcs: []
};

state.environment = {
  lastFetchAt: 0,
  lastFetchCoords: null,
  timezone: "Asia/Jakarta",
  temperature: 26,
  description: "Cerah Berawan",
  icon: "⛅",
  weatherCode: null,
  isDay: true,
  raining: false
};

const PORTAL_POPUP_DONE_KEY = "bogordex_portal_popup_done_v47";
function loadPortalPopupDone(){
  try{
    const raw = localStorage.getItem(PORTAL_POPUP_DONE_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    if(Array.isArray(ids)){
      state.portalSeenIds = new Set(ids);
      state.portalDismissedIds = new Set(ids);
    }
  }catch(e){}
}
function savePortalPopupDone(){
  try{
    const ids = Array.from(new Set([
      ...Array.from(state.portalSeenIds || []),
      ...Array.from(state.portalDismissedIds || [])
    ]));
    localStorage.setItem(PORTAL_POPUP_DONE_KEY, JSON.stringify(ids));
  }catch(e){}
}
function markPortalPopupDone(id){
  if(!id) return;
  state.portalSeenIds.add(id);
  state.portalDismissedIds.add(id);
  savePortalPopupDone();
}
loadPortalPopupDone();


const GAS_QUEUE_KEY = "bogordex_gas_queue_v1";
function loadGasQueue(){
  try{ return JSON.parse(localStorage.getItem(GAS_QUEUE_KEY) || "[]"); }catch(e){ return []; }
}
function saveGasQueue(items){
  try{ localStorage.setItem(GAS_QUEUE_KEY, JSON.stringify((items || []).slice(-200))); }catch(e){}
}
function enqueueGas(action, payload){
  const items = loadGasQueue();
  items.push({ action, payload, at:new Date().toISOString() });
  saveGasQueue(items);
}
async function postToGas(action, payload, keepQueue=true){
  if(!GAS_URL) return false;
  const body = JSON.stringify({ action, payload, sent_at:new Date().toISOString() });
  try{
    await fetch(GAS_URL, {
      method:"POST",
      mode:"no-cors",
      cache:"no-store",
      headers:{ "Content-Type":"text/plain;charset=utf-8" },
      body
    });
    return true;
  }catch(err){
    if(keepQueue) enqueueGas(action, payload);
    return false;
  }
}
async function flushGasQueue(){
  if(!GAS_URL) return;
  const items = loadGasQueue();
  if(!items.length) return;
  const rest = [];
  for(const item of items){
    const ok = await postToGas(item.action, item.payload, false);
    if(!ok) rest.push(item);
  }
  saveGasQueue(rest);
}
function currentPlayerId(){
  let id = localStorage.getItem("bogordex_player_id");
  if(!id){
    id = "PLY-" + Math.random().toString(36).slice(2,10).toUpperCase();
    localStorage.setItem("bogordex_player_id", id);
  }
  return id;
}
function currentPlayerName(){ return "BogorDex Ranger"; }
async function syncPlayerProgressToGas(){
  const payload = {
    player_id: currentPlayerId(),
    nama_player: currentPlayerName(),
    level_player: Number(state.playerProgress?.level || 1),
    total_exp: Number(state.playerProgress?.exp || 0),
    total_coin: Number(state.playerProgress?.coin || 0),
    total_badge: state.unlockedBadges.size,
    total_lokasi_ditemukan: state.discovered.size,
    total_quest_selesai: state.completedQuests.size,
    total_laporan_dibuat: Array.isArray(state.userReports) ? state.userReports.length : 0,
    last_latitude: Number(state.playerWorld?.[1] || 0),
    last_longitude: Number(state.playerWorld?.[0] || 0),
    last_login: new Date().toISOString(),
    status_player: "aktif",
    updated_at: new Date().toISOString()
  };
  return postToGas("upsert_player_progress", payload);
}
async function syncDiscoveryToGas(poi){
  if(!poi) return false;
  return postToGas("append_discovery", {
    id_discovery: "DSC-" + Date.now(),
    player_id: currentPlayerId(),
    id_lokasi: poi.id || "",
    nama_lokasi: poi.name || "",
    kategori: poi.group || "",
    waktu_ditemukan: new Date().toISOString(),
    reward_exp: Number(poi.rewardExp || 0),
    reward_coin: Number(poi.rewardCoin || 0),
    status_discovery: "ditemukan",
    catatan: "auto dari game"
  });
}
async function syncBadgeToGas(badgeId){
  const badge = getBadgeById(badgeId);
  if(!badge) return false;
  return postToGas("append_badge", {
    id_player_badge: "PBD-" + Date.now(),
    player_id: currentPlayerId(),
    id_badge: badge.id,
    nama_badge: badge.name,
    waktu_didapat: new Date().toISOString(),
    reward_exp_bonus: Number(badge.bonusExp || 0),
    status_badge: "aktif",
    catatan: "auto dari game"
  });
}
async function syncReportToGas(report){
  if(!report) return false;
  return postToGas("append_report", {
    id_report: report.id,
    player_id: currentPlayerId(),
    nama_player: currentPlayerName(),
    waktu_lapor: report.createdAt || new Date().toISOString(),
    kategori_laporan: String(report.category || "lainnya").toUpperCase(),
    subkategori_laporan: String(report.category || "lainnya").toUpperCase(),
    judul_laporan: "Laporan Warga BogorDex",
    deskripsi_laporan: report.note || "Info titik dari user",
    latitude: Number(report.coords?.[1] || 0),
    longitude: Number(report.coords?.[0] || 0),
    alamat: report.address || "",
    status_laporan: "baru",
    sumber_laporan: "game",
    foto_url: "",
    reward_exp: Number(report.reward_exp || 30),
    reward_coin: Number(report.reward_coin || 5),
    validasi_admin: "TIDAK",
    catatan_admin: "",
    ditampilkan_di_map: "YA",
    updated_at: new Date().toISOString()
  });
}

const PLAYER_PROGRESS_KEY = "bogordex_player_progress_v69";
function levelFromExp(exp){
  const n = Number(exp || 0);
  if(n >= 1200) return 8;
  if(n >= 900) return 7;
  if(n >= 650) return 6;
  if(n >= 450) return 5;
  if(n >= 280) return 4;
  if(n >= 160) return 3;
  if(n >= 80) return 2;
  return 1;
}
function ensureDailyStepDate(){
  const today = new Date().toISOString().slice(0,10);
  if(state.dailyStepDate !== today){
    state.dailyStepDate = today;
    state.dailyWalkMeters = 0;
    state.dailySteps = 0;
  }
}
function addDailyMovementMeters(meters){
  const m = Number(meters || 0);
  if(!Number.isFinite(m) || m <= 0 || m > 80) return;
  ensureDailyStepDate();
  state.dailyWalkMeters = Math.max(0, Number(state.dailyWalkMeters || 0) + m);
  state.dailySteps = Math.round(state.dailyWalkMeters / 0.72);
}
function dailyStepsText(){
  ensureDailyStepDate();
  return `${Math.max(0, Math.round(Number(state.dailySteps || 0))).toLocaleString('id-ID')} langkah`;
}
function savePlayerProgress(){
  try{
    localStorage.setItem(PLAYER_PROGRESS_KEY, JSON.stringify({
      discovered: Array.from(state.discovered || []),
      visitedPortals: Array.from(state.visitedPortals || []),
      completedPortals: Array.from(state.completedPortals || []),
      completedQuests: Array.from(state.completedQuests || []),
      unlockedBadges: Array.from(state.unlockedBadges || []),
      playerProgress: state.playerProgress || { level:1, exp:0, coin:0 },
      dailyStepDate: state.dailyStepDate || new Date().toISOString().slice(0,10),
      dailyWalkMeters: Number(state.dailyWalkMeters || 0),
      dailySteps: Number(state.dailySteps || 0)
    }));
  }catch(e){}
}
function syncPlayerProfileFromProgress(){
  const exp = Number(state.playerProgress?.exp || 0);
  const coin = Number(state.playerProgress?.coin || 0);
  const level = levelFromExp(exp);
  state.playerProgress.level = level;
  PLAYER_PROFILE.level = level;
  PLAYER_PROFILE.status = "BogorDex Ranger";
  PLAYER_PROFILE.mode = "Road Patrol";
  PLAYER_PROFILE.summary = `Explorer level ${level}. EXP ${exp} • Coin ${coin} • ${dailyStepsText()} hari ini • ${state.discovered.size} lokasi ditemukan • ${state.completedQuests.size} quest selesai • ${state.unlockedBadges.size} badge terbuka.`;
  updateTopHud();
}
function loadPlayerProgress(){
  try{
    const raw = localStorage.getItem(PLAYER_PROGRESS_KEY);
    if(!raw){
      syncPlayerProfileFromProgress();
      return;
    }
    const parsed = JSON.parse(raw);
    state.discovered = new Set(Array.isArray(parsed.discovered) ? parsed.discovered : []);
    state.visitedPortals = new Set(Array.isArray(parsed.visitedPortals) ? parsed.visitedPortals : []);
    state.completedPortals = new Set(Array.isArray(parsed.completedPortals) ? parsed.completedPortals : []);
    state.completedQuests = new Set(Array.isArray(parsed.completedQuests) ? parsed.completedQuests : []);
    state.unlockedBadges = new Set(Array.isArray(parsed.unlockedBadges) ? parsed.unlockedBadges : []);
    state.playerProgress = Object.assign({ level:1, exp:0, coin:0 }, parsed.playerProgress || {});
    state.dailyStepDate = parsed.dailyStepDate || new Date().toISOString().slice(0,10);
    state.dailyWalkMeters = Number(parsed.dailyWalkMeters || 0);
    state.dailySteps = Number(parsed.dailySteps || 0);
  }catch(e){}
  syncPlayerProfileFromProgress();
}

function rowToObject(cols, row){
  const obj = {};
  cols.forEach((col, i) => { obj[String(col || "").trim()] = row[i] ?? ""; });
  return obj;
}
function parseTruthy(value){
  const v = String(value ?? "").trim().toUpperCase();
  return ["YA","Y","TRUE","1","AKTIF"].includes(v);
}
function colorFromKategori(kat){
  const k = String(kat || "").toUpperCase();
  if(k.includes("HALTE") || k.includes("TRANSPORT")) return "#4b84ff";
  if(k.includes("KESEHATAN") || k.includes("RUMAH_SAKIT") || k.includes("PUSKESMAS")) return "#8d7bff";
  if(k.includes("UMKM")) return "#f7b500";
  if(k.includes("WISATA") || k.includes("TAMAN")) return "#38c172";
  return "#ff6475";
}
function getQuestById(id){
  return state.quests.find(q => q.id === id) || null;
}
function getBadgeById(id){
  return state.badges.find(b => b.id === id) || null;
}
function badgeLabel(id){
  const badge = getBadgeById(id);
  return badge ? `${badge.icon || "🏅"} ${badge.name}` : "";
}
function questRewardText(quest){
  if(!quest) return "";
  const parts = [];
  if(Number(quest.rewardExp || 0) > 0) parts.push(`+${Number(quest.rewardExp)} EXP`);
  if(Number(quest.rewardCoin || 0) > 0) parts.push(`+${Number(quest.rewardCoin)} Coin`);
  if(quest.rewardBadgeId){
    const lbl = badgeLabel(quest.rewardBadgeId);
    if(lbl) parts.push(lbl);
  }
  return parts.join(" • ");
}
function poiRewardText(poi){
  if(!poi) return "";
  const parts = [];
  if(Number(poi.rewardExp || 0) > 0) parts.push(`+${Number(poi.rewardExp)} EXP`);
  if(Number(poi.rewardCoin || 0) > 0) parts.push(`+${Number(poi.rewardCoin)} Coin`);
  if(poi.rewardBadgeId){
    const lbl = badgeLabel(poi.rewardBadgeId);
    if(lbl) parts.push(lbl);
  }
  return parts.join(" • ");
}
function portalStatusCode(poi){
  if(!poi || !poi.id) return 'undiscovered';
  if(state.completedPortals.has(poi.id) || (poi.questId && state.completedQuests.has(poi.questId))) return 'completed';
  if(state.visitedPortals.has(poi.id)) return 'visited';
  if(state.discovered.has(poi.id)) return 'discovered';
  return 'undiscovered';
}
function portalStatusLabel(statusOrPoi){
  const status = typeof statusOrPoi === 'string' ? statusOrPoi : portalStatusCode(statusOrPoi);
  if(status === 'completed') return 'Completed';
  if(status === 'visited') return 'Visited';
  if(status === 'discovered') return 'Discovered';
  return 'Belum Dibuka';
}
function portalStatusBadgeHtml(poi){
  const status = portalStatusCode(poi);
  return `<span class="portal-status-pill ${status}">${portalStatusLabel(status)}</span>`;
}
function portalDistanceText(poi){
  if(!poi || !Array.isArray(poi.coords) || !Array.isArray(state.playerWorld)) return '—';
  return `${Math.max(1, Math.round(haversineMeters(state.playerWorld, poi.coords)))} m`;
}
function portalRadiusValue(poi){
  const raw = Number(poi?.radius || state.portalNoticeRadiusMeters || 30);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 30;
}
function portalRewardSummary(poi, quest){
  const lines = [];
  const reward = poiRewardText(poi);
  if(reward) lines.push(reward);
  if(quest){
    const q = questRewardText(quest);
    if(q) lines.push(`Quest: ${q}`);
  }
  return lines;
}
function markPortalVisited(poi, silent=false){
  if(!poi || !poi.id || state.visitedPortals.has(poi.id)) return false;
  state.visitedPortals.add(poi.id);
  savePlayerProgress();
  if(!silent){
    showAnimeToast('event', `Portal dikunjungi`, poi.name || 'Portal BogorDex', ['Status: Visited']);
    updateStatus(`Portal dikunjungi: ${poi.name || 'Portal'}`);
  }
  return true;
}
function markPortalCompleted(poi, silent=false){
  if(!poi || !poi.id || state.completedPortals.has(poi.id)) return false;
  state.completedPortals.add(poi.id);
  if(poi.questId){
    const quest = getQuestById(poi.questId);
    if(quest) maybeCompleteQuest(quest);
  }
  savePlayerProgress();
  if(!silent){
    showRewardBanner('Portal Clear', poi.name || 'Portal', 'Status portal sekarang completed', 2400);
    showAnimeToast('event', 'Portal selesai', poi.name || 'Portal BogorDex', ['Status: Completed']);
    updateStatus(`Portal selesai: ${poi.name || 'Portal'}`);
  }
  return true;
}
function maybeNotifyPortalFound(poi, dist){
  if(!poi || !poi.id) return;
  const now = Date.now();
  if(state.lastPortalNoticeId === poi.id && (now - state.lastPortalNoticeAt) < (state.portalNoticeCooldownMs || 12000)) return;
  state.lastPortalNoticeId = poi.id;
  state.lastPortalNoticeAt = now;
  const meters = `${Math.max(1, Math.round(dist || 0))} m`;
  showAnimeToast('event', 'Portal ditemukan', poi.name || 'Portal BogorDex', [meters, 'Masuk MapDex']);
}
function unlockBadge(id){
  if(!id || state.unlockedBadges.has(id)) return false;
  state.unlockedBadges.add(id);
  const badge = getBadgeById(id);
  if(badge && Number(badge.bonusExp || 0) > 0){
    state.playerProgress.exp += Number(badge.bonusExp || 0);
  }
  syncPlayerProfileFromProgress();
  savePlayerProgress();
  syncBadgeToGas(id);
  syncPlayerProgressToGas();
  if(badge){
    showAnimeToast('badge', `Badge terbuka: ${badge.icon || '🏅'} ${badge.name}`, badge.desc || 'Badge baru berhasil didapat', [badge.rarity || 'umum', Number(badge.bonusExp || 0) > 0 ? `+${Number(badge.bonusExp || 0)} EXP Bonus` : 'Koleksi baru']);
    showRewardBanner('Badge Baru', `${badge.icon || '🏅'} ${badge.name}`, badge.desc || 'Selamat, badge kamu bertambah!', 2800);
  }
  return true;
}
function countDiscoveredByFilter(quest){
  return state.pois.filter(poi => {
    if(!state.discovered.has(poi.id)) return false;
    if(quest.targetType === "lokasi") return poi.id === quest.targetLokasi;
    if(quest.targetType === "subkategori") return String(poi.subkategori || "").toUpperCase() === String(quest.targetSubkategori || "").toUpperCase();
    if(quest.targetType === "kategori") return String(poi.group || "").toUpperCase() === String(quest.targetKategori || "").toUpperCase();
    if(quest.targetKategori && String(poi.group || "").toUpperCase() !== String(quest.targetKategori || "").toUpperCase()) return false;
    if(quest.targetSubkategori && String(poi.subkategori || "").toUpperCase() !== String(quest.targetSubkategori || "").toUpperCase()) return false;
    return true;
  }).length;
}
function maybeCompleteQuest(quest){
  if(!quest || state.completedQuests.has(quest.id)) return false;
  const count = countDiscoveredByFilter(quest);
  if(count < Number(quest.targetJumlah || 1)) return false;
  state.completedQuests.add(quest.id);
  state.playerProgress.exp += Number(quest.rewardExp || 0);
  state.playerProgress.coin += Number(quest.rewardCoin || 0);
  unlockBadge(quest.rewardBadgeId);
  syncPlayerProfileFromProgress();
  savePlayerProgress();
  syncPlayerProgressToGas();
  showAnimeToast('quest', `Quest selesai: ${quest.name}`, quest.desc || 'Misi berhasil diselesaikan', [Number(quest.rewardExp || 0) > 0 ? `+${Number(quest.rewardExp || 0)} EXP` : '', Number(quest.rewardCoin || 0) > 0 ? `+${Number(quest.rewardCoin || 0)} Coin` : '', quest.rewardBadgeId ? badgeLabel(quest.rewardBadgeId) : ''].filter(Boolean));
  showRewardBanner('Quest Clear', quest.name, 'Reward quest sudah masuk ke karakter kamu', 2700);
  return true;
}
function evaluateQuestProgressForPoi(poi){
  const completed = [];
  for(const quest of state.quests){
    if(!quest || state.completedQuests.has(quest.id)) continue;
    let relevant = false;
    if(quest.targetType === "lokasi" && quest.targetLokasi === poi.id) relevant = true;
    if(quest.targetType === "subkategori" && String(quest.targetSubkategori || "").toUpperCase() === String(poi.subkategori || "").toUpperCase()) relevant = true;
    if(quest.targetType === "kategori" && String(quest.targetKategori || "").toUpperCase() === String(poi.group || "").toUpperCase()) relevant = true;
    if(!relevant && quest.targetKategori && String(quest.targetKategori || "").toUpperCase() === String(poi.group || "").toUpperCase()) relevant = true;
    if(!relevant) continue;
    if(maybeCompleteQuest(quest)) completed.push(quest);
  }
  return completed;
}
function markPoiDiscovered(poi){
  if(!poi || !poi.id || state.discovered.has(poi.id)) return false;
  state.discovered.add(poi.id);
  state.playerProgress.exp += Number(poi.rewardExp || 0);
  state.playerProgress.coin += Number(poi.rewardCoin || 0);
  unlockBadge(poi.rewardBadgeId);
  const completed = evaluateQuestProgressForPoi(poi);
  syncPlayerProfileFromProgress();
  savePlayerProgress();
  syncDiscoveryToGas(poi);
  syncPlayerProgressToGas();
  renderDex();
  const rewardLines = [
    Number(poi.rewardExp || 0) > 0 ? `+${Number(poi.rewardExp || 0)} EXP` : '',
    Number(poi.rewardCoin || 0) > 0 ? `+${Number(poi.rewardCoin || 0)} Coin` : '',
    poi.rewardBadgeId ? badgeLabel(poi.rewardBadgeId) : '',
    completed.length ? `Quest: ${completed.map(q => q.name).join(', ')}` : ''
  ].filter(Boolean);
  showAnimeToast('reward', `Lokasi baru: ${poi.name}`, poi.group || poi.subkategori || 'Lokasi BogorDex', rewardLines);
  showRewardBanner('Lokasi Terbuka', poi.name, rewardLines[0] || 'Dex bertambah!', 2200);
  const summary = rewardLines.join(' • ');
  updateStatus(`${poi.name} ditemukan${summary ? " • " + summary : ""}`);
  return true;
}

const statusEl = () => document.getElementById("statusText");
const sheetEl = () => document.getElementById("bottomSheet");
const playerSprite = () => document.getElementById("playerSpriteMap") || document.getElementById("playerSprite");


const RUBO = {
  kaget: "assets/rubo/KAGET-RUBO.png",
  kecewa: "assets/rubo/KECEWA-RUBO.png",
  marah: "assets/rubo/MARAH-RUBO.png",
  ngambek: "assets/rubo/NGAMBEK-RUBO.png",
  sedih: "assets/rubo/SEDIH-RUBO.png",
  serius: "assets/rubo/SERIUS-RUBO.png"
};
function ruboImg(key){ return RUBO[key] || RUBO.serius; }
function setRuboEmotion(key='serius', title='RUBO siap bantu!', text='Jelajahi Bogor dan bantu warga lewat laporan titik.') {
  // v115: floating RUBO popup under HUD is permanently disabled.
  return;
}
function hideRuboAssistant(){ document.getElementById('ruboAssistant')?.classList.add('hidden'); }
function setupSafeMapDragControls(){
  // v121: map dipakai untuk rotate kiri/kanan, bukan pan bebas.
  if(state.__safeMapDragBound) return;
  state.__safeMapDragBound = true;
  if(map){
    try{ map.dragPan.disable(); }catch(err){}
    try{ map.dragRotate.enable(); }catch(err){}
    try{ map.touchZoomRotate.enable(); }catch(err){}
    try{ map.touchZoomRotate.enableRotation(); }catch(err){}
  }
  setupSimpleMapRotateDrag();
}
function setupSimpleMapRotateDrag(){
  if(!map || state.__simpleRotateBound) return;
  state.__simpleRotateBound = true;
  const canvas = map.getCanvas();
  let rotating = false;
  let startX = 0;
  let startBearing = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if(e.button !== 0) return;
    const target = e.target;
    if(target && target.closest && target.closest('button,.bottom-nav,.modal,.bottom-sheet,.nav-center-banner,.top-status,.weather-chip,.coin-pill,.chat-toggle,.player-hud')) return;
    rotating = true;
    startX = e.clientX;
    startBearing = getCameraBearing();
    try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
  });
  canvas.addEventListener('pointermove', (e) => {
    if(!rotating) return;
    const dx = e.clientX - startX;
    const bearing = normalizeHeading(startBearing + dx * 0.35);
    try{ map.easeTo({ bearing, pitch: CAMERA_PITCH, duration:0 }); }catch(err){}
  });
  const stop = (e) => {
    if(!rotating) return;
    rotating = false;
    try{ canvas.releasePointerCapture(e.pointerId); }catch(err){}
    followPlayerCamera({ bearing:getCameraBearing(), duration:140, force:true });
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
}


function toastStackEl(){ return document.getElementById("animeToastStack"); }
function rewardBannerEl(){ return document.getElementById("rewardBanner"); }
function navBannerEl(){ return document.getElementById("navCenterBanner"); }
function showAnimeToast(kind, title, subtitle="", lines=[]){
  const host = toastStackEl();
  if(!host) return;
  const el = document.createElement('div');
  el.className = 'anime-toast ' + (kind || 'reward');
  el.innerHTML = `
    <div class="toast-kicker">${kind === 'badge' ? 'Badge Baru' : kind === 'quest' ? 'Quest Selesai' : kind === 'event' ? 'Event Kota' : 'Reward'}</div>
    <div class="toast-title">${title || 'Notifikasi'}</div>
    ${subtitle ? `<div class="toast-sub">${subtitle}</div>` : ''}
    ${Array.isArray(lines) && lines.length ? `<div class="toast-lines">${lines.filter(Boolean).map(v => `<span class="toast-pill">${v}</span>`).join('')}</div>` : ''}
  `;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, 3200);
}
function showRewardBanner(kicker, title, subtitle='', timeout=2400){
  const el = rewardBannerEl();
  if(!el) return;
  document.getElementById('rewardBannerKicker').textContent = kicker || 'Reward';
  document.getElementById('rewardBannerTitle').textContent = title || 'Reward';
  document.getElementById('rewardBannerSub').textContent = subtitle || '';
  el.classList.remove('hidden');
  clearTimeout(showRewardBanner._timer);
  showRewardBanner._timer = setTimeout(() => el.classList.add('hidden'), timeout);
}
function hideNavBanner(){ const b=navBannerEl(); if(b){ b.classList.add('hidden'); b.classList.remove('active','failed'); } document.body?.classList.remove('navigation-active'); }
function clearNavigationTarget(silent=false){
  state.navigationTarget = null;
  if(map && map.getSource && map.getSource('bdx-navigation-route')){
    try{ map.getSource('bdx-navigation-route').setData({type:'FeatureCollection',features:[]}); }catch(e){}
  }
  state.navigationRouteCoords = null;
  state.navigationRouteRawCoords = null;
  state.navigationArrived = false;
  state.navigationIsBuilding = false;
  state.navigationCameraLastAt = 0;
  state.navigationCameraBearing = null;
  hideNavBanner();
  if(!silent) updateStatus('Arah dibatalkan');
}
window.clearBogorDexNavigation = () => clearNavigationTarget(false);
function updateNavigationUi(){
  const box = navBannerEl();
  if(!box) return;
  if(!state.navigationTarget || !state.navigationTarget.coords || !state.navigationRouteCoords || state.navigationRouteCoords.length < 2){
    box.classList.add('hidden');
    return;
  }
  pushNavigationRouteToMap(state.navigationRouteRawCoords || state.navigationRouteCoords);
  const dist = Math.max(1, Math.round(haversineMeters(state.playerWorld, state.navigationTarget.coords)));
  const turn = getRouteTurnText();
  document.getElementById('navCenterTitle').textContent = state.navigationTarget.title || state.navigationTarget.name || 'Tujuan';
  document.getElementById('navCenterMeta').textContent = dist <= 18 ? `Tujuan sudah sampai` : `Sisa ${dist} m • ${turn}`;
  box.classList.remove('hidden');
  if(dist <= 18 && !state.navigationArrived){
    state.navigationArrived = true;
    showArrivedToast('Kamu sudah sampai di tujuan');
    updateStatus('Tujuan sudah sampai');
  }
  followNavigationCamera(false);
}
function showNavigationBanner(target, subtitle='Rute aktif'){
  if(!target) return;
  const titleEl = document.getElementById('navCenterTitle');
  const metaEl = document.getElementById('navCenterMeta');
  if(titleEl) titleEl.textContent = target.title || target.name || 'Tujuan';
  if(metaEl) metaEl.textContent = subtitle;
  const box = navBannerEl();
  if(box){ box.classList.remove('hidden'); box.classList.add('active'); document.body?.classList.add('navigation-active'); }
}
function showNavigationFail(target){
  const box = navBannerEl();
  if(!box || !target) return;
  document.getElementById('navCenterTitle').textContent = target.title || target.name || 'Tujuan';
  document.getElementById('navCenterMeta').textContent = 'Rute jalan belum tersedia';
  box.classList.remove('hidden');
  box.classList.add('active','failed'); document.body?.classList.add('navigation-active');
  clearTimeout(showNavigationFail._timer);
  showNavigationFail._timer = setTimeout(() => clearNavigationTarget(true), 2600);
}

function getRouteTurnText(){
  const route = state.navigationRouteCoords;
  if(!route || route.length < 2 || !state.playerWorld) return 'Ikuti jalur biru';
  let nearest = 0, best = Infinity;
  for(let i=0;i<route.length;i++){
    const d = haversineMeters(state.playerWorld, route[i]);
    if(d < best){ best = d; nearest = i; }
  }
  const a = route[Math.max(0, nearest-1)] || state.playerWorld;
  const b = route[nearest] || state.playerWorld;
  const c = route[Math.min(route.length-1, nearest+1)] || state.navigationTarget?.coords || b;
  const b1 = bearingBetweenCoords(a,b); const b2 = bearingBetweenCoords(b,c);
  if(b1 == null || b2 == null) return 'Lurus';
  let diff = ((b2 - b1 + 540) % 360) - 180;
  if(Math.abs(diff) < 22) return 'Lurus';
  if(diff > 0) return 'Belok kanan';
  return 'Belok kiri';
}

function getNavigationForwardBearing(){
  if(!state.navigationTarget || !state.playerWorld) return null;
  const raw = state.navigationRouteRawCoords || state.navigationRouteCoords;
  const display = navigationDisplayRouteCoords(raw || []);
  const player = [Number(state.playerWorld[0]), Number(state.playerWorld[1])];
  if(!Array.isArray(display) || display.length < 2 || !Number.isFinite(player[0]) || !Number.isFinite(player[1])){
    return bearingBetweenCoords(player, state.navigationTarget.coords);
  }
  // Ambil titik rute di depan player, bukan titik lama di belakang.
  // Ini bikin kamera menghadap jalur seperti Google Maps saat mode arahkan aktif.
  let targetPoint = null;
  for(let i=1;i<display.length;i++){
    const d = haversineMeters(player, display[i]);
    if(d >= 10){ targetPoint = display[i]; break; }
  }
  if(!targetPoint) targetPoint = display[display.length - 1] || state.navigationTarget.coords;
  return bearingBetweenCoords(player, targetPoint);
}
function followNavigationCamera(force=false){
  if(!map || !state.navigationTarget || !state.navigationRouteCoords || state.navigationRouteCoords.length < 2) return;
  const bearing = getNavigationForwardBearing();
  if(typeof bearing !== 'number' || !Number.isFinite(bearing)) return;
  const now = performance.now();
  const prev = typeof state.navigationCameraBearing === 'number' ? state.navigationCameraBearing : getCameraBearing();
  const diff = Math.abs(shortestHeadingDiff(bearing, prev));
  if(!force && diff < 5 && (now - (state.navigationCameraLastAt || 0)) < 420) return;
  state.navigationCameraBearing = normalizeHeading(prev + shortestHeadingDiff(bearing, prev) * 0.32);
  state.navigationCameraLastAt = now;
  followPlayerCamera({ bearing: state.navigationCameraBearing, zoom: CAMERA_ZOOM, duration: force ? 360 : 180, force:true });
}
function showArrivedToast(text='Tujuan sudah sampai!'){
  let el = document.getElementById('arrivedToast');
  if(!el){
    el = document.createElement('div');
    el.id = 'arrivedToast';
    el.className = 'portal-arrived-toast hidden';
    document.getElementById('app')?.appendChild(el);
  }
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(()=>el.classList.add('hidden'), 2600);
}
function flashEventNotice(title, subtitle=''){
  showRewardBanner('Event Kota', title, subtitle || 'Ada aktivitas baru di sekitar kamu', 2600);
}

const PLAYER_PROFILE = {
  name: "Ranger Panji",
  gender: "Laki-laki",
  status: "BogorDex Ranger",
  mode: "Road Patrol",
  level: 1,
  summary: "Karakter utama eksplorasi BogorDex. Fokus patroli jalan, portal event, dan penelusuran titik kota."
};
loadPlayerProgress();
const TOMTOM_API_KEY = window.BOGORDEX_TOMTOM_API_KEY || "31o6wgDj0WALXnVE0xNqd3M6gVki7A3e";
const TOMTOM_TRAFFIC_ENDPOINT = window.BOGORDEX_TOMTOM_TRAFFIC_ENDPOINT || "";
const REALTIME_EVENT_ENDPOINT = TOMTOM_TRAFFIC_ENDPOINT;
const OSRM_BASE_URL = window.BOGORDEX_OSRM_BASE_URL || "https://router.project-osrm.org";
const OSRM_PROFILE = window.BOGORDEX_OSRM_PROFILE || "driving";
const OSRM_NEAREST_MIN_INTERVAL_MS = 2400;

function setStatus(text){
  statusEl().textContent = text;
  const lamp = document.getElementById("statusLamp");
  if(lamp){
    lamp.classList.remove("lamp-green","lamp-yellow","lamp-red");
    const t = String(text || "").toLowerCase();
    if(t.includes("gagal") || t.includes("error")) lamp.classList.add("lamp-red");
    else if(t.includes("memuat") || t.includes("mengambil") || t.includes("scan")) lamp.classList.add("lamp-yellow");
    else lamp.classList.add("lamp-green");
  }
}
function updatePlayerUiMeta(){
  syncPlayerProfileFromProgress();
  document.querySelectorAll('.trainer-name').forEach(el => el.textContent = PLAYER_PROFILE.status);
  document.querySelectorAll('.trainer-level').forEach(el => el.textContent = `Lv ${PLAYER_PROFILE.level} Explorer • EXP ${state.playerProgress.exp || 0}`);
  const ids = {
    profileName:PLAYER_PROFILE.name,
    profileName2:PLAYER_PROFILE.name,
    profileGender:PLAYER_PROFILE.gender,
    profileRole:PLAYER_PROFILE.status,
    profileMode:PLAYER_PROFILE.mode,
    profileLevel:String(PLAYER_PROFILE.level),
    profileStatus:`${PLAYER_PROFILE.status} • Coin ${state.playerProgress.coin || 0} • Badge ${state.unlockedBadges.size} • ${dailyStepsText()}`,
    profileDailySteps:dailyStepsText(),
    profileSummary:PLAYER_PROFILE.summary
  };
  Object.entries(ids).forEach(([id,val]) => { const el=document.getElementById(id); if(el) el.textContent=val; });

  const badgeGrid = document.getElementById('profileBadgeGrid');
  const badgeCount = document.getElementById('profileBadgeCount');
  if(badgeGrid){
    const unlocked = Array.from(state.unlockedBadges || []);
    const all = Array.isArray(state.badges) ? state.badges : [];
    const shown = unlocked.length ? unlocked.map(id => all.find(b => b.id === id) || {id, name:id, icon:'🏅', desc:'Badge terbuka'}) : all.slice(0,4);
    badgeGrid.innerHTML = (shown.slice(0,8).map((b,idx)=>`
      <div class="profile-badge-card ${unlocked.includes(b.id) ? 'unlocked' : 'locked'}">
        <div class="profile-badge-icon">${b.icon || ['🏛️','🧭','🌿','⭐','📸','🤝','🚌','🚨'][idx%8]}</div>
        <b>${b.name || b.id || 'Badge'}</b>
        <small>${b.desc || b.category || 'Prestasi BogorDex'}</small>
      </div>`).join('')) || `
      <div class="profile-badge-card locked"><div class="profile-badge-icon">🔒</div><b>Belum ada</b><small>Jelajahi lokasi untuk membuka badge.</small></div>`;
  }
  const totalBadges = (Array.isArray(state.badges) && state.badges.length) ? state.badges.length : Math.max(1, (state.unlockedBadges||new Set()).size);
  if(badgeCount){
    badgeCount.textContent = `${(state.unlockedBadges||new Set()).size} / ${totalBadges}`;
  }
  const progressFill = document.getElementById('profileProgressFill');
  if(progressFill){
    progressFill.style.width = `${Math.max(8, Math.min(100, (((state.unlockedBadges||new Set()).size || 0) / Math.max(1, totalBadges)) * 100))}%`;
  }
  const lbl = document.querySelector('.player-name-tag b');
  if(lbl) lbl.textContent = PLAYER_PROFILE.name;
}
function chatDock(){ return document.getElementById('animeChatDock'); }
function openChatDock(){ chatDock()?.classList.remove('collapsed'); }
function closeChatDock(){ chatDock()?.classList.add('collapsed'); }

function clearNPCMarkers(){
  if(!state.npcMarkers) state.npcMarkers = [];
  state.npcMarkers.forEach(m => {
    try{ m.remove(); }catch(e){}
  });
  state.npcMarkers = [];
}
function npcCoordFromPortal(index, fallbackMetersX, fallbackMetersY){
  const poi = state.pois && state.pois[index % Math.max(1, state.pois.length)];
  const base = poi && poi.coords ? poi.coords : state.gpsBase;
  const [dLng,dLat] = metersToLngLatOffset(fallbackMetersX, fallbackMetersY, base[1]);
  return [base[0] + dLng, base[1] + dLat];
}
function placeNPCsNearPortals(){
  // NPC dibuat tetap di titik map yang agak menyebar. Bukan overlay layar dan bukan nempel portal.
  const base = state.gpsBase || [106.79884, -6.59725];
  const offsets = [
    [-420, 300], [390, 260], [-360, -310], [430, -250], [40, 430]
  ];
  state.npcs.forEach((npc, i) => {
    const o = offsets[i] || [0, 0];
    const [dLng,dLat] = metersToLngLatOffset(o[0], o[1], base[1]);
    npc.coords = [base[0] + dLng, base[1] + dLat];
  });
}
function npcElement(npc, idx){
  const el = document.createElement("button");
  el.type = "button";
  el.className = "npc map-npc";
  el.dataset.npcId = npc.id;
  el.style.animationDelay = (idx * .18) + "s";
  el.innerHTML = `
    <span class="npc-quest-mark">!</span>
    <span class="npc-name">${npc.name}</span>
    <span class="npc-bubble">${npc.bubble}</span>
    <span class="npc-sprite" style="background-image:url('${npc.asset}')"></span>
  `;
  el.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    openNpcDialog(npc.id);
  });
  return el;
}
function renderNPCs(){
  clearNPCMarkers();
  return;
}
function openNpcDialog(npcId){
  return;
}
function closeNpcDialog(){
  document.getElementById("npcDialog").classList.add("hidden");
  state.activeNpcId = null;
}
function acceptNpcQuest(){
  return;
}
function updateNpcNearState(){
  return;
}

function setPlayerAnim(mode, facing){
  const el = playerSprite();
  if(!el) return;
  if(facing) state.facing = facing;
  state.playerMode = mode || "idle";
  el.classList.remove("idle","walk","run","face-down","face-up","face-left","face-right");
  el.classList.add(state.playerMode);
  el.classList.add("face-" + (state.facing || "up"));
  applyPlayerSpriteFrame();
}

function applyPlayerSpriteFrame(){
  const el = playerSprite();
  if(!el) return;
  const fw = 125;
  const fh = 125;
  const facingRows = { down:0, left:1, right:2, up:3 };
  const facing = state.facing || "up";
  const row = facingRows[facing] ?? 3;
  const mode = state.playerMode || "idle";
  const cycle = mode === "idle" ? [1] : [0,1,2,3];
  const col = cycle[Math.floor(Date.now()/160) % cycle.length] ?? 1;
  el.style.setProperty("--sprite-x", (-col * fw) + "px");
  el.style.setProperty("--sprite-y", (-row * fh) + "px");
}

function createPlayerMapMarker(){
  if(state.playerMarker || !maplibregl || !map) return;
  const el = document.createElement("div");
  el.className = "player-map-marker";
  el.innerHTML = `<div class="player-name-tag"><span>⚡</span><b>${PLAYER_PROFILE.name}</b></div><div class="player-ring"></div><div class="player-shadow"></div><div id="playerSpriteMap" class="player-sprite player-sprite-image idle face-up" aria-label="Karakter utama"></div>`;
  state.playerMarkerEl = el;
  state.playerMarker = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, 0], rotationAlignment: "viewport", pitchAlignment: "viewport" })
    .setLngLat(state.playerWorld)
    .addTo(map);
  setPlayerAnim("idle", state.facing || "up");
}

function updatePlayerMapMarker(){
  if(state.playerMarker) state.playerMarker.setLngLat(state.playerWorld);
  if(state.playerMarkerEl){
    state.playerMarkerEl.classList.toggle("is-routing", !!state.navigationTarget);
    state.playerMarkerEl.classList.toggle("is-moving", !!(state.move.up || state.move.down || state.move.left || state.move.right));
  }
}
function metersToLngLatOffset(mx, my, latDeg){
  const latRad = latDeg * Math.PI / 180;
  return [mx / (111320 * Math.cos(latRad)), my / 110540];
}
function clampOffset(){
  const d = Math.hypot(state.offsetMeters.x, state.offsetMeters.y);
  if(d <= state.maxOffsetMeters) return;
  const r = state.maxOffsetMeters / d;
  state.offsetMeters.x *= r;
  state.offsetMeters.y *= r;
}
function recomputePlayerWorld(){
  const [dLng, dLat] = metersToLngLatOffset(state.offsetMeters.x, state.offsetMeters.y, state.gpsBase[1]);
  state.playerWorld = [state.gpsBase[0] + dLng, state.gpsBase[1] + dLat];
  updatePlayerMapMarker();
}
function haversineMeters(a, b){
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b[1]-a[1]);
  const dLng = toRad(b[0]-a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function updateStatus(prefix){
  const d = Math.hypot(state.offsetMeters.x, state.offsetMeters.y).toFixed(1);
  setStatus(prefix ? `${prefix} • offset ${d} m` : `Offset manual ${d} / ${state.maxOffsetMeters} m`);
}

const WEATHER_REFRESH_MS = 10 * 60 * 1000;
const WEATHER_REFRESH_MOVE_METERS = 200;

function weatherCodeMeta(code){
  const c = Number(code);
  if(c === 0) return { text:'Cerah', icon:'☀️', rain:false };
  if([1,2].includes(c)) return { text:'Cerah Berawan', icon:'⛅', rain:false };
  if(c === 3) return { text:'Berawan', icon:'☁️', rain:false };
  // Jangan tampilkan kabut/hujan berlebihan. Banyak API cuaca suka salah baca gerimis ringan.
  if([45,48].includes(c)) return { text:'Berawan', icon:'☁️', rain:false };
  if([51,53,55,56,57].includes(c)) return { text:'Berawan', icon:'☁️', rain:false };
  if([61,63,65,66,67,80,81,82].includes(c)) return { text:'Hujan', icon:'🌧️', rain:true };
  if([95,96,99].includes(c)) return { text:'Badai', icon:'⛈️', rain:true };
  return { text:'Cerah Berawan', icon:'⛅', rain:false };
}

function updateWeatherClock(){
  const timeEl = document.getElementById('weatherLocTime');
  if(!timeEl) return;
  const tz = state.environment?.timezone || 'Asia/Jakarta';
  const now = new Date();
  const timeText = now.toLocaleTimeString('id-ID',{ hour:'2-digit', minute:'2-digit', timeZone:tz });
  const dateText = now.toLocaleDateString('id-ID',{ weekday:'short', day:'numeric', month:'short', timeZone:tz });
  timeEl.textContent = `${timeText} • ${dateText}`;
}

function updateWeatherChip(){
  const tempEl = document.getElementById('weatherTemp');
  const descEl = document.getElementById('weatherDesc');
  const iconEl = document.getElementById('weatherIcon');
  if(tempEl) tempEl.textContent = Number.isFinite(state.environment.temperature) ? `${Math.round(state.environment.temperature)}°C` : '--°C';
  if(descEl) descEl.textContent = state.environment.description || 'Cuaca';
  if(iconEl) iconEl.textContent = state.environment.icon || '⛅';
  updateWeatherClock();
}

function applyEnvironmentClasses(){
  const app = document.getElementById('app');
  const raining = !!state.environment.raining;
  const isNight = false;
  document.body.classList.toggle('weather-rain', raining);
  document.body.classList.toggle('is-night', isNight);
  if(app){
    app.classList.toggle('weather-rain', raining);
    app.classList.toggle('is-night', isNight);
  }
  updateTopHud();
}

// V97 AR Camera bottom center menu
let __arCameraStream = null;
function arCameraModal(){ return document.getElementById('arCameraModal'); }
function openArCameraModal(){
  const modal = arCameraModal();
  if(!modal) return;
  closeMainMenu?.();
  closeMapDex?.();
  try{ closeCharacterProfile?.(); }catch(e){}
  modal.classList.remove('hidden');
  document.body.classList.add('overlay-open');
  updateStatus?.('AR Kamera siap dibuka');
}
function closeArCameraModal(){
  stopArCamera();
  const modal = arCameraModal();
  if(modal) modal.classList.add('hidden');
  document.body.classList.remove('overlay-open');
}
async function startArCamera(){
  const video = document.getElementById('arCameraVideo');
  const placeholder = document.querySelector('.ar-camera-placeholder');
  if(!video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    updateStatus?.('Kamera browser belum tersedia');
    return;
  }
  try{
    stopArCamera();
    __arCameraStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false });
    video.srcObject = __arCameraStream;
    video.classList.add('active');
    if(placeholder) placeholder.style.display='none';
    updateStatus?.('AR Kamera aktif');
  }catch(err){
    console.warn('AR camera failed', err);
    updateStatus?.('Izin kamera ditolak / tidak tersedia');
  }
}
function stopArCamera(){
  if(__arCameraStream){
    __arCameraStream.getTracks().forEach(t=>t.stop());
    __arCameraStream = null;
  }
  const video = document.getElementById('arCameraVideo');
  const placeholder = document.querySelector('.ar-camera-placeholder');
  if(video){ video.pause(); video.srcObject=null; video.classList.remove('active'); }
  if(placeholder) placeholder.style.display='flex';
}
window.openArCameraModal = openArCameraModal;
window.closeArCameraModal = closeArCameraModal;
window.startArCamera = startArCamera;
window.stopArCamera = stopArCamera;
document.getElementById('arCameraCloseBtn')?.addEventListener('click', closeArCameraModal);
document.getElementById('arCameraStartBtn')?.addEventListener('click', startArCamera);
document.getElementById('arCameraStopBtn')?.addEventListener('click', stopArCamera);
document.getElementById('arCameraModal')?.addEventListener('click', (e)=>{ if(e.target.id === 'arCameraModal') closeArCameraModal(); });

updateWeatherChip();
applySceneTheme();

function applySceneTheme(){
  // v61: no scene recolor patch
  return;
}

async function refreshEnvironment(force=false){
  try{
    const [lng, lat] = state.gpsBase || state.playerWorld || [106.79884, -6.59725];
    if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const now = Date.now();
    const last = state.environment.lastFetchCoords;
    const moved = last ? haversineMeters([last.lng, last.lat], [lng, lat]) : Infinity;
    if(!force && (now - (state.environment.lastFetchAt || 0) < WEATHER_REFRESH_MS) && moved < WEATHER_REFRESH_MOVE_METERS) return;

    // Ikutin pola project bgrlol yang sudah terbukti jalan:
    // timezone=auto dan fetch standar, tanpa mode:'cors' custom.
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,is_day,rain,showers,snowfall,cloud_cover&timezone=auto`;
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    const current = data.current || {};
    const rainValue = Number(current.rain || 0) + Number(current.showers || 0);
    const cloudCover = Number(current.cloud_cover || 0);

    state.environment.lastFetchAt = now;
    state.environment.lastFetchCoords = { lat, lng };
    state.environment.timezone = data.timezone || 'Asia/Jakarta';
    state.environment.temperature = Number(current.temperature_2m);
    state.environment.description = rainValue > 0.12 ? 'Hujan' : (cloudCover > 78 ? 'Berawan' : 'Cerah Berawan');
    state.environment.icon = rainValue > 0.12 ? '🌧️' : (cloudCover > 78 ? '☁️' : '⛅');
    state.environment.weatherCode = Number(current.weather_code);
    state.environment.isDay = Number(current.is_day) === 1;
    state.environment.raining = rainValue > 0.12;
    applyEnvironmentClasses();
  }catch(err){
    console.warn('Weather fetch failed:', err);
    // Jangan stuck di Memuat cuaca walaupun API gagal.
    if(!Number.isFinite(state.environment.temperature)) state.environment.temperature = 26;
    if(!state.environment.description || state.environment.description === 'Memuat cuaca') state.environment.description = 'Cerah Berawan';
    if(!state.environment.icon) state.environment.icon = '⛅';
    state.environment.raining = false;
    applyEnvironmentClasses();
  }
}

setInterval(updateWeatherClock, 30000);
function syncMiniButton(){}

function reportRelativeTime(iso){
  const t = new Date(iso || Date.now()).getTime();
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if(m < 1) return "baru saja";
  if(m < 60) return m + " menit lalu";
  const h = Math.floor(m / 60);
  if(h < 24) return h + " jam lalu";
  return Math.floor(h / 24) + " hari lalu";
}
function getUserReportById(id){
  return (state.userReports || []).find(r => String(r.id) === String(id));
}
function setReportStatus(id, status){
  const r = getUserReportById(id);
  if(!r) return;
  r.status = status;
  r.updatedAt = new Date().toISOString();
  saveUserReports();
  renderUserReports();
  if(state.lastPoi && String(state.lastPoi.id) === String(id)){
    openSheet(state.lastPoi, "manual");
  }
  showRubo(status === "benar" ? "kaget" : status === "salah" ? "kecewa" : "serius", status === "benar" ? "Status diperbarui" : status === "salah" ? "Dicek ulang ya" : "Laporan diperbarui", status === "benar" ? "Terima kasih, info ini ditandai sudah benar." : status === "salah" ? "Info ditandai belum sesuai." : "Status laporan sudah diperbarui.");
  showAnimeToast("event", "Status laporan diperbarui", status === "benar" ? "Ditandai sudah benar" : status === "salah" ? "Ditandai belum benar" : "Menunggu verifikasi");
}
function deleteUserReportById(id){
  state.userReports = (state.userReports || []).filter(r => String(r.id) !== String(id));
  saveUserReports();
  renderUserReports();
  closeSheet(true, true);
  showRubo("sedih", "Laporan dihapus", "Info titik sudah dihapus dari map kamu.");
  showAnimeToast("event", "Laporan dihapus", "Info titik tidak tampil lagi di map.");
}
function renderUserReportSheet(poi){
  const report = getUserReportById(poi.id) || {};
  const status = report.status || "menunggu";
  const statusLabel = status === "benar" ? "Sudah benar" : status === "salah" ? "Belum sesuai" : "Menunggu verifikasi";
  const category = report.category || "lainnya";
  const coordsText = `Bogor Tengah, Kota Bogor`;
  const updatedText = new Date(report.updatedAt || report.createdAt || Date.now()).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  document.getElementById("sheetContent").innerHTML = `
    <div class="report-sheet-card report-sheet-card-ref mobile-report-sheet">
      <div class="report-sheet-head report-sheet-head-ref">
        <div class="report-sheet-icon report-sheet-thumb ${category}"></div>
        <div class="report-sheet-titlewrap">
          <span class="section-kicker">BogorDex</span>
          <h3>Info Titik Saya</h3>
          <p>Kelola informasi yang kamu buat di BogorDex.</p>
        </div>
      </div>
      <div class="report-sheet-summary-card mobile-report-maincard">
        <div class="report-sheet-summary-thumb ${category}"></div>
        <div class="report-sheet-summary-body">
          <div class="report-sheet-summary-top">
            <strong>${report.note || poi.desc || "Info titik dari user"}</strong>
            <span class="report-status-pill ${status}">${statusLabel}</span>
          </div>
          <div class="report-sheet-meta-line">📍 <b>${coordsText}</b></div>
          <div class="report-sheet-meta-sub">dekat lokasi karakter saat laporan dibuat</div>
          <div class="report-sheet-meta-time">🕒 ${reportRelativeTime(report.createdAt)}</div>
        </div>
      </div>
      <div class="report-sheet-tile-grid">
        <div class="report-sheet-tile"><span>Status</span><b>${status === 'benar' ? 'Aktif' : status === 'salah' ? 'Dicek Ulang' : 'Menunggu'}</b></div>
        <div class="report-sheet-tile"><span>Visibility</span><b>Publik</b></div>
        <div class="report-sheet-tile"><span>Lapisan</span><b>Laporan</b></div>
        <div class="report-sheet-tile"><span>Terakhir Update</span><b>${updatedText}</b></div>
      </div>
      <div class="report-action-grid report-action-grid-ref mobile-report-actions">
        <button id="reportStatusRefresh" class="report-manage-btn blue">Menunggu</button>
        <button id="reportStatusCorrect" class="report-manage-btn green">Sudah Benar</button>
        <button id="reportDeleteBtn" class="report-manage-btn red">Hapus</button>
      </div>
      <div class="report-history-tip mobile-tip-card">✨ Titik kamu membantu warga lain menemukan lokasi penting di BogorDex!</div>
    </div>`;
  document.getElementById("reportStatusRefresh")?.addEventListener("click", () => setReportStatus(poi.id, "menunggu"));
  document.getElementById("reportStatusCorrect")?.addEventListener("click", () => setReportStatus(poi.id, "benar"));
  document.getElementById("reportDeleteBtn")?.addEventListener("click", () => deleteUserReportById(poi.id));
}
function openSheet(poi, mode="manual"){
  setOverlayMode(true);
  sheetEl().classList.remove("hidden-sheet");
  sheetEl().classList.remove("collapsed");
  state.activePoiId = poi.id || null;
  state.activePoiMode = mode;
  state.lastPoi = poi;
  if(poi.group === "CITIZEN REPORT"){
    renderUserReportSheet(poi);
    syncMiniButton();
    updateStatus(poi.name || "Info Warga");
    return;
  }
  markPortalVisited(poi, true);
  const quest = getQuestById(poi.questId);
  const rewardLines = portalRewardSummary(poi, quest);
  const statusText = portalStatusLabel(poi);
  const statusBadge = portalStatusBadgeHtml(poi);
  const badgeText = poi.rewardBadgeId ? badgeLabel(poi.rewardBadgeId) : "";
  const radiusText = portalRadiusValue(poi) + " m";
  const distanceText = portalDistanceText(poi);
  const actionLabel = portalStatusCode(poi) === 'completed' ? 'Portal Selesai' : 'Masuk Portal';
  document.getElementById("sheetContent").innerHTML = `
    <div class="portal-detail-sheet">
      <div class="portal-detail-head">
        <div class="portal-detail-kicker">Portal Detail</div>
        <h3>${poi.name}</h3>
        <div class="portal-detail-status-row">
          ${statusBadge}
          <span class="portal-status-pill soft">${poi.group || 'Portal BogorDex'}</span>
          ${poi.subkategori ? `<span class="portal-status-pill soft">${poi.subkategori}</span>` : ''}
        </div>
        <p>${poi.desc || poi.fungsi || 'Portal BogorDex siap dibuka. Masuk portal untuk lanjut ke tahap berikutnya.'}</p>
      </div>
      <div class="portal-quick-grid">
        <div class="portal-quick-card"><span>Status</span><b>${statusText}</b></div>
        <div class="portal-quick-card"><span>Radius</span><b>${radiusText}</b></div>
        <div class="portal-quick-card"><span>Jarak</span><b>${distanceText}</b></div>
        <div class="portal-quick-card"><span>MapDex</span><b>${state.discovered.has(poi.id) ? 'Tersimpan' : 'Belum'}</b></div>
      </div>
      <div class="section portal-info-card">
        <div class="section-title">Info Portal</div>
        <p>${poi.fungsi || poi.desc || 'Belum ada info portal.'}</p>
      </div>
      <div class="section portal-info-card">
        <div class="section-title">Lokasi</div>
        <p>${poi.address || poi.tupoksi || 'Belum ada alamat/detail tambahan.'}</p>
      </div>
      ${quest ? `<div class="section portal-info-card"><div class="section-title">Quest Terkait</div><p><b>${quest.name}</b><br>${quest.desc || 'Buka portal ini untuk melanjutkan quest.'}</p></div>` : ''}
      <div class="section portal-info-card">
        <div class="section-title">Reward</div>
        <p>${rewardLines.length ? rewardLines.join('<br>') : (badgeText ? badgeText : 'Reward detail bisa dikembangkan lagi di mode AR.')}</p>
      </div>
      <div class="portal-action-grid">
        <button type="button" class="portal-action-btn primary" id="portalEnterBtn">${actionLabel}</button>
        <button type="button" class="portal-action-btn" id="portalArBtn">Buka AR</button>
        ${(Array.isArray(poi.coords) && poi.group !== "EVENT PORTAL") ? '<button type="button" class="portal-action-btn" id="sheetRouteBtn">Arahkan</button>' : ''}
      </div>
    </div>
  `;
  const routeBtn = document.getElementById("sheetRouteBtn");
  if(routeBtn && Array.isArray(poi.coords)){
    routeBtn.addEventListener("click", () => { closeSheet(true, true); requestAnimationFrame(() => setNavigationTarget({ title:poi.name, coords:poi.coords })); });
  }
  const arBtn = document.getElementById('portalArBtn');
  if(arBtn){
    arBtn.addEventListener('click', () => {
      if(typeof openArCameraModal === 'function') openArCameraModal();
      else if(window.openArCameraModal) window.openArCameraModal();
      updateStatus(`AR siap untuk ${poi.name}`);
    });
  }
  const enterBtn = document.getElementById('portalEnterBtn');
  if(enterBtn){
    enterBtn.addEventListener('click', () => {
      markPortalCompleted(poi, false);
      openSheet(poi, mode);
    });
  }
  syncMiniButton();
  updateStatus(poi.name);
}
function closeSheet(resetStatus=true, fullyHide=true){
  setOverlayMode(false);
  if(fullyHide){
    sheetEl().classList.add("hidden-sheet");
    sheetEl().classList.remove("collapsed");
  }else{
    sheetEl().classList.remove("hidden-sheet");
    sheetEl().classList.add("collapsed");
  }
  if(resetStatus) updateStatus(state.hasRealGps ? "Lokasi aktif" : "Lokasi simulasi");
  syncMiniButton();
}

function installBottomSheetOutsideClose(){
  if(installBottomSheetOutsideClose._done) return;
  installBottomSheetOutsideClose._done = true;
  document.addEventListener('pointerdown', (ev) => {
    const sheet = sheetEl();
    if(!sheet || sheet.classList.contains('hidden-sheet') || sheet.classList.contains('collapsed')) return;
    if(sheet.contains(ev.target)) return;
    const ignored = ev.target.closest?.('.mapdex-modal,.report-modal,.modal,.game-menu-modal,.npc-dialog,.quest-popup,.bottom-game-nav,.move-pad,.top-status,#weatherChip,.top-right-hud,.fab-compass,.fab-locate,.mapdex-action,.report-action');
    if(ignored) return;
    closeSheet(true, true);
  }, true);
}
installBottomSheetOutsideClose();
function renderDex(){
  updatePlayerUiMeta();
  const list = document.getElementById("mapDexList");
  if(!list) return;
  const discoveredPois = state.pois.filter(p => state.discovered.has(p.id));
  const completed = state.quests.filter(q => state.completedQuests.has(q.id));
  const unlocked = state.badges.filter(b => state.unlockedBadges.has(b.id));
  const summary = `
    <div class="mapdex-row" style="display:block;text-align:left;cursor:default;">
      <span>
        <strong>Progress BogorDex</strong>
        <small>${discoveredPois.length}/${state.pois.length} lokasi • ${completed.length}/${state.quests.length} quest • ${unlocked.length}/${state.badges.length} badge</small>
      </span>
      <b>Lv ${state.playerProgress.level}</b>
    </div>`;
  const rows = discoveredPois.slice(0,5).map(p => `<div class="mapdex-row" style="display:block;text-align:left;cursor:default;"><span><strong>${p.name}</strong><small>${p.group}${p.subkategori ? " • " + p.subkategori : ""}</small></span><b>${Math.round(p.rewardExp || 0)} XP</b></div>`).join("");
  list.innerHTML = summary + rows;
}
function normalizeGroup(group){
  const g = String(group || "").toUpperCase().trim();
  if(g.includes("HALTE")) return "halte";
  if(g.includes("PUSKESMAS") || g.includes("RUMAH SAKIT")) return "health";
  if(g.includes("UMKM") || g.includes("KULINER")) return "umkm";
  return "gov";
}
function parseLocation(value){
  if(!value) return null;
  const parts = String(value).split(",").map(v => parseFloat(v.trim()));
  if(parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return [parts[1], parts[0]];
}
function normalizeRows(rows, plain, cols=[]){
  return rows.map((row, idx) => {
    if(plain && !Array.isArray(row)){
      const r = row || {};
      const group = r.KELOMPOK || r.kategori || "";
      const name = r.NAMA || r.nama_lokasi || `POI ${idx+1}`;
      const coords = r.LOKASI ? parseLocation(r.LOKASI) : [Number(r.longitude), Number(r.latitude)];
      const category = normalizeGroup(group);
      return {
        id: String(r.id_lokasi || `poi_${idx}`),
        group,
        subkategori: r.subkategori || "",
        name,
        fungsi: r.FUNGSI || r.fungsi_layanan || "",
        tupoksi: r.TUPOKSI || r.alamat || "",
        desc: r.DESKRIPSI || r.deskripsi_game || "",
        warna: r.WARNA || r.warna_marker || colorFromKategori(group),
        aktif: parseTruthy(r.AKTIF ?? r.status_tampil ?? "YA"),
        coords,
        category,
        address: r.alamat || "",
        icon: r.icon_marker || "",
        radius: Number(r.radius_trigger || 30),
        rewardExp: Number(r.reward_exp || 0),
        rewardCoin: Number(r.reward_coin || 0),
        rewardBadgeId: r.reward_badge_id || r.reward_badge || "",
        questId: r.quest_id || "",
        showOnMap: parseTruthy(r.muncul_di_map ?? "YA"),
        showOnMapDex: parseTruthy(r.muncul_di_mapdex ?? "YA")
      };
    }
    const r = rowToObject(cols, row);
    const hasMasterHeaders = Object.prototype.hasOwnProperty.call(r, "id_lokasi") || Object.prototype.hasOwnProperty.call(r, "nama_lokasi");
    if(hasMasterHeaders){
      const lat = Number(r.latitude);
      const lng = Number(r.longitude);
      const group = String(r.kategori || "").trim();
      const subkategori = String(r.subkategori || "").trim();
      const category = normalizeGroup(group || subkategori);
      return {
        id: String(r.id_lokasi || `poi_${idx}`),
        group,
        subkategori,
        name: String(r.nama_lokasi || `POI ${idx+1}`),
        fungsi: String(r.fungsi_layanan || ""),
        tupoksi: String(r.catatan || r.alamat || ""),
        desc: String(r.deskripsi_game || ""),
        warna: String(r.warna_marker || colorFromKategori(group || subkategori)),
        aktif: parseTruthy(r.status_tampil ?? "YA"),
        coords: (Number.isFinite(lat) && Number.isFinite(lng)) ? [lng, lat] : null,
        category,
        address: String(r.alamat || ""),
        icon: String(r.icon_marker || ""),
        radius: Number(r.radius_trigger || 30),
        rewardExp: Number(r.reward_exp || 0),
        rewardCoin: Number(r.reward_coin || 0),
        rewardBadgeId: String(r.reward_badge_id || r.reward_badge || ""),
        questId: String(r.quest_id || ""),
        showOnMap: parseTruthy(r.muncul_di_map ?? "YA"),
        showOnMapDex: parseTruthy(r.muncul_di_mapdex ?? "YA")
      };
    }
    const getVal = i => row[i];
    const group = getVal(0) || "";
    const name = getVal(1) || `POI ${idx+1}`;
    const location = getVal(2) || "";
    const fungsi = getVal(3) || "";
    const tupoksi = getVal(4) || "";
    const deskripsi = getVal(5) || "";
    const warna = getVal(7) || "";
    const aktif = String(getVal(8) ?? "TRUE").toUpperCase() !== "FALSE";
    const coords = parseLocation(location);
    const category = normalizeGroup(group);
    return { id:`poi_${idx}`, group, subkategori:"", name, fungsi, tupoksi, desc:deskripsi, warna, aktif, coords, category, address:"", radius:30, rewardExp:0, rewardCoin:0, rewardBadgeId:"", questId:"", showOnMap:true, showOnMapDex:true };
  }).filter(p => p.coords && p.aktif);
}

function normalizeQuestRows(rows, plain, cols=[]){
  const source = plain ? rows : rows.map(row => rowToObject(cols, row));
  return source.filter(r => parseTruthy((r || {}).status_quest ?? "YA")).map((r, idx) => ({
    id: String(r.id_quest || `quest_${idx}`),
    name: String(r.nama_quest || `Quest ${idx+1}`),
    category: String(r.kategori_quest || ""),
    desc: String(r.deskripsi_quest || ""),
    targetType: String(r.tipe_target || "kategori").toLowerCase(),
    targetKategori: String(r.target_kategori || ""),
    targetSubkategori: String(r.target_subkategori || ""),
    targetJumlah: Number(r.target_jumlah || 1),
    targetLokasi: String(r.target_id_lokasi || ""),
    rewardExp: Number(r.reward_exp || 0),
    rewardCoin: Number(r.reward_coin || 0),
    rewardBadgeId: String(r.reward_badge_id || r.reward_badge || ""),
    unlockLevel: Number(r.unlock_level || 1),
    showInPanel: parseTruthy(r.muncul_di_panel ?? "YA")
  }));
}
function normalizeBadgeRows(rows, plain, cols=[]){
  const source = plain ? rows : rows.map(row => rowToObject(cols, row));
  return source.filter(r => parseTruthy((r || {}).status_tampil ?? "YA")).map((r, idx) => ({
    id: String(r.id_badge || `badge_${idx}`),
    name: String(r.nama_badge || `Badge ${idx+1}`),
    category: String(r.kategori_badge || ""),
    desc: String(r.deskripsi_badge || ""),
    syaratType: String(r.syarat_tipe || ""),
    syaratNilai: String(r.syarat_nilai || ""),
    icon: String(r.icon_badge || "🏅"),
    color: String(r.warna_badge || "biru"),
    rarity: String(r.rarity || "umum"),
    bonusExp: Number(r.reward_exp_bonus || 0)
  }));
}
function toFeature(poi){
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: poi.coords },
    properties: { id: poi.id, name: poi.name, category: poi.category }
  };
}

function makePortalIcon(color, category){
  const c = document.createElement('canvas');
  c.width = 260; c.height = 300;
  const x = c.getContext('2d');
  x.save();
  x.translate(130, 158);

  // lantai portal
  x.fillStyle = 'rgba(0,0,0,0.22)';
  x.beginPath(); x.ellipse(0, 100, 62, 18, 0, 0, Math.PI*2); x.fill();

  // sinar bawah
  const beam = x.createRadialGradient(0, 42, 8, 0, 42, 108);
  beam.addColorStop(0, 'rgba(255,255,255,.70)');
  beam.addColorStop(.35, lighten(color,.42));
  beam.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = beam;
  x.beginPath(); x.ellipse(0, 22, 66, 104, 0, 0, Math.PI*2); x.fill();

  // lingkaran luar ala portal dunia digital
  for(let i=0;i<3;i++){
    x.save();
    x.rotate((i*0.62));
    x.strokeStyle = i===0 ? 'rgba(255,255,255,.95)' : (i===1 ? lighten(color,.18) : 'rgba(107,230,255,.74)');
    x.lineWidth = i===0 ? 10 : 5;
    x.setLineDash(i===0 ? [34,14] : [13,10]);
    x.beginPath(); x.ellipse(0, 0, 62+i*9, 82+i*7, 0, 0, Math.PI*2); x.stroke();
    x.restore();
  }

  // swirl dalam
  const vortex = x.createLinearGradient(-54,-70,54,70);
  vortex.addColorStop(0, 'rgba(255,255,255,.98)');
  vortex.addColorStop(.35, lighten(color,.34));
  vortex.addColorStop(.68, color);
  vortex.addColorStop(1, darken(color,.2));
  x.fillStyle = vortex;
  x.beginPath(); x.ellipse(0,0,44,62,0,0,Math.PI*2); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.92)'; x.lineWidth = 5;
  x.beginPath(); x.ellipse(0,0,44,62,0,0,Math.PI*2); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.52)'; x.lineWidth = 4;
  for(let i=0;i<4;i++){
    x.beginPath();
    x.arc(0,0,18+i*9, i*.9, i*.9+Math.PI*1.25);
    x.stroke();
  }

  // pecahan data digital
  x.fillStyle = 'rgba(255,255,255,.92)';
  [[-78,-56,9],[-82,30,6],[72,-34,7],[84,48,10],[-44,-94,5],[48,-98,6]].forEach(([px,py,r])=>{x.beginPath();x.roundRect(px,py,r*2,r*2,3);x.fill();});

  // badge kategori
  x.fillStyle = 'rgba(8,18,44,.46)'; x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 4;
  x.beginPath(); x.arc(0, -7, 21, 0, Math.PI*2); x.fill(); x.stroke();
  x.font = '22px sans-serif'; x.textAlign='center'; x.textBaseline='middle';
  const emoji = category === 'gov' ? '🏢' : category === 'halte' ? '🚌' : category === 'health' ? '🏥' : '🛍️';
  x.fillStyle = 'white'; x.fillText(emoji, 0, -5);

  x.restore();
  return x.getImageData(0,0,c.width,c.height);
}
function hexToRgb(hex){
  const h = hex.replace('#','');
  return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
}
function lighten(hex, amount){
  const [r,g,b] = hexToRgb(hex);
  const mix = v => Math.round(v + (255-v)*amount);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}
function darken(hex, amount){
  const [r,g,b] = hexToRgb(hex);
  const mix = v => Math.round(v*(1-amount));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

const CAMERA_PITCH = 71;
const CAMERA_ZOOM = 20.35;
// Jangan terlalu jauh: kalau terlalu besar karakter terdorong ke bawah dan hilang di balik UI.
const CAMERA_AHEAD_METERS = 11.5;
const CAMERA_FOLLOW_MIN_MS = 360;
const CAMERA_MOVE_DEADBAND_METERS = 6;
const CAMERA_FOLLOW_MOVE_MIN_MS = 1100;
const GPS_POSITION_DEADBAND_METERS = 4.5;
const GPS_JUMP_HARD_LIMIT_METERS = 38;
const HEADING_DEADBAND_DEG = 14;
const HEADING_SMOOTH_ALPHA = 0.055;
function degToRad(d){ return d * Math.PI / 180; }
function getCameraBearing(){
  if(state.deviceHeadingEnabled && typeof state.deviceHeadingBearing === "number") return state.deviceHeadingBearing;
  return map && typeof map.getBearing === "function" ? map.getBearing() : 0;
}
function getScreenOrientationAngle(){
  try{
    if(screen && screen.orientation && typeof screen.orientation.angle === "number") return screen.orientation.angle || 0;
  }catch(e){}
  if(typeof window.orientation === "number") return window.orientation || 0;
  return 0;
}
function shortestHeadingDiff(target, current){
  return ((target - current + 540) % 360) - 180;
}
function updateCompassNeedleVisual(heading){
  let h = normalizeHeading(heading);
  if(h === null){
    h = normalizeHeading(state.deviceHeadingBearing ?? state.deviceHeadingRaw ?? (map && typeof map.getBearing === 'function' ? map.getBearing() : 0));
  }
  const needle = document.querySelector('#resetViewBtn .compass-needle');
  const btn = document.getElementById('resetViewBtn');
  if(needle && h !== null){
    // Visual jarum mengikuti heading/GPS, dikurangi bearing map supaya tidak kebalik saat map diputar.
    const mapBearing = map && typeof map.getBearing === 'function' ? map.getBearing() : 0;
    const visual = normalizeHeading(h - mapBearing);
    needle.style.transform = `translate(-50%, -50%) rotate(${visual}deg)`;
    if(btn) btn.dataset.heading = String(Math.round(h));
  }
}
function applyDeviceHeadingToCamera(heading, duration=240){
  heading = normalizeHeading(heading);
  if(heading === null) return;
  state.deviceHeadingRaw = heading;
  state.deviceHeadingEnabled = true;
  state.deviceHeadingLastAt = Date.now();

  // Sensor kompas Android sering noise. Ini dibuat seperti Google Maps:
  // perubahan kecil diabaikan, perubahan besar dikejar pelan.
  if(typeof state.deviceHeadingSmooth !== "number"){
    state.deviceHeadingSmooth = heading;
  }else{
    const diff = shortestHeadingDiff(heading, state.deviceHeadingSmooth);
    if(Math.abs(diff) < HEADING_DEADBAND_DEG) return;
    state.deviceHeadingSmooth = normalizeHeading(state.deviceHeadingSmooth + diff * HEADING_SMOOTH_ALPHA);
  }
  state.deviceHeadingBearing = state.deviceHeadingSmooth;
  updateCompassNeedleVisual(state.deviceHeadingSmooth);

  const now = performance.now();
  if(now - (state.headingCameraLastAt || 0) < CAMERA_FOLLOW_MIN_MS) return;
  state.headingCameraLastAt = now;
  // v83: saat user jalan manual/drag di HP, kamera jangan ikut rotate.
  // Kompas hanya dipakai untuk mode GPS-follow, bukan saat tombol/drag aktif.
  if(map && !state.browsing && !(state.move.up || state.move.down || state.move.left || state.move.right || state.touchDragMove)){
    // sengaja tidak dipanggil agar kamera tidak muter sendiri saat mundur / tekan S
  }
}
function cameraCenterAhead(bearing){
  const b = typeof bearing === "number" ? bearing : getCameraBearing();
  const rad = degToRad(b);
  // Center digeser ke depan sedikit supaya karakter tetap terlihat di bawah-tengah, bukan hilang di bawah UI.
  const mx = Math.sin(rad) * CAMERA_AHEAD_METERS;
  const my = Math.cos(rad) * CAMERA_AHEAD_METERS;
  const [dLng,dLat] = metersToLngLatOffset(mx, my, state.playerWorld[1]);
  return [state.playerWorld[0] + dLng, state.playerWorld[1] + dLat];
}
function followPlayerCamera(opts={}){
  if(!map) return;
  const bearing = typeof opts.bearing === "number" ? normalizeHeading(opts.bearing) : getCameraBearing();
  const zoom = typeof opts.zoom === "number" ? opts.zoom : CAMERA_ZOOM;
  const center = cameraCenterAhead(bearing);
  const payload = { center, zoom, pitch: CAMERA_PITCH, bearing };
  if(!opts.force && state.lastCameraCenter){
    const moved = haversineMeters(state.lastCameraCenter, center);
    const now = performance.now();
    if(moved < CAMERA_MOVE_DEADBAND_METERS && (now - (state.cameraFollowLastAt || 0)) < CAMERA_FOLLOW_MOVE_MIN_MS) return;
    state.cameraFollowLastAt = now;
  }else{
    state.cameraFollowLastAt = performance.now();
  }
  state.lastCameraCenter = center;
  if(opts.duration) map.easeTo({ ...payload, duration: opts.duration, easing:t=>(1 - Math.pow(1-t, 3)) });
  else map.jumpTo(payload);
}
function lockPitchOnly(){
  if(!map) return;
  const currentPitch = Math.round(map.getPitch());
  if(Math.abs(currentPitch - CAMERA_PITCH) > 1){
    map.easeTo({ pitch: CAMERA_PITCH, duration: 120 });
  }
}

const MAPLIBRE_STYLE_URL = window.BOGORDEX_MAP_STYLE || "https://tiles.openfreemap.org/styles/liberty";

function makeLngLatBounds(center, radiusMeters){
  const lng = Number(center && center[0]);
  const lat = Number(center && center[1]);
  const r = Number(radiusMeters || 820);
  if(!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const dLat = r / 110540;
  const dLng = r / (111320 * Math.cos(lat * Math.PI/180) || 1);
  return [[lng - dLng, lat - dLat], [lng + dLng, lat + dLat]];
}
function updateRenderBounds(force=false){
  if(!map || !state.playerWorld) return;
  const center = state.playerWorld;
  const last = state.renderBoundsCenter;
  if(!force && last && haversineMeters(last, center) < Math.max(120, state.renderRadiusMeters * 0.28)) return;
  const bounds = makeLngLatBounds(center, state.renderRadiusMeters);
  if(!bounds) return;
  state.renderBoundsCenter = [center[0], center[1]];
  try{ map.setMaxBounds(bounds); }catch(e){ console.warn('render bounds skip', e); }
}
function clearRenderBounds(){ try{ if(map) map.setMaxBounds(null); }catch(e){} }
function bearingBetweenCoords(a, b){
  if(!a || !b) return null;
  const lon1 = degToRad(a[0]);
  const lon2 = degToRad(b[0]);
  const lat1 = degToRad(a[1]);
  const lat2 = degToRad(b[1]);
  const y = Math.sin(lon2-lon1) * Math.cos(lat2);
  const x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(lon2-lon1);
  return normalizeHeading(Math.atan2(y,x) * 180 / Math.PI);
}
function facingFromMovementBearing(moveBearing, screenFacing=null){
  if(screenFacing) return screenFacing;
  if(typeof moveBearing !== 'number' || !Number.isFinite(moveBearing)) return state.facing || 'up';
  const cam = getCameraBearing();
  const rel = normalizeHeading(moveBearing - cam);
  if(rel >= 315 || rel < 45) return 'up';
  if(rel >= 45 && rel < 135) return 'right';
  if(rel >= 135 && rel < 225) return 'down';
  return 'left';
}
function applyGpsWalkAnimation(prevCoord, nextCoord, pos){
  const dist = prevCoord ? haversineMeters(prevCoord, nextCoord) : 0;
  let moveBearing = null;
  if(pos && pos.coords && Number.isFinite(pos.coords.heading) && Number(pos.coords.speed || 0) > 0.45){
    moveBearing = normalizeHeading(pos.coords.heading);
  }else if(dist > 0.65){
    moveBearing = bearingBetweenCoords(prevCoord, nextCoord);
  }
  if(dist > 0.75){
    const facing = facingFromMovementBearing(moveBearing);
    state.gpsMovingUntil = Date.now() + 1700;
    if(!playerSprite().classList.contains('walk') || state.facing !== facing) setPlayerAnim('walk', facing);
  }else if(Date.now() > (state.gpsMovingUntil || 0)){
    if(!playerSprite().classList.contains('idle')) setPlayerAnim('idle', state.facing || 'up');
  }
}

if (!window.maplibregl) {
  const el = document.getElementById("statusText");
  if (el) el.textContent = "Engine peta belum termuat";
  throw new Error("maplibregl gagal dimuat");
}

const map = new maplibregl.Map({
  container: "map",
  style: MAPLIBRE_STYLE_URL,
  center: state.playerWorld,
  zoom: CAMERA_ZOOM,
  minZoom: 19.6,
  maxZoom: 21.0,
  pitch: CAMERA_PITCH,
  minPitch: CAMERA_PITCH,
  maxPitch: CAMERA_PITCH,
  bearing: 0,
  antialias: true,
  renderWorldCopies: false,
  refreshExpiredTiles: false,
  fadeDuration: 80,
  maxTileCacheSize: 72,
  dragRotate: true,
  pitchWithRotate: false,
  touchPitch: false
});
try{ map.touchZoomRotate.enableRotation(); }catch(e){}
try{ map.dragRotate.enable(); }catch(e){}
try{ map.touchZoomRotate.enableRotation(); }catch(e){}


function setupMapLibre3D(){
  // V34: Pokemon GO/anime map mode. Gedung 3D disembunyikan supaya peta terasa lapang,
  // tapi layer collision transparan tetap ada agar karakter tidak gampang masuk area bangunan.
  setupAnimeMapMode();
  tuneMapLibreTone();
  enhanceRoadVisibility();
  applySceneTheme();
  refreshEnvironment(true);
}

function getVectorBuildingSourceId(){
  const style = map.getStyle();
  if(!style || !style.sources) return null;
  if(style.sources.openmaptiles) return 'openmaptiles';
  if(style.sources.openfreemap) return 'openfreemap';
  return Object.keys(style.sources).find(id => /openmaptiles|openfreemap|osm|vector/i.test(id)) || null;
}

function setupAnimeMapMode(){
  if(!map || !map.getStyle) return;
  const style = map.getStyle();
  const layers = style.layers || [];

  // pakai mode map yang user suka: building bawaan disembunyikan,
  // lalu diganti ghost/transparan supaya jalan tetap kebaca dan tone map tetap enak.
  layers.forEach(layer => {
    const id = String(layer.id || '').toLowerCase();
    const sl = String(layer['source-layer'] || '').toLowerCase();
    if(id.includes('building') || sl.includes('building')){
      try{ map.setLayoutProperty(layer.id, 'visibility', 'none'); }catch(e){}
    }
  });

  const vectorSourceId = getVectorBuildingSourceId();
  if(!vectorSourceId) return;

  try{
    const labelLayer = layers.find(l => l.type === 'symbol' && l.layout && l.layout['text-field']);
    const beforeId = labelLayer && labelLayer.id;
    if(!map.getLayer('bdx-ghost-buildings')){
      map.addLayer({
        id:'bdx-ghost-buildings',
        source:vectorSourceId,
        'source-layer':'building',
        type:'fill-extrusion',
        minzoom:15,
        paint:{
          'fill-extrusion-color':'#82dce9',
          'fill-extrusion-height':['interpolate',['linear'],['zoom'],15,2,18,['coalesce',['get','render_height'],['get','height'],18]],
          'fill-extrusion-base':['coalesce',['get','render_min_height'],['get','min_height'],0],
          'fill-extrusion-opacity':0.18,
          'fill-extrusion-vertical-gradient':true
        }
      }, beforeId);
    }
    if(!map.getLayer('bdx-building-collision')){
      map.addLayer({
        id:'bdx-building-collision',
        source:vectorSourceId,
        'source-layer':'building',
        type:'fill',
        minzoom:15,
        paint:{
          'fill-color':'#6ee7ff',
          'fill-opacity':0.001
        }
      }, beforeId);
    }
  }catch(err){
    console.warn('Ghost building layer skipped:', err);
  }
}



function tuneMapLibreTone(){
  if(!map || !map.getStyle) return;
  const style = map.getStyle();
  const layers = style.layers || [];
  layers.forEach(layer => {
    const id = String(layer.id || '').toLowerCase();
    try{
      if(layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', '#dff8ec');
      if(layer.type === 'fill'){
        if(id.includes('water')) map.setPaintProperty(layer.id, 'fill-color', '#9fdfff');
        if(id.includes('park') || id.includes('grass') || id.includes('landuse') || id.includes('wood')) map.setPaintProperty(layer.id, 'fill-opacity', 0.78);
      }
      if(layer.type === 'line' && (id.includes('road') || id.includes('street') || id.includes('transportation'))){
        try{ map.setPaintProperty(layer.id, 'line-opacity', 0.92); }catch(e){}
      }
    }catch(e){}
  });
}

function enhanceRoadVisibility(){
  // v61 plain road rendering from base style
  return;
}

const routeFeatures = {
  k5:{type:"Feature",geometry:{type:"LineString",coordinates:[[106.78984,-6.59458],[106.7942,-6.5937],[106.7986,-6.5914],[106.80643,-6.60276],[106.81581,-6.54236]]}},
  k6:{type:"Feature",geometry:{type:"LineString",coordinates:[[106.76385,-6.56339],[106.75124,-6.57380],[106.78984,-6.59458],[106.80643,-6.60276]]}},
  run:{type:"Feature",geometry:{type:"LineString",coordinates:[[106.79884,-6.59725],[106.8010,-6.5965],[106.8011,-6.5938],[106.7987,-6.5930],[106.79884,-6.59725]]}}
};


function makeGameBuildingIcon(kind){
  const c = document.createElement('canvas');
  c.width = 150; c.height = 150;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,.18)';
  x.beginPath(); x.ellipse(75,128,42,14,0,0,Math.PI*2); x.fill();
  const palette = {
    tower:['#6be6ff','#3b7dff','#244bba'],
    shop:['#ffd76b','#ff7aa8','#c74478'],
    park:['#89f0a8','#32b871','#16744d'],
    civic:['#ffffff','#9fb7ff','#4c63cf']
  }[kind] || ['#fff','#9fd4ff','#4373d8'];
  const g = x.createLinearGradient(0,22,0,122);
  g.addColorStop(0,palette[0]); g.addColorStop(.54,palette[1]); g.addColorStop(1,palette[2]);
  x.fillStyle = g;
  x.strokeStyle = 'rgba(255,255,255,.78)';
  x.lineWidth = 4;
  if(kind === 'park'){
    x.beginPath(); x.arc(75,62,35,0,Math.PI*2); x.fill(); x.stroke();
    x.fillStyle = '#8b5a3c'; x.fillRect(68,82,14,38);
    x.fillStyle = '#5be08d'; x.beginPath(); x.arc(54,78,20,0,Math.PI*2); x.fill();
    x.beginPath(); x.arc(96,78,20,0,Math.PI*2); x.fill();
  } else {
    x.beginPath(); x.roundRect(42,45,66,76,14); x.fill(); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.84)';
    x.beginPath(); x.roundRect(52,33,46,20,10); x.fill();
    x.fillStyle = 'rgba(21,39,78,.20)';
    for(let yy=64; yy<=94; yy+=18){
      x.fillRect(55,yy,12,10); x.fillRect(72,yy,12,10); x.fillRect(89,yy,12,10);
    }
    if(kind === 'shop'){
      x.fillStyle = '#fff'; x.fillRect(48,48,54,12);
      x.fillStyle = '#ff4f91'; x.fillRect(48,48,9,12); x.fillRect(66,48,9,12); x.fillRect(84,48,9,12);
    }
  }
  return x.getImageData(0,0,c.width,c.height);
}

function gameBuildingFeatures(){
  const base = state.playerWorld || state.gpsBase;
  const offsets = [
    [-105,72,'tower','Balai Quest'], [104,62,'shop','Kios UMKM'], [-78,-92,'park','Taman Dex'],
    [126,-92,'civic','Gedung Data'], [42,132,'shop','Warung Buff'], [-136,18,'tower','Menara Portal'],
    [162,20,'civic','Pusat Misi'], [-170,-64,'park','Hutan Mini'], [0,-150,'tower','Gate Ranger'],
    [210,112,'shop','Pasar Digital'], [-220,104,'civic','Kantor Layanan']
  ];
  const features = offsets.map((o,idx)=>{
    const [dLng,dLat]=metersToLngLatOffset(o[0],o[1],base[1]);
    return {type:'Feature',geometry:{type:'Point',coordinates:[base[0]+dLng,base[1]+dLat]},properties:{id:'gb_'+idx,kind:o[2],name:o[3]}};
  });
  // Bangunan pendamping di sekitar beberapa portal asli supaya map terasa kota-game, bukan map polos.
  state.pois.slice(0, 18).forEach((poi, idx)=>{
    const kinds = ['tower','civic','shop','park'];
    const meters = 28 + (idx % 4) * 12;
    const angle = (idx * 47) * Math.PI / 180;
    const [dLng,dLat]=metersToLngLatOffset(Math.cos(angle)*meters, Math.sin(angle)*meters, poi.coords[1]);
    features.push({type:'Feature',geometry:{type:'Point',coordinates:[poi.coords[0]+dLng, poi.coords[1]+dLat]},properties:{id:'gb_poi_'+idx,kind:kinds[idx%kinds.length],name:'Area '+poi.name}});
  });
  return features;
}

function setupGameBuildings(){
  if(!map.getSource('game-buildings')) map.addSource('game-buildings',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  ['tower','shop','park','civic'].forEach(k=>{ if(!map.hasImage('gb-'+k)) map.addImage('gb-'+k, makeGameBuildingIcon(k), {pixelRatio:2}); });
  if(!map.getLayer('game-ground')){
    map.addLayer({id:'game-ground',type:'circle',source:'game-buildings',paint:{
      'circle-radius':['interpolate',['linear'],['zoom'],16.4,34,19.3,72],
      'circle-color':['match',['get','kind'],'park','#5be08d','shop','#ffd76b','tower','#6be6ff','civic','#b9c7ff','#ffffff'],
      'circle-opacity':0.16,
      'circle-blur':0.55
    }});
  }
  if(!map.getLayer('game-building-symbols')){
    map.addLayer({id:'game-building-symbols',type:'symbol',source:'game-buildings',layout:{
      'icon-image':['concat','gb-',['get','kind']],
      'icon-size':['interpolate',['linear'],['zoom'],16.4,0.74,19.3,1.16],
      'icon-anchor':'bottom','icon-allow-overlap':true,'icon-ignore-placement':true,
      'icon-pitch-alignment':'viewport','icon-rotation-alignment':'viewport','symbol-sort-key':3
    }});
  }
  map.getSource('game-buildings').setData({type:'FeatureCollection',features:gameBuildingFeatures()});
}

function setupPoiLayers(){
  if(!map.getSource("pois")){
    map.addSource("pois", { type:"geojson", data:{ type:"FeatureCollection", features:[] }});
  }
  if(!map.hasImage("gov-marker")) map.addImage("gov-marker", makePortalIcon("#ff6475","gov"), {pixelRatio:2});
  if(!map.hasImage("halte-marker")) map.addImage("halte-marker", makePortalIcon("#4b84ff","halte"), {pixelRatio:2});
  if(!map.hasImage("health-marker")) map.addImage("health-marker", makePortalIcon("#8d7bff","health"), {pixelRatio:2});
  if(!map.hasImage("umkm-marker")) map.addImage("umkm-marker", makePortalIcon("#ffbf5e","umkm"), {pixelRatio:2});

  if(!map.getLayer("poi-glow")){
    map.addLayer({
      id:"poi-glow",
      type:"circle",
      source:"pois",
      paint:{
        "circle-radius":["interpolate",["linear"],["zoom"],16.4,74,19.3,152],
        "circle-color":["match",["get","category"],"gov","#ff6475","halte","#4b84ff","health","#8d7bff","umkm","#ffbf5e","#ffffff"],
        "circle-opacity":0.18,
        "circle-blur":0.7
      }
    });
  }

  if(!map.getLayer("poi-ring-outer")){
    map.addLayer({
      id:"poi-ring-outer",
      type:"circle",
      source:"pois",
      paint:{
        "circle-radius":["interpolate",["linear"],["zoom"],16.4,44,19.3,96],
        "circle-color":"rgba(255,255,255,0)",
        "circle-stroke-color":["match",["get","category"],"gov","#ff6475","halte","#4b84ff","health","#8d7bff","umkm","#ffbf5e","#ffffff"],
        "circle-stroke-width":4,
        "circle-stroke-opacity":0.74,
        "circle-blur":0.08
      }
    });
  }
  if(!map.getLayer("poi-ring-inner")){
    map.addLayer({
      id:"poi-ring-inner",
      type:"circle",
      source:"pois",
      paint:{
        "circle-radius":["interpolate",["linear"],["zoom"],16.4,26,19.3,58],
        "circle-color":"rgba(255,255,255,0)",
        "circle-stroke-color":"#ffffff",
        "circle-stroke-width":2,
        "circle-stroke-opacity":0.84,
        "circle-blur":0.05
      }
    });
  }

  if(!map.getLayer("poi-symbols")){
    map.addLayer({
      id:"poi-symbols",
      type:"symbol",
      source:"pois",
      layout:{
        "icon-image":["concat",["get","category"],"-marker"],
        "icon-size":["interpolate",["linear"],["zoom"],16.4,1.28,19.3,2.16],
        "icon-anchor":"bottom",
        "icon-allow-overlap":true,
        "icon-ignore-placement":true,
        "icon-pitch-alignment":"viewport",
        "icon-rotation-alignment":"viewport",
        "symbol-sort-key":20
      }
    });
  }

  if(!map.getLayer("poi-label")){
    map.addLayer({
      id:"poi-label",
      type:"symbol",
      source:"pois",
      layout:{
        "text-field":["get","name"],
        "text-size":["interpolate",["linear"],["zoom"],16.4,12,19.3,16],
        "text-offset":[0,5.2],
        "text-anchor":"top",
        "text-allow-overlap":true,
        "symbol-sort-key":10
      },
      paint:{
        "text-color":"#20365f",
        "text-halo-color":"rgba(255,255,255,0.96)",
        "text-halo-width":1.8
      },
      minzoom:16.0
    });
  }

  applyLayerFilters();

  map.on("click", "poi-symbols", (e) => {
    const feature = e.features && e.features[0];
    if(!feature) return;
    const poi = state.pois.find(p => p.id === feature.properties.id);
    if(!poi) return;
    markPoiDiscovered(poi);
    state.portalDismissedIds.add(poi.id);
    openSheet(poi, "manual");
  });

  map.on("mouseenter", "poi-symbols", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "poi-symbols", () => { map.getCanvas().style.cursor = ""; });
}
function refreshPoiSource(){
  const source = map.getSource("pois");
  if(!source) return;
  const visible = state.pois.filter(p => p && p.coords && p.aktif !== false && p.showOnMap !== false).map(toFeature);
  source.setData({ type:"FeatureCollection", features: visible });
  state.__visiblePoiCount = visible.length;
  return visible.length;
}
function applyLayerFilters(){
  const f = ["any"];
  if(state.layers.gov) f.push(["==", ["get","category"], "gov"]);
  if(state.layers.transit) f.push(["==", ["get","category"], "halte"]);
  if(state.layers.health) f.push(["==", ["get","category"], "health"]);
  if(state.layers.umkm) f.push(["==", ["get","category"], "umkm"]);
  const filter = f.length === 1 ? ["==", ["get","category"], "__none__"] : f;
  if(map.getLayer("poi-glow")) map.setFilter("poi-glow", filter);
  if(map.getLayer("poi-ring-outer")) map.setFilter("poi-ring-outer", filter);
  if(map.getLayer("poi-ring-inner")) map.setFilter("poi-ring-inner", filter);
  if(map.getLayer("poi-symbols")) map.setFilter("poi-symbols", filter);
  if(map.getLayer("poi-label")) map.setFilter("poi-label", filter);
}

function questPopupEl(){ return document.getElementById("questPopup"); }
function showQuestPopup(poi, dist){
  const el = questPopupEl();
  if(!poi || !poi.id || !el || state.activeQuestPoiId === poi.id) return;
  if(state.portalDismissedIds.has(poi.id) || state.portalSeenIds.has(poi.id)) return;
  // Portal quest hanya boleh muncul sekali. Begitu popup pertama kali tampil,
  // id langsung disimpan supaya tidak spam muncul lagi walaupun user masih di radius.
  markPortalPopupDone(poi.id);
  state.activeQuestPoiId = poi.id;
  state.lastPoi = poi;
  if(poi.group === "CITIZEN REPORT"){
    renderUserReportSheet(poi);
    syncMiniButton();
    updateStatus(poi.name || "Info Warga");
    return;
  }
  const quest = getQuestById(poi.questId);
  document.getElementById("questPortalName").textContent = poi.name;
  document.getElementById("questPortalType").textContent = poi.group || "Portal BogorDex";
  document.getElementById("questPortalDesc").textContent = quest ? `${quest.name} • ${quest.desc || poi.fungsi || poi.desc || ""}` : (poi.fungsi || poi.desc || "Dekati portal ini untuk membuka informasi lokasi dan menambah koleksi Dex.");
  document.getElementById("questPortalDistance").textContent = Math.max(1, Math.round(dist)) + " m";
  el.classList.remove("hidden");
  el.classList.remove("quest-pop");
  void el.offsetWidth;
  el.classList.add("quest-pop");
}
function hideQuestPopup(markDismissed=false){
  if(markDismissed && state.activeQuestPoiId) markPortalPopupDone(state.activeQuestPoiId);
  const el = questPopupEl();
  if(el) el.classList.add("hidden");
  state.activeQuestPoiId = null;
}
function dismissActiveQuestPopup(){ hideQuestPopup(true); }
function startQuestFromPopup(){
  if(!state.lastPoi) return;
  markPoiDiscovered(state.lastPoi);
  if(state.lastPoi && state.lastPoi.id) markPortalPopupDone(state.lastPoi.id);
  hideQuestPopup(true);
  openSheet(state.lastPoi, "manual");
  updateStatus("Quest dibuka: " + state.lastPoi.name);
}

function nearestPoiWithin(pos, threshold=90, usePoiRadius=false){
  let best = null, bestDist = Infinity;
  for(const poi of state.pois){
    const d = haversineMeters(pos, poi.coords);
    const limit = usePoiRadius ? Math.max(12, Number(poi.radius || threshold) || threshold) : threshold;
    if(d <= limit && d < bestDist){ bestDist = d; best = poi; }
  }
  return best ? { poi: best, dist: bestDist } : null;
}
function updateNearestHighlight(){
  if(!map.getSource("nearest-poi")) return;
  const hit = nearestPoiWithin(state.playerWorld, 320);
  const features = hit ? [{
    type:"Feature",
    geometry:{type:"Point", coordinates: hit.poi.coords},
    properties:{name:hit.poi.name}
  }] : [];
  map.getSource("nearest-poi").setData({type:"FeatureCollection", features});
}
function detectNearby(){
  updateNearestHighlight();
  checkEventNearby();
  const hit = nearestPoiWithin(state.playerWorld, state.portalNoticeRadiusMeters, true);
  if(hit){
    const isNewDiscover = markPoiDiscovered(hit.poi);
    if(isNewDiscover || (!state.portalSeenIds.has(hit.poi.id) && !state.portalDismissedIds.has(hit.poi.id))){
      maybeNotifyPortalFound(hit.poi, hit.dist);
    }
    showQuestPopup(hit.poi, hit.dist);
    updateStatus("Portal terdeteksi: " + hit.poi.name + " • " + Math.max(1, Math.round(hit.dist)) + " m");
  } else {
    hideQuestPopup(false);
    if(state.activePoiMode === "auto") closeSheet(true, true);
    updateStatus(state.hasRealGps ? "Lokasi aktif" : "Lokasi simulasi");
  }
}

function clearEventMarkers(){
  (state.eventMarkers||[]).forEach(m => { try{m.remove();}catch(e){} });
  state.eventMarkers=[];
}
function eventPortalElement(event){
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'event-portal-marker single-event ' + (event.kind || 'macet');
  el.innerHTML = `
    <span class="event-portal-core"></span>
    <span class="event-portal-img"></span>
    <span class="event-portal-label">${event.title}</span>
  `;
  el.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    openSheet({
      id:event.id,
      name:event.title,
      desc:event.desc || 'Portal event kepadatan lalu lintas.',
      fungsi:'Event kemacetan / aktivitas ramai',
      tupoksi:(TOMTOM_API_KEY ? 'Sumber disiapkan dari TomTom Traffic API.' : 'Demo pajangan dulu. Isi window.BOGORDEX_TOMTOM_API_KEY untuk data TomTom realtime.'),
      group:'EVENT PORTAL',
      aktif:true,
      coords:event.coords
    }, 'manual');
  });
  return el;
}
function pickEventCoordinateFallback(){
  const base = state.playerWorld || state.gpsBase || [106.79884,-6.59725];
  const bearing = getCameraBearing();
  const rad = degToRad(bearing);
  const mx = Math.sin(rad) * 105;
  const my = Math.cos(rad) * 105;
  const [dLng,dLat] = metersToLngLatOffset(mx, my, base[1]);
  const raw = [base[0] + dLng, base[1] + dLat];
  return snapCoordToNearestRoad(raw, 220) || raw;
}
function eventFromTomTomIncident(incident){
  try{
    const coords = incident?.geometry?.coordinates;
    let first = null;
    if(Array.isArray(coords)){
      if(typeof coords[0] === 'number') first = coords;
      else if(Array.isArray(coords[0]) && typeof coords[0][0] === 'number') first = coords[0];
      else if(Array.isArray(coords[0]) && Array.isArray(coords[0][0])) first = coords[0][0];
    }
    if(!first) return null;
    const props = incident.properties || {};
    const desc = props?.events?.[0]?.description || props?.from || 'Kepadatan lalu lintas terdeteksi.';
    return {
      id:'tomtom_' + (props.id || Date.now()),
      title:'Portal Macet',
      desc,
      level:'Traffic realtime',
      kind:'macet',
      source:'TomTom Traffic',
      coords:snapCoordToNearestRoad([Number(first[0]), Number(first[1])], 200) || [Number(first[0]), Number(first[1])]
    };
  }catch(e){ return null; }
}
async function loadRealtimeEventPortals(){
  try{
    let event = null;
    if(TOMTOM_API_KEY){
      const [lng, lat] = state.gpsBase || state.playerWorld || [106.79884,-6.59725];
      const delta = 0.018;
      const bbox = `${lng-delta},${lat-delta},${lng+delta},${lat+delta}`;
      const fields = encodeURIComponent('{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code},from,to}}}');
      const url = TOMTOM_TRAFFIC_ENDPOINT || `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${bbox}&fields=${fields}&language=id-ID&t=-1&key=${encodeURIComponent(TOMTOM_API_KEY)}`;
      const res = await fetch(url, { cache:'no-store' });
      if(res.ok){
        const data = await res.json();
        const incident = (data.incidents || [])[0];
        event = eventFromTomTomIncident(incident);
      }
    }
    if(!event){
      event = {
        id:'event_pajangan_macet',
        title:'Portal Macet',
        desc:'Pajangan event kemacetan. Nanti tinggal isi TomTom API key untuk data realtime.',
        level:'Demo kepadatan',
        kind:'macet',
        source:'Demo local',
        coords: pickEventCoordinateFallback()
      };
    }
    state.eventPortals = [event]; // cuma 1 portal, bukan banyak
    renderRealtimeEventPortals();
  }catch(err){
    console.warn('TomTom/event portal skipped', err);
  }
}
function renderRealtimeEventPortals(){
  if(!map || !maplibregl) return;
  clearEventMarkers();
  (state.eventPortals || []).slice(0,1).forEach((event) => {
    const marker = new maplibregl.Marker({ element:eventPortalElement(event), anchor:'bottom', offset:[0,8], rotationAlignment:'viewport', pitchAlignment:'viewport' }).setLngLat(event.coords).addTo(map);
    state.eventMarkers.push(marker);
  });
}
function checkEventNearby(){
  const event = (state.eventPortals || [])[0];
  if(!event || !event.coords) return;
  const dist = haversineMeters(state.playerWorld, event.coords);
  if(dist <= 80 && state.__lastEventNearbyId !== event.id){
    state.__lastEventNearbyId = event.id;
    flashEventNotice(event.title || 'Event kota', event.desc || event.level || 'Ada aktivitas dekat karakter');
    showAnimeToast('event', event.title || 'Event kota', event.desc || 'Event terdeteksi di sekitar kamu', [event.source || 'Realtime / Demo', `${Math.round(dist)} m`]);
  }
  if(dist > 120 && state.__lastEventNearbyId === event.id){
    state.__lastEventNearbyId = null;
  }
}

async function fetchOsrmRoute(start, target){
  try{
    const coords = `${start[0]},${start[1]};${target[0]},${target[1]}`;
    const url = `${OSRM_BASE_URL}/route/v1/${OSRM_PROFILE}/${coords}?overview=full&geometries=geojson&steps=false&continue_straight=true`;
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const route = data && data.routes && data.routes[0];
    const coordsOut = route && route.geometry && route.geometry.coordinates;
    if(Array.isArray(coordsOut) && coordsOut.length >= 2) return coordsOut;
  }catch(err){
    console.warn('OSRM route failed', err);
  }
  return null;
}

async function fetchOsrmNearest(coord){
  try{
    const url = `${OSRM_BASE_URL}/nearest/v1/${OSRM_PROFILE}/${coord[0]},${coord[1]}?number=1`;
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const wp = data && data.waypoints && data.waypoints[0];
    if(wp && Array.isArray(wp.location) && wp.location.length === 2) return [Number(wp.location[0]), Number(wp.location[1])];
  }catch(err){
    console.warn('OSRM nearest failed', err);
  }
  return null;
}

async function tryOsrmNearestSnap(coord, opts={}){
  const now = Date.now();
  if(state.osrmNearestPending) return null;
  if(!opts.force && (now - (state.osrmLastNearestAt || 0)) < OSRM_NEAREST_MIN_INTERVAL_MS) return null;
  state.osrmNearestPending = true;
  state.osrmLastNearestAt = now;
  state.osrmLastNearestCoord = coord;
  try{
    const snapped = await fetchOsrmNearest(coord);
    if(!snapped) return null;
    if(haversineMeters(coord, snapped) > (opts.maxDistanceMeters || 45)) return null;
    if(opts.apply !== false){
      state.playerWorld = snapped;
      const [baseLng, baseLat] = state.gpsBase;
      state.offsetMeters.x = (snapped[0] - baseLng) * (111320 * Math.cos(baseLat * Math.PI/180));
      state.offsetMeters.y = (snapped[1] - baseLat) * 110540;
      updatePlayerMapMarker();
    }
    return snapped;
  } finally {
    state.osrmNearestPending = false;
  }
}

function navigationDisplayRouteCoords(routeCoords){
  if(!Array.isArray(routeCoords) || routeCoords.length < 2) return routeCoords;
  const player = Array.isArray(state.playerWorld) ? [Number(state.playerWorld[0]), Number(state.playerWorld[1])] : null;
  if(!player || !Number.isFinite(player[0]) || !Number.isFinite(player[1])) return routeCoords;

  // v123: visual route selalu dimulai dari posisi karakter SEKARANG,
  // lalu disambung ke titik rute jalan terdekat. Bagian rute yang sudah dilewati dipotong,
  // jadi garis tidak makin panjang/ketarik ke titik lama saat player bergerak.
  let nearestIndex = 0;
  let best = Infinity;
  for(let i=0;i<routeCoords.length;i++){
    const d = haversineMeters(player, routeCoords[i]);
    if(d < best){ best = d; nearestIndex = i; }
  }
  const remaining = routeCoords.slice(Math.max(0, nearestIndex));
  if(!remaining.length) return [player, routeCoords[routeCoords.length-1]];
  if(haversineMeters(player, remaining[0]) <= 1.5){
    remaining[0] = player;
    return remaining;
  }
  return [player, ...remaining];
}
function pushNavigationRouteToMap(routeCoords){
  if(!map || !routeCoords || routeCoords.length < 2) return;
  const src = map.getSource('bdx-navigation-route');
  if(src){
    const display = navigationDisplayRouteCoords(routeCoords);
    src.setData({ type:'FeatureCollection', features:[{ type:'Feature', properties:{}, geometry:{ type:'LineString', coordinates: display } }] });
  }
}
function renderNavigationRoute(routeCoords, fit=true){
  if(!routeCoords || routeCoords.length < 2 || !map) return;
  state.navigationRouteRawCoords = routeCoords.slice();
  state.navigationRouteCoords = routeCoords.slice();
  state.navigationArrived = false;
  pushNavigationRouteToMap(routeCoords);
  try{
    if(map.getLayer('bdx-navigation-route-glow')) map.moveLayer('bdx-navigation-route-glow');
    if(map.getLayer('bdx-navigation-route-line')) map.moveLayer('bdx-navigation-route-line');
  }catch(e){}
  if(fit){
    // Jangan paksa kamera jauh ke seluruh bounds. Mode arahkan harus tetap fokus ke karakter,
    // lalu map berputar mengikuti arah jalur di depan player.
    followNavigationCamera(true);
  }
}

function ensureRouteLayer(){
  if(!map || !map.isStyleLoaded()) return;
  if(!map.getSource('bdx-navigation-route')){
    map.addSource('bdx-navigation-route', { type:'geojson', data:{type:'FeatureCollection',features:[]} });
  }
  if(!map.getLayer('bdx-navigation-route-glow')){
    map.addLayer({ id:'bdx-navigation-route-glow', type:'line', source:'bdx-navigation-route', layout:{'line-cap':'round','line-join':'round'}, paint:{ 'line-color':'#ffffff', 'line-width':24, 'line-opacity':0.88, 'line-blur':7 } });
  }
  if(!map.getLayer('bdx-navigation-route-line')){
    map.addLayer({ id:'bdx-navigation-route-line', type:'line', source:'bdx-navigation-route', layout:{'line-cap':'round','line-join':'round'}, paint:{ 'line-color':'#ff3fb4', 'line-width':9, 'line-opacity':1, 'line-dasharray':[1.2,0.55] } });
  }
  try{
    map.setPaintProperty('bdx-navigation-route-glow','line-color','#ffffff');
    map.setPaintProperty('bdx-navigation-route-glow','line-width',24);
    map.setPaintProperty('bdx-navigation-route-glow','line-opacity',0.88);
    map.setPaintProperty('bdx-navigation-route-glow','line-blur',7);
    map.setPaintProperty('bdx-navigation-route-line','line-color','#ff3fb4');
    map.setPaintProperty('bdx-navigation-route-line','line-width',9);
    map.setPaintProperty('bdx-navigation-route-line','line-opacity',1);
    map.setPaintProperty('bdx-navigation-route-line','line-dasharray',[1.2,0.55]);
    if(map.getLayer('bdx-navigation-route-glow')) map.moveLayer('bdx-navigation-route-glow');
    if(map.getLayer('bdx-navigation-route-line')) map.moveLayer('bdx-navigation-route-line');
  }catch(e){}
}
function buildSnappedRoutePoints(start, target){
  const pts = [];
  const startSnap = snapCoordToNearestRoad(start, 300) || start;
  const targetSnap = snapCoordToNearestRoad(target, 300) || target;
  pts.push(startSnap);
  const steps = 16;
  for(let i=1;i<steps;i++){
    const t = i / steps;
    const interp = [
      startSnap[0] + (targetSnap[0] - startSnap[0]) * t,
      startSnap[1] + (targetSnap[1] - startSnap[1]) * t
    ];
    const snapped = snapCoordToNearestRoad(interp, 240) || interp;
    const prev = pts[pts.length - 1];
    if(!prev || haversineMeters(prev, snapped) > 3) pts.push(snapped);
  }
  pts.push(targetSnap);
  return pts;
}
async function setNavigationTarget(target){
  if(!target || !target.coords || !map) return;
  closeSheet(true, true);
  closeMapDex?.();
  closeMainMenu?.();
  clearNavigationTarget(true);
  ensureRouteLayer();
  state.navigationArrived = false;
  state.navigationIsBuilding = true;
  updateStatus('Mengambil jalur jalan ke ' + (target.title || target.name || 'portal') + '…');
  let routeCoords = null;
  try{
    state.osrmRouteRequestAt = Date.now();
    const startSnap = await fetchOsrmNearest(state.playerWorld) || snapCoordToNearestRoad(state.playerWorld, 300) || state.playerWorld;
    const targetSnap = await fetchOsrmNearest(target.coords) || snapCoordToNearestRoad(target.coords, 300) || target.coords;
    routeCoords = await fetchOsrmRoute(startSnap, targetSnap);
  }catch(err){
    console.warn('Navigation OSRM error', err);
  }
  state.navigationIsBuilding = false;
  if(!routeCoords || routeCoords.length < 2){
    state.navigationTarget = null;
    state.navigationRouteCoords = null;
    updateStatus('Rute jalan belum tersedia ke ' + (target.title || target.name || 'portal'));
    showNavigationFail(target);
    return;
  }
  state.navigationTarget = target;
  renderNavigationRoute(routeCoords, true);
  updateStatus('Arah jalan aktif ke ' + (target.title || target.name || 'portal'));
  showNavigationBanner(target, 'Ikuti garis pink di jalan');
  updateNavigationUi();
}


async function fetchSheetRows(sheetName){
  const res = await fetch(sheetUrl(sheetName), { cache:"no-store" });
  const txt = await res.text();
  const json = JSON.parse(txt.substring(47, txt.length - 2));
  const cols = (json.table.cols || []).map(c => (c.label || "").trim());
  const rows = (json.table.rows || []).map(r => (r.c || []).map(cell => cell ? cell.v : ""));
  return { cols, rows };
}
async function loadSheetData(){
  let loadedFromSheet = false;
  try{
    if(SHEET_ID){
      updateStatus("Memuat master Google Sheet…");
      const [lokasiData, questData, badgeData] = await Promise.all([
        fetchSheetRows(SHEETS.lokasi),
        fetchSheetRows(SHEETS.quest),
        fetchSheetRows(SHEETS.badge)
      ]);
      state.pois = normalizeRows(lokasiData.rows, false, lokasiData.cols);
      state.quests = normalizeQuestRows(questData.rows, false, questData.cols);
      state.badges = normalizeBadgeRows(badgeData.rows, false, badgeData.cols);
      loadedFromSheet = true;
    }
  } catch(err){
    console.warn("Gagal memuat Google Sheet master:", err);
  }
  if(!loadedFromSheet){
    const master = window.BOGORDEX_MASTER_DATA || {};
    state.pois = normalizeRows(master.lokasi || window.BOGORDEX_FALLBACK_DATA || [], true);
    state.quests = normalizeQuestRows(master.quests || [], true);
    state.badges = normalizeBadgeRows(master.badges || [], true);
  }
  syncPlayerProfileFromProgress();
  setupPoiLayers();
  refreshPoiSource();
  updateNearestHighlight();
  renderDex();
  renderNPCs();
  await loadRealtimeEventPortals();
  flushGasQueue();
  const visibleCount = refreshPoiSource() || 0;
  setTimeout(() => { try{ refreshPoiSource(); updateNearestHighlight(); }catch(e){} }, 300);
  setTimeout(() => { try{ refreshPoiSource(); updateNearestHighlight(); }catch(e){} }, 1400);
  updateStatus(`Mode game aktif • ${state.pois.length} lokasi dimuat • ${visibleCount} tampil di map • ${state.quests.length} quest • ${state.badges.length} badge`);
}
function normalizeHeading(value){
  let n = Number(value);
  if(!Number.isFinite(n)) return null;
  n = ((n % 360) + 360) % 360;
  return n;
}
function handleDeviceOrientation(ev){
  let heading = null;
  if(typeof ev.webkitCompassHeading === "number"){
    // iOS/Safari: ini heading kompas asli.
    heading = ev.webkitCompassHeading;
  }else if(ev.absolute === true && typeof ev.alpha === "number"){
    // Android Chrome: alpha absolut. Koreksi orientasi layar supaya portrait/landscape tetap pas.
    heading = 360 - ev.alpha + getScreenOrientationAngle();
  }else if(typeof ev.alpha === "number" && ev.absolute !== false){
    heading = 360 - ev.alpha + getScreenOrientationAngle();
  }
  heading = normalizeHeading(heading);
  if(heading === null) return;
  applyDeviceHeadingToCamera(heading, 260);
}
async function requestDeviceCompass(){
  if(state.compassRequested) return;
  state.compassRequested = true;
  try{
    if(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function"){
      const res = await DeviceOrientationEvent.requestPermission();
      if(res !== "granted"){ updateStatus("Kompas HP belum diizinkan"); return; }
    }
    window.addEventListener("deviceorientationabsolute", handleDeviceOrientation, true);
    window.addEventListener("deviceorientation", handleDeviceOrientation, true);
    window.addEventListener("orientationchange", () => setTimeout(() => { if(state.deviceHeadingEnabled) followPlayerCamera({ duration:120 }); }, 180), true);
    updateStatus("Kompas HP aktif • mode halus");
  }catch(err){
    console.warn("Compass unavailable", err);
  }
}
function startLocation(){
  requestDeviceCompass();
  if(!navigator.geolocation){ updateStatus("Browser tidak mendukung lokasi"); return; }
  updateStatus("Mengambil lokasi…");
  if(state.geoWatch !== null) navigator.geolocation.clearWatch(state.geoWatch);
  state.geoWatch = navigator.geolocation.watchPosition(
    (pos) => {
      state.hasRealGps = true;
      const incomingGps = [pos.coords.longitude, pos.coords.latitude];
      const nowMs = Date.now();
      if(!state.gpsSmooth){
        state.gpsSmooth = incomingGps;
        state.gpsLastAccepted = incomingGps;
        state.gpsAcceptedAt = nowMs;
      }else{
        const jumpRaw = haversineMeters(state.gpsSmooth, incomingGps);
        if(jumpRaw < GPS_POSITION_DEADBAND_METERS && (nowMs - (state.gpsAcceptedAt || 0)) < 1400){
          return;
        }
        const alpha = jumpRaw > GPS_JUMP_HARD_LIMIT_METERS ? 0.12 : (jumpRaw > 14 ? 0.09 : 0.045);
        const nextSmooth = [
          state.gpsSmooth[0] + (incomingGps[0] - state.gpsSmooth[0]) * alpha,
          state.gpsSmooth[1] + (incomingGps[1] - state.gpsSmooth[1]) * alpha
        ];
        if(state.gpsLastAccepted){
          const acceptedJump = haversineMeters(state.gpsLastAccepted, nextSmooth);
          if(acceptedJump < GPS_POSITION_DEADBAND_METERS && (nowMs - (state.gpsAcceptedAt || 0)) < 1200){
            return;
          }
        }
        state.gpsSmooth = nextSmooth;
        state.gpsLastAccepted = nextSmooth;
        state.gpsAcceptedAt = nowMs;
      }
      const prevWorld = state.playerWorld ? [state.playerWorld[0], state.playerWorld[1]] : null;
      state.gpsBase = state.gpsSmooth;
      state.offsetMeters.x = 0;
      state.offsetMeters.y = 0;
      state.playerWorld = [state.gpsSmooth[0], state.gpsSmooth[1]];
      if(prevWorld){
        const gpsMoveMeters = haversineMeters(prevWorld, state.playerWorld);
        addDailyMovementMeters(gpsMoveMeters);
        savePlayerProgress();
      }
      snapPlayerToRoad(true);
      applyGpsWalkAnimation(prevWorld, state.playerWorld, pos);
      updatePlayerMapMarker();
      updateRenderBounds();
      if(pos.coords && Number.isFinite(pos.coords.heading)){
        state.gpsHeading = normalizeHeading(pos.coords.heading);
        if((pos.coords.speed || 0) > 0.55){
          updateCompassNeedleVisual(state.gpsHeading);
        }
        if(!state.deviceHeadingEnabled && (pos.coords.speed || 0) > 0.55){
          applyDeviceHeadingToCamera(pos.coords.heading, 220);
        }
      }
      if(!state.browsing && !state.move.up && !state.move.down && !state.move.left && !state.move.right){
        if(state.navigationTarget) followNavigationCamera(false);
        else followPlayerCamera({ duration:420, force:true });
      }
      detectNearby();
      updateStatus(state.deviceHeadingEnabled ? "Lokasi aktif • GPS walking • kompas aktif" : "Lokasi aktif • GPS walking");
      refreshEnvironment();
    },
    (err) => { state.hasRealGps = false; updateStatus("Lokasi gagal: " + err.message); },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}
function startBrowse(){
  state.browsing = true;
  document.getElementById("app")?.classList.add("app-browsing");
  if(state.snapTimer) clearTimeout(state.snapTimer);
}
function stopBrowse(){
  if(state.snapTimer) clearTimeout(state.snapTimer);
  state.snapTimer = setTimeout(() => {
    state.browsing = false;
    document.getElementById("app")?.classList.remove("app-browsing");
    // V36: jangan paksa map balik ke karakter setelah user geser peta.
    // Karakter tetap di koordinat aslinya sebagai marker map.
  }, 220);
}

function getBuildingCollisionLayers(){
  if(!map || !map.getStyle) return [];
  const preferred = ['bdx-building-collision','bdx-3d-buildings','building','buildings','building-3d','3d-buildings'];
  const found = [];
  preferred.forEach(id => { if(map.getLayer(id)) found.push(id); });
  const styleLayers = (map.getStyle().layers || []);
  styleLayers.forEach(layer => {
    const id = String(layer.id || '').toLowerCase();
    const sourceLayer = String(layer['source-layer'] || '').toLowerCase();
    if((layer.type === 'fill' || layer.type === 'fill-extrusion') && (id.includes('building') || sourceLayer.includes('building'))){
      if(!found.includes(layer.id)) found.push(layer.id);
    }
  });
  return found;
}
function getBlockedMapLayers(){
  if(!map || !map.getStyle) return [];
  const styleLayers = (map.getStyle().layers || []);
  const found = [];
  styleLayers.forEach(layer => {
    const id = String(layer.id || '').toLowerCase();
    const sl = String(layer['source-layer'] || '').toLowerCase();
    const isSolid = layer.type === 'fill' || layer.type === 'fill-extrusion';
    const isBlocked =
      id.includes('building') || sl.includes('building') ||
      id.includes('water') || sl.includes('water') ||
      id.includes('waterway') || sl.includes('waterway');
    if(isSolid && isBlocked && !found.includes(layer.id)) found.push(layer.id);
  });
  if(map.getLayer('bdx-building-collision') && !found.includes('bdx-building-collision')) found.push('bdx-building-collision');
  return found;
}
function getRoadCollisionLayers(){
  if(!map || !map.getStyle) return [];
  const styleLayers = (map.getStyle().layers || []);
  const found = [];
  styleLayers.forEach(layer => {
    const id = String(layer.id || '').toLowerCase();
    const sl = String(layer['source-layer'] || '').toLowerCase();
    const cls = String(layer.filter || '').toLowerCase();
    const looksRoad =
      layer.type === 'line' &&
      !id.includes('label') &&
      !id.includes('rail') &&
      !id.includes('water') &&
      (
        id.includes('road') || id.includes('street') || id.includes('path') || id.includes('highway') ||
        id.includes('footway') || id.includes('service') || id.includes('track') ||
        sl.includes('transportation') || cls.includes('road') || cls.includes('street') || cls.includes('path') ||
        cls.includes('footway') || cls.includes('service') || cls.includes('track')
      );
    if(looksRoad && !found.includes(layer.id)) found.push(layer.id);
  });
  return found;
}
function queryFeaturesAround(coord, layers, radiusPx){
  if(!layers.length) return [];
  const p = map.project(coord);
  const r = radiusPx || 20;
  try{
    return map.queryRenderedFeatures([[p.x-r, p.y-r], [p.x+r, p.y+r]], { layers });
  }catch(err){
    return [];
  }
}
function isCoordBlockedBySolidMap(coord){
  if(!state.collisionEnabled || !map || !map.loaded || !map.loaded()) return false;
  const layers = getBlockedMapLayers().filter(id => map.getLayer(id));
  const features = queryFeaturesAround(coord, layers, state.collisionRadiusPx || 20);
  return features.length > 0;
}
function isCoordOnRoad(coord){
  if(!state.roadOnlyMode || !map || !map.loaded || !map.loaded()) return true;
  const layers = getRoadCollisionLayers().filter(id => map.getLayer(id));
  // Kalau style belum expose layer jalan, jangan bikin player stuck total.
  if(!layers.length) return true;
  const features = queryFeaturesAround(coord, layers, state.roadRadiusPx || 34);
  return features.length > 0;
}
function canPlayerStandAt(coord){
  if(isCoordBlockedBySolidMap(coord)) return false;
  if(!isCoordOnRoad(coord)) return false;
  return true;
}
function worldFromOffset(x, y){
  const [dLng, dLat] = metersToLngLatOffset(x, y, state.gpsBase[1]);
  return [state.gpsBase[0] + dLng, state.gpsBase[1] + dLat];
}
function nearestPointOnSegmentPx(p, a, b){
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = p.x - a.x, apy = p.y - a.y;
  const ab2 = abx*abx + aby*aby || 1;
  const t = Math.max(0, Math.min(1, (apx*abx + apy*aby) / ab2));
  return { x:a.x + abx*t, y:a.y + aby*t, t };
}
function snapCoordToNearestRoad(coord, maxRadiusPx = 120){
  if(!map || !map.loaded || !map.loaded()) return coord;
  const layers = getRoadCollisionLayers().filter(id => map.getLayer(id));
  if(!layers.length) return coord;
  const p = map.project(coord);
  let best = null;
  let bestDist = Infinity;
  let feats = queryFeaturesAround(coord, layers, maxRadiusPx);
  if(!feats.length) feats = queryFeaturesAround(coord, layers, Math.max(maxRadiusPx, 180));
  if(!feats.length) feats = queryFeaturesAround(coord, layers, Math.max(maxRadiusPx, 260));
  feats.forEach(feat => {
    const geom = feat?.geometry;
    if(!geom) return;
    const lines = geom.type === 'LineString' ? [geom.coordinates] : (geom.type === 'MultiLineString' ? geom.coordinates : []);
    lines.forEach(line => {
      for(let i=0;i<line.length-1;i++){
        const a = map.project(line[i]);
        const b = map.project(line[i+1]);
        const np = nearestPointOnSegmentPx(p, a, b);
        const dx = np.x - p.x, dy = np.y - p.y;
        const d = Math.hypot(dx, dy);
        if(d < bestDist){ bestDist = d; best = map.unproject([np.x, np.y]); }
      }
    });
  });
  if(best && bestDist <= maxRadiusPx){
    return [best.lng, best.lat];
  }
  return coord;
}
function snapPlayerToRoad(force = false){
  // v123: Player/karakter tidak ditempelkan ke jalan.
  // GPS dan WASD tetap posisi asli/simulasi apa adanya.
  // OSRM/snap jalan hanya dipakai saat membuat rute Arahkan, bukan untuk menggeser player.
  return;
}
function tryMoveWithCollision(mx, my){
  const originalX = state.offsetMeters.x;
  const originalY = state.offsetMeters.y;
  let nx = originalX + mx;
  let ny = originalY + my;
  const d = Math.hypot(nx, ny);
  if(d > state.maxOffsetMeters){
    const r = state.maxOffsetMeters / d;
    nx *= r;
    ny *= r;
  }
  state.offsetMeters.x = nx;
  state.offsetMeters.y = ny;
  state.playerWorld = worldFromOffset(nx, ny);
  return true;
}


function manualMoveAngleFromInput(forwardInput, strafeInput){
  if(!forwardInput && !strafeInput) return 0;
  return Math.atan2(strafeInput, forwardInput) * 180 / Math.PI;
}
function manualMoveKeyFromInput(forwardInput, strafeInput){
  return `${forwardInput}|${strafeInput}|${state.touchDragMove || ''}`;
}
function manualScreenFacing(forwardInput, strafeInput){
  if(Math.abs(forwardInput) >= Math.abs(strafeInput)){
    if(forwardInput > 0) return 'up';
    if(forwardInput < 0) return 'down';
  }
  if(strafeInput > 0) return 'right';
  if(strafeInput < 0) return 'left';
  return state.facing || 'up';
}
function manualMoveBearingFromScreen(forwardInput, strafeInput){
  if(!forwardInput && !strafeInput) return getCameraBearing();
  // v126: kontrol WASD/D-pad dihitung dari posisi layar nyata, bukan rumus bearing manual.
  // Ini bikin W selalu ke atas layar, A ke kiri layar, D ke kanan layar walau kamera direction auto-rotate.
  if(map && state.playerWorld && typeof map.project === 'function' && typeof map.unproject === 'function'){
    try{
      const p = map.project(state.playerWorld);
      const len = 96;
      const targetPx = { x: p.x + (strafeInput * len), y: p.y - (forwardInput * len) };
      const ll = map.unproject(targetPx);
      const target = [Number(ll.lng), Number(ll.lat)];
      const b = bearingBetweenCoords(state.playerWorld, target);
      if(typeof b === 'number' && Number.isFinite(b)) return b;
    }catch(e){}
  }
  // fallback kalau project/unproject belum siap
  return normalizeHeading(getCameraBearing() + manualMoveAngleFromInput(forwardInput, strafeInput));
}
function updateManualCameraTarget(forwardInput, strafeInput){
  const key = manualMoveKeyFromInput(forwardInput, strafeInput);
  if(!forwardInput && !strafeInput){
    state.manualMoveKey = '';
    state.manualMoveBaseBearing = null;
    state.manualMoveTargetBearing = null;
    return getCameraBearing();
  }
  // Jangan dikunci dari input pertama, karena saat mode Arahkan kamera ikut muter.
  // Bearing gerak harus dihitung ulang setiap frame dari orientasi layar terbaru.
  state.manualMoveKey = key;
  state.manualMoveBaseBearing = getCameraBearing();
  state.manualMoveTargetBearing = manualMoveBearingFromScreen(forwardInput, strafeInput);
  return state.manualMoveTargetBearing;
}
function setBottomNavActive(name){
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
  const map = {home:'bottomHomeBtn', mission:'bottomMissionBtn', inventory:'bottomInventoryBtn', profile:'bottomProfileBtn'};
  const el = document.getElementById(map[name] || 'bottomHomeBtn');
  if(el) el.classList.add('active');
}

function updateMovement(dt=1/60){
  const forwardInput = (state.move.up ? 1 : 0) - (state.move.down ? 1 : 0);
  const strafeInput = (state.move.right ? 1 : 0) - (state.move.left ? 1 : 0);

  if(state.hasRealGps && state.geoWatch !== null && !forwardInput && !strafeInput){
    updateManualCameraTarget(0, 0);
    if(Date.now() > (state.gpsMovingUntil || 0) && !playerSprite().classList.contains('idle')) setPlayerAnim('idle', state.facing || 'up');
    return;
  }

  if(!forwardInput && !strafeInput){
    updateManualCameraTarget(0, 0);
    if(!playerSprite().classList.contains("idle")) setPlayerAnim("idle");
    return;
  }

  // v89: arah gerak manual tetap mengikuti input user, tapi kamera tidak auto-rotate 180 derajat.
  // Jadi third-person feel tetap stabil dan lebih nyaman di HP/Desktop.
  const moveBearing = updateManualCameraTarget(forwardInput, strafeInput);
  const step = state.moveSpeedMeters * Math.min(0.033, Math.max(0.008, dt));

  const rad = degToRad(moveBearing);
  let mx = Math.sin(rad) * step;
  let my = Math.cos(rad) * step;

  const facing = facingFromMovementBearing(moveBearing, manualScreenFacing(forwardInput, strafeInput));
  const moved = tryMoveWithCollision(mx, my);
  if(moved){ addDailyMovementMeters(Math.sqrt(mx*mx + my*my)); savePlayerProgress(); }

  state.playerFrameTick += dt;
  if(state.playerFrameTick > 0.15){
    state.playerFrameTick = 0;
    state.playerStepFrame = (state.playerStepFrame + 1) % 4;
    applyPlayerSpriteFrame();
  }
  if(!playerSprite().classList.contains("walk") || state.facing !== facing) setPlayerAnim("walk", facing);

  if(moved){
    snapPlayerToRoad();
    updatePlayerMapMarker();
    updateRenderBounds();
    if(state.navigationTarget){
      followNavigationCamera(false);
    }else{
      followPlayerCamera({ bearing: getCameraBearing(), zoom: CAMERA_ZOOM, duration: 120, force:true });
    }
    detectNearby();
  }else{
    updateStatus("Gerak bebas simulasi");
    // kamera dibiarkan stabil; cukup pertahankan pitch biar pandangan tidak muter sendiri
    if(map) map.easeTo({ bearing: getCameraBearing(), pitch: CAMERA_PITCH, duration: 120 });
  }
}
function bindMoveButton(btn){
  const dir = btn.dataset.dir;
  const down = () => { state.move[dir] = true; };
  const up = () => { state.move[dir] = false; };
  btn.addEventListener("mousedown", down);
  btn.addEventListener("mouseup", up);
  btn.addEventListener("mouseleave", up);
  btn.addEventListener("touchstart", (e) => { e.preventDefault(); down(); }, { passive:false });
  btn.addEventListener("touchend", up);
}

map.on("load", () => {
  clearNavigationTarget(true);
  setupMapLibre3D();
  updateRenderBounds(true);
  map.addSource("route-k5",{type:"geojson",data:routeFeatures.k5});
  map.addSource("route-k6",{type:"geojson",data:routeFeatures.k6});
  map.addSource("route-run",{type:"geojson",data:routeFeatures.run});
  map.addLayer({id:"route-k5-glow",type:"line",source:"route-k5",paint:{"line-color":"#ffc15d","line-width":12,"line-opacity":0.14,"line-blur":6}});
  map.addLayer({id:"route-k6-glow",type:"line",source:"route-k6",paint:{"line-color":"#7bc7ff","line-width":12,"line-opacity":0.14,"line-blur":6}});
  map.addLayer({id:"route-run-glow",type:"line",source:"route-run",paint:{"line-color":"#67ebb2","line-width":10,"line-opacity":0.12,"line-blur":6}});
  map.addLayer({id:"route-k5-line",type:"line",source:"route-k5",paint:{"line-color":"#ffb04a","line-width":4.2,"line-opacity":0.82}});
  map.addLayer({id:"route-k6-line",type:"line",source:"route-k6",paint:{"line-color":"#67b6ff","line-width":4.2,"line-opacity":0.82}});
  map.addLayer({id:"route-run-line",type:"line",source:"route-run",paint:{"line-color":"#49d08b","line-width":3.8,"line-opacity":0.72,"line-dasharray":[1.5,1.5]}});
  map.addSource("nearest-poi",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  map.addLayer({
    id:"nearest-poi-ring",
    type:"circle",
    source:"nearest-poi",
    paint:{
      "circle-radius":["interpolate",["linear"],["zoom"],16.4,24,19.3,50],
      "circle-color":"#ffffff",
      "circle-opacity":0.03,
      "circle-stroke-color":"#ffd86b",
      "circle-stroke-width":3,
      "circle-stroke-opacity":0.9
    }
  });
  recomputePlayerWorld();
  snapPlayerToRoad(true);
  createPlayerMapMarker();
  followPlayerCamera({ zoom: CAMERA_ZOOM, force:true });
  lockPitchOnly();
  document.getElementById("sheetContent").innerHTML = `
    <h3>BogorDex GO v55 Camera Smooth</h3>
    <p>MapLibre street-anime mode: kamera lebih rendah seperti berdiri di jalan, rotate kiri-kanan aktif, pitch atas-bawah dikunci, gedung transparan, dan karakter mengikuti posisi GPS/simulasi apa adanya.</p>
    <div class="section"><div class="section-title">Fix Inti</div><p>Basis MapLibre tetap dipakai tanpa kartu kredit Mapbox. Nuansa dibuat lebih game HP/Pokemon GO: gedung ghost transparan, kamera dari belakang karakter, MapDex phone aktif, dan laporan titik tetap jalan.</p></div>
  `;
  state.lastPoi = {id:"intro",name:"BogorDex GO v55 Camera Smooth",desc:"Mode third-person street view yang lebih stabil, terang, dan tidak terlalu sensitif ke GPS.",fungsi:"Dekati portal untuk membuka detail, rotate/tilt map, atau tambah laporan titik dari menu utama.",tupoksi:"Laporan user tersimpan lokal dulu dan siap disambungkan ke Firebase/GAS pada versi berikutnya.",group:"SISTEM",aktif:true};
  syncMiniButton();
  loadUserReports();
  renderUserReports();
  renderNPCs();
  loadSheetData();
  requestAnimationFrame(loop);
});

map.on("dragstart", startBrowse);
map.on("dragend", stopBrowse);
map.on("zoomstart", startBrowse);
map.on("zoomend", stopBrowse);
map.on("rotatestart", startBrowse);
map.on("rotateend", stopBrowse);
map.on("pitchstart", () => { startBrowse(); setTimeout(lockPitchOnly, 30); });
map.on("pitch", lockPitchOnly);
map.on("move", () => { if(Math.abs(map.getPitch() - CAMERA_PITCH) > 0.75) lockPitchOnly(); });
map.on("pitchend", () => { lockPitchOnly(); stopBrowse(); });
map.on("rotateend", () => { lockPitchOnly(); });

function animatePortalRings(){
  if(!map || !map.getLayer || !map.getLayer("poi-ring-outer")) return;
  state.portalPulse += 0.055;
  const wave = (Math.sin(state.portalPulse) + 1) / 2;
  const outerBase = 44 + wave * 18;
  const innerBase = 24 + (1 - wave) * 10;
  map.setPaintProperty("poi-ring-outer", "circle-radius", ["interpolate",["linear"],["zoom"],16.4,outerBase,19.3,outerBase*2.05]);
  map.setPaintProperty("poi-ring-outer", "circle-stroke-opacity", 0.46 + wave * 0.42);
  map.setPaintProperty("poi-ring-inner", "circle-radius", ["interpolate",["linear"],["zoom"],16.4,innerBase,19.3,innerBase*2.05]);
  map.setPaintProperty("poi-ring-inner", "circle-stroke-opacity", 0.50 + (1-wave) * 0.42);
}
let lastFrameTime = performance.now();
function loop(now){
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  if(state.collisionCooldown > 0) state.collisionCooldown -= 1;
  updateMovement(dt);
  state.__snapTicker = (state.__snapTicker || 0) + 1;
  if(!state.move.up && !state.move.down && !state.move.left && !state.move.right && state.__snapTicker % 12 === 0){
    snapPlayerToRoad(true);
    updatePlayerMapMarker();
  }
  animatePortalRings();
  updateNpcNearState();
  updateNavigationUi();
  if((state.__eventLoopTick = (state.__eventLoopTick || 0) + 1) % 18 === 0) checkEventNearby();
  // Kamera kompas sudah di-throttle di applyDeviceHeadingToCamera.
  // Jangan follow tiap frame, karena itu bikin pandangan geter-geter.
  if(!state.browsing && !state.move.up && !state.move.down && !state.move.left && !state.move.right){
    // keep alive ringan supaya karakter tetap terlihat setelah tile/render selesai
  }
  requestAnimationFrame(loop);
}

function reportEmoji(category){
  return { lobang:"🕳️", pohon:"🌳", pembangunan:"🚧", macet:"🚦", lainnya:"📌" }[category] || "📌";
}
function loadUserReports(){
  try{ state.userReports = JSON.parse(localStorage.getItem("bogordex_user_reports_v30") || "[]"); }catch(e){ state.userReports = []; }
}
function saveUserReports(){
  localStorage.setItem("bogordex_user_reports_v30", JSON.stringify(state.userReports.slice(-80)));
}
function clearReportMarkers(){
  (state.reportMarkers || []).forEach(m => { try{ m.remove(); }catch(e){} });
  state.reportMarkers = [];
}
function reportMarkerElement(report){
  const el = document.createElement("button");
  el.type = "button";
  el.className = "user-report-marker";
  el.title = (report.note || "Info warga");
  el.innerHTML = `<span class="report-pin ${report.category}"><span>${reportEmoji(report.category)}</span></span>`;
  el.addEventListener("click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    openSheet({
      id:report.id, name:"Info Warga: " + reportEmoji(report.category),
      desc:report.note || "Catatan lapangan dari user.",
      fungsi:"Laporan titik lapangan BogorDex.",
      tupoksi:GAS_URL ? "Laporan otomatis dikirim ke Google Sheets/GAS dan tetap disimpan lokal di browser." : "Laporan tersimpan lokal. Isi GAS URL kalau mau otomatis masuk Google Sheets.",
      group:"CITIZEN REPORT", aktif:true
    }, "manual");
  });
  return el;
}
function renderUserReports(){
  if(!map || !maplibregl) return;
  clearReportMarkers();
  state.userReports.forEach(report => {
    const marker = new maplibregl.Marker({ element: reportMarkerElement(report), anchor:"bottom", rotationAlignment:"viewport", pitchAlignment:"viewport" })
      .setLngLat(report.coords).addTo(map);
    state.reportMarkers.push(marker);
  });
}

function setOverlayMode(active){ document.body.classList.toggle('overlay-open', !!active); }
function closeAllOverlays(){
  document.getElementById('mainMenuModal')?.classList.add('hidden');
  document.getElementById('missionModal')?.classList.add('hidden');
  document.getElementById('mapDexModal')?.classList.add('hidden');
  document.getElementById('dexModal')?.classList.add('hidden');
  document.getElementById('reportModal')?.classList.add('hidden');
  document.getElementById('inventoryModal')?.classList.add('hidden');
  document.getElementById('npcDialog')?.classList.add('hidden');
  document.getElementById('questPopup')?.classList.add('hidden');
  closeSheet?.(true, true);
  setOverlayMode(false);
}

function updateTopHud(){
  const coinEl = document.getElementById('coinHudValue');
  if(coinEl) coinEl.textContent = String(state.playerProgress?.coin || 0);
  const n = document.getElementById('playerHudName');
  if(n) n.textContent = PLAYER_PROFILE?.name || 'Ranger Panji';
  const l = document.getElementById('playerHudLevel');
  if(l) l.textContent = 'Lv. ' + String(state.playerProgress?.level || 1);
}

function showBottomNavHelp(name){
  // v114: popup bawah RUBO dimatikan supaya tidak menutupi HUD bawah.
  return;
}
function openCharacterProfile(){
  closeAllOverlays();
  updatePlayerUiMeta?.();
  updateTopHud();
  document.getElementById('dexModal')?.classList.remove('hidden');
  setOverlayMode(true);
}
function closeCharacterProfile(){ document.getElementById('dexModal')?.classList.add('hidden'); setOverlayMode(false); }
function renderInventory(){
  const allBadges = Array.isArray(state.badges) ? state.badges : [];
  const unlocked = Array.from(state.unlockedBadges || []);
  const reports = Array.isArray(state.userReports) ? state.userReports : [];
  const discoveredCount = (state.discovered || new Set()).size;
  document.getElementById('invCoin') && (document.getElementById('invCoin').textContent = String(state.playerProgress.coin || 0));
  document.getElementById('invBadge') && (document.getElementById('invBadge').textContent = String(unlocked.length));
  document.getElementById('invReport') && (document.getElementById('invReport').textContent = String(reports.length));
  document.getElementById('invFound') && (document.getElementById('invFound').textContent = String(discoveredCount));

  const itemsGrid = document.getElementById('inventoryItemsGrid');
  if(itemsGrid){
    const baseItems = [
      { name:'Radar Mini', icon:'assets/ui/mapdex-device.png', count:3, use:'Dipakai di Radar', desc:'Membantu memindai portal dan titik menarik di sekitar player.' },
      { name:'Kompas', icon:'assets/ui/bkompas.png', count:2, use:'Dipakai untuk arah', desc:'Menunjukkan orientasi dan membantu fitur Arahkan ke portal.' },
      { name:'Drone Scan', icon:'🛸', count:1, use:'Dipakai untuk scan', desc:'Memperluas jangkauan pengecekan lokasi saat jelajah area baru.' },
      { name:'Kamera', icon:'📷', count:2, use:'Dipakai di AR', desc:'Untuk buka mode AR, dokumentasi portal, dan interaksi visual.' },
      { name:'Marker Lokasi', icon:'📍', count:Math.max(1, reports.length), use:'Dipakai untuk laporan', desc:'Menandai titik yang dilaporkan warga agar mudah dicek ulang.' },
      { name:'Notepad', icon:'🗒️', count:4, use:'Dipakai untuk catatan', desc:'Menyimpan detail singkat dari laporan, quest, dan temuan lapangan.' },
      { name:'Kartu ID', icon:'🪪', count:1, use:'Identitas Ranger', desc:'Identitas akses Ranger untuk membuka fitur eksplorasi tertentu.' },
      { name:'Power Cell', icon:'🔋', count:3, use:'Sumber daya alat', desc:'Cadangan energi untuk radar, kamera AR, dan alat bantu lapangan.' }
    ];
    itemsGrid.innerHTML = baseItems.map(item => `
      <div class="inventory-item-card">
        <div class="inventory-item-head">
          <div class="inventory-item-icon ${String(item.icon).startsWith('assets/') ? 'asset' : ''}" ${String(item.icon).startsWith('assets/') ? `style="background-image:url('${item.icon}')"` : ''}>${String(item.icon).startsWith('assets/') ? '' : item.icon}</div>
          <div class="inventory-item-meta">
            <div class="inventory-item-name">${item.name}</div>
            <div class="inventory-item-use">${item.use}</div>
          </div>
          <div class="inventory-item-count">${item.count}</div>
        </div>
        <div class="inventory-item-desc">${item.desc}</div>
      </div>`).join('');
  }

  const reportList = document.getElementById('inventoryReportList');
  if(reportList){
    const topReports = reports.slice().sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0,2);
    if(topReports.length){
      reportList.innerHTML = topReports.map((r, idx) => {
        const ok = r.status === 'benar';
        const waiting = r.status !== 'benar' && r.status !== 'salah';
        const statusLabel = ok ? 'Terverifikasi' : waiting ? 'Menunggu Verifikasi' : 'Dicek Ulang';
        const statusClass = ok ? 'ok' : waiting ? 'wait' : 'bad';
        const title = r.note || 'Info warga';
        const dateText = new Date(r.createdAt || Date.now()).toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
        return `
          <button type="button" class="inventory-report-card" data-report-id="${r.id}">
            <div class="inventory-report-thumb ${r.category || 'lainnya'}"></div>
            <div class="inventory-report-copy">
              <strong>${title}</strong>
              <span>Bogor Tengah, Kota Bogor</span>
              <small>${dateText}</small>
            </div>
            <span class="inventory-report-status ${statusClass}">${statusLabel}</span>
          </button>`;
      }).join('');
      reportList.querySelectorAll('[data-report-id]').forEach(btn => btn.addEventListener('click', () => {
        const report = getUserReportById(btn.dataset.reportId);
        if(report){
          closeInventoryModal();
          openSheet({id:report.id,name:'Info Warga',desc:report.note || 'Info titik',fungsi:'Kategori: ' + reportEmoji(report.category),tupoksi:'Titik laporan dari user.',group:'CITIZEN REPORT',aktif:true}, 'manual');
        }
      }));
    }else{
      reportList.innerHTML = `<div class="inventory-empty-state">Belum ada laporan tersimpan. Tekan tombol Laporkan untuk menambah info titik baru.</div>`;
    }
  }

  const chipList = document.getElementById('inventoryChipList');
  if(chipList){
    const chips = [];
    unlocked.slice(0,4).forEach(id => {
      const b = allBadges.find(x => x.id===id) || {name:id, icon:'🏅'};
      chips.push(`<span class="inventory-chip unlocked">${b.icon || '🏅'} ${b.name}</span>`);
    });
    chips.push(`<span class="inventory-chip">🪙 Coin ${(state.playerProgress.coin||0)}</span>`);
    chips.push(`<span class="inventory-chip">📍 Laporan ${reports.length}</span>`);
    chips.push(`<span class="inventory-chip">🧭 Lokasi ${discoveredCount}</span>`);
    chips.push(`<span class="inventory-chip">✨ Bonus EXP +20%</span>`);
    chips.push(`<span class="inventory-chip">📦 Alat untuk Radar, AR & Laporan</span>`);
    chipList.innerHTML = chips.join('');
  }
  updateTopHud();
}
function openInventoryModal(){
  closeAllOverlays();
  updateTopHud();
  renderInventory();
  document.getElementById('inventoryModal')?.classList.remove('hidden');
  setOverlayMode(true);
}
function closeInventoryModal(){ document.getElementById('inventoryModal')?.classList.add('hidden'); setOverlayMode(false); }

function openReportModal(){
  closeAllOverlays();
  setRuboEmotion('kaget','Tambah info titik','Laporkan kondisi sekitar agar warga lain terbantu.');
  document.getElementById("reportNote").value = "";
  const loc = document.getElementById('reportLocationText');
  if(loc) loc.textContent = 'Bogor Tengah, Kota Bogor';
  document.getElementById("reportModal").classList.remove("hidden");
  setOverlayMode(true);
}
function closeReportModal(){ document.getElementById("reportModal").classList.add("hidden"); setOverlayMode(false); }
function saveCurrentPointReport(){
  const category = document.getElementById("reportCategory").value || "lainnya";
  const note = (document.getElementById("reportNote").value || "").trim();
  const report = { id:"RPT-" + Date.now(), category, note: note || "Info titik dari user", coords:[state.playerWorld[0], state.playerWorld[1]], createdAt:new Date().toISOString(), updatedAt:"", status:"menunggu", reward_exp:30, reward_coin:5 };
  state.userReports.push(report);
  state.playerProgress.exp += Number(report.reward_exp || 0);
  state.playerProgress.coin += Number(report.reward_coin || 0);
  syncPlayerProfileFromProgress();
  saveUserReports();
  savePlayerProgress();
  renderUserReports();
  renderDex();
  closeReportModal();
  syncReportToGas(report);
  syncPlayerProgressToGas();
  setRuboEmotion('kaget','Makasih, Ranger!','Info kamu sudah dipasang di MapDex.');
  showAnimeToast('reward', 'Laporan warga tersimpan', note || 'Info lapangan baru berhasil dipasang', [`+${Number(report.reward_exp || 0)} EXP`, `+${Number(report.reward_coin || 0)} Coin`, reportEmoji(category) + ' ' + category]);
  showRewardBanner('Citizen Report', 'Info warga berhasil dipasang', 'Titik baru muncul di map dan masuk progres karakter', 2300);
  updateStatus(GAS_URL ? "Info warga dipasang dan dikirim ke Google Sheets" : "Info warga dipasang di map • isi GAS URL untuk kirim ke Google Sheets");
}


function missionProgressText(current, target){
  return Math.max(0, Math.min(current, target)) + "/" + target;
}
function missionRowHtml(mission){
  const pct = mission.target ? Math.max(0, Math.min(100, Math.round((mission.current / mission.target) * 100))) : 0;
  const done = mission.current >= mission.target;
  return `
    <div class="mission-row ${done ? 'done' : ''}">
      <div class="mission-row-icon">${mission.icon}</div>
      <div class="mission-row-main">
        <div class="mission-row-top">
          <strong>${mission.title}</strong>
          <span>${missionProgressText(mission.current, mission.target)}</span>
        </div>
        <p>${mission.desc}</p>
        <div class="mission-progress"><i style="width:${pct}%"></i></div>
        <small>${done ? 'Siap klaim / sudah tercapai' : mission.reward}</small>
      </div>
    </div>
  `;
}
function getMissionData(){
  const discoveredCount = state.discovered ? state.discovered.size : 0;
  const completedCount = state.completedPortals ? state.completedPortals.size : 0;
  const reportCount = Array.isArray(state.userReports) ? state.userReports.length : 0;
  const visitedCount = state.visitedPortals ? state.visitedPortals.size : 0;
  return [
    {
      icon:'🌀',
      title:'Jelajah 3 Portal',
      desc:'Temukan portal di sekitar kamu. Ini ngisi progres eksplorasi, bukan membuka detail portal.',
      current: discoveredCount,
      target: 3,
      reward:'+25 EXP • +5 Coin'
    },
    {
      icon:'🚪',
      title:'Masuk 1 Portal',
      desc:'Buka detail portal lalu tekan Masuk Portal sampai statusnya visited/completed.',
      current: Math.max(visitedCount, completedCount),
      target: 1,
      reward:'+20 EXP'
    },
    {
      icon:'📍',
      title:'Tambah 1 Info Titik',
      desc:'Gunakan menu Tambah Info di Titik Ini untuk bantu melaporkan kondisi sekitar.',
      current: reportCount,
      target: 1,
      reward:'+15 EXP • Badge Warga Aktif'
    },
    {
      icon:'🏁',
      title:'Selesaikan 1 Portal',
      desc:'Selesaikan satu portal sampai status Completed.',
      current: completedCount,
      target: 1,
      reward:'+35 EXP • +10 Coin'
    }
  ];
}
function renderMissionModal(){
  const discoveredCount = state.discovered ? state.discovered.size : 0;
  const completedCount = state.completedPortals ? state.completedPortals.size : 0;
  const reportCount = Array.isArray(state.userReports) ? state.userReports.length : 0;
  const d = document.getElementById('missionDiscoveredCount');
  const c = document.getElementById('missionCompletedCount');
  const r = document.getElementById('missionReportCount');
  if(d) d.textContent = discoveredCount;
  if(c) c.textContent = completedCount;
  if(r) r.textContent = reportCount;
  const list = document.getElementById('missionList');
  if(list) list.innerHTML = getMissionData().map(missionRowHtml).join('');
}
function openMissionModal(){
  closeAllOverlays();
  renderMissionModal();
  document.getElementById('missionModal')?.classList.remove('hidden');
  setOverlayMode(true);
}
function closeMissionModal(){
  document.getElementById('missionModal')?.classList.add('hidden');
  setOverlayMode(false);
}

function openMainMenu(){ closeAllOverlays(); document.getElementById('mainMenuModal').classList.remove('hidden'); setOverlayMode(true); }
function closeMainMenu(){ document.getElementById('mainMenuModal').classList.add('hidden'); setOverlayMode(false); }
function scanNearestFromMenu(){
  const hit = nearestPoiWithin(state.playerWorld, 999999);
  if(!hit){ updateStatus('Belum ada titik untuk discan'); return; }
  state.discovered.add(hit.poi.id);
  markPortalPopupDone(hit.poi.id);
  renderDex();
  map.easeTo({center: hit.poi.coords, zoom: 19.45, pitch: CAMERA_PITCH, bearing: getCameraBearing(), duration: 450});
  openSheet(hit.poi, 'manual');
  updateStatus('Scan menemukan: ' + hit.poi.name);
}
function resetGameCamera(){
  requestDeviceCompass();
  state.browsing = false;
  if(state.snapTimer) clearTimeout(state.snapTimer);
  state.browsing = false; document.getElementById("app")?.classList.remove("app-browsing"); updateRenderBounds(true); followPlayerCamera({ zoom: CAMERA_ZOOM, duration: 320, force:true });
}


function getMapDexItems(){
  const portals=[]; const reports=[];
  (state.pois || []).forEach(p => { if(p.coords && p.showOnMapDex !== false) portals.push({type:"portal", name:p.name, coords:p.coords, emoji:"🌀", ref:p}); });
  (state.userReports || []).forEach(r => { if(r.coords) reports.push({type:"report", name:r.note || "Info warga", coords:r.coords, emoji:"📍", ref:r}); });
  const withDist = arr => arr.map(item => ({...item, dist:haversineMeters(state.playerWorld, item.coords)})).sort((a,b)=>a.dist-b.dist);
  return [...withDist(portals).slice(0,6), ...withDist(reports).slice(0,4)].sort((a,b)=>a.dist-b.dist);
}

function focusMapDexItem(item){
  closeMapDex();
  map.easeTo({ center:item.coords, zoom:19.45, pitch:CAMERA_PITCH, bearing:getCameraBearing(), duration:450 });
  if(item.type === "portal" && item.ref){ markPortalPopupDone(item.ref.id); openSheet(item.ref, "manual"); }
  if(item.type === "npc" && item.ref) openNpcDialog(item.ref.id);
  if(item.type === "report" && item.ref){
    openSheet({id:item.ref.id,name:"Info Warga",desc:item.ref.note || "Info titik",fungsi:"Kategori: " + reportEmoji(item.ref.category),tupoksi:"Titik laporan dari user.",group:"CITIZEN REPORT",aktif:true}, "manual");
  }
}
function mapDexTypeLabel(type){
  return type === 'portal' ? 'Portal' : type === 'npc' ? 'NPC' : 'Laporan';
}
function mapDexThumb(item){
  if(item.type === 'npc' && item.ref?.asset) return item.ref.asset;
  if(item.type === 'report') return 'assets/ui/iconlaporan.png';
  if(item.type === 'portal'){
    const cat = String(item.ref?.category || item.ref?.group || '').toLowerCase();
    if(cat.includes('halte') || cat.includes('transit')) return 'assets/ui/porthalte.png';
    if(cat.includes('health') || cat.includes('rumah sakit') || cat.includes('puskesmas')) return 'assets/ui/portrs.png';
    if(cat.includes('umkm') || cat.includes('kuliner')) return 'assets/ui/portumkm.png';
    return 'assets/ui/portopd.png';
  }
  return 'assets/ui/mapdex-device.png';
}
function mapDexDesc(item){
  if(item.type === 'portal') return `${item.ref?.group || 'Lokasi penting BogorDex'} • ${portalStatusLabel(item.ref)}`;
  if(item.type === 'npc') return item.ref?.role || 'Warga & penjaga BogorDex';
  return item.ref?.category ? String(item.ref.category).replace(/_/g,' ') : 'Info warga di sekitar kamu';
}

function openPortalProgressFromMenu(){
  closeMainMenu();
  state.mapDexFilter = 'portal';
  openMapDex();
  updateStatus('Progress portal dibuka di MapDex');
}

function openMapDex(){
  closeAllOverlays();
  renderMapDex();
  document.getElementById("mapDexModal").classList.remove("hidden");
  setOverlayMode(true);
}
function closeMapDex(){ document.getElementById("mapDexModal").classList.add("hidden"); setOverlayMode(false); }

function distributeRadarPoints(items, radiusMeters, maxPct){
  const pts = items.map((item) => {
    const dx = haversineMeters(state.playerWorld, [item.coords[0], state.playerWorld[1]]) * (item.coords[0] >= state.playerWorld[0] ? 1 : -1);
    const dy = haversineMeters(state.playerWorld, [state.playerWorld[0], item.coords[1]]) * (item.coords[1] >= state.playerWorld[1] ? -1 : 1);
    let x = 50 + (dx / radiusMeters) * maxPct;
    let y = 50 + (dy / radiusMeters) * maxPct;
    return {item, x:Math.max(8, Math.min(92, x)), y:Math.max(10, Math.min(92, y))};
  });
  for(let pass=0; pass<28; pass++){
    for(let i=0;i<pts.length;i++){
      for(let j=i+1;j<pts.length;j++){
        const a=pts[i], b=pts[j];
        const dx=a.x-b.x, dy=a.y-b.y;
        const d=Math.hypot(dx,dy) || 0.01;
        if(d<8){
          const push=(8-d)/2;
          const ux=dx/d, uy=dy/d;
          a.x=Math.max(8, Math.min(92, a.x + ux*push));
          a.y=Math.max(10, Math.min(92, a.y + uy*push));
          b.x=Math.max(8, Math.min(92, b.x - ux*push));
          b.y=Math.max(10, Math.min(92, b.y - uy*push));
        }
      }
    }
  }
  return pts;
}

function renderMapDex(){
  const canvas = document.getElementById("mapDexCanvas");
  const list = document.getElementById("mapDexList");
  const filtersWrap = document.getElementById('mapDexFilters');
  if(!canvas || !list) return;
  canvas.querySelectorAll(".mapdex-pin").forEach(n => n.remove());
  list.innerHTML = "";
  const filter = state.mapDexFilter || 'all';
  const items = getMapDexItems();
  const filtered = filter === 'all' ? items : items.filter(item => item.type === filter);
  const radarPts = distributeRadarPoints(filtered.slice(0,14), 1200, 34);
  radarPts.forEach(({item,x,y}) => {
    const btn = document.createElement("button");
    btn.className = "mapdex-pin " + item.type;
    btn.style.left = x + "%";
    btn.style.top = y + "%";
    btn.title = item.name;
    btn.innerHTML = `<i><span></span></i>`;
    btn.addEventListener("click", () => focusMapDexItem(item));
    canvas.appendChild(btn);
  });
  if(filtersWrap){
    const defs = [
      {id:'all', label:'Semua'},
      {id:'portal', label:'Portal'},
      {id:'report', label:'Laporan'}
    ];
    filtersWrap.innerHTML = defs.map(def => `<button type="button" class="mapdex-filter-chip ${def.id === filter ? 'active' : ''}" data-filter="${def.id}">${def.label}</button>`).join('');
    filtersWrap.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => { state.mapDexFilter = btn.dataset.filter; renderMapDex(); }));
  }
  if(!filtered.length){
    list.innerHTML = `<div class="mapdex-empty-state">Belum ada data pada filter ini.</div>`;
    return;
  }
  filtered.forEach(item => {
    const row = document.createElement("button");
    row.className = "mapdex-row";
    const label = mapDexTypeLabel(item.type);
    const desc = mapDexDesc(item);
    const thumb = mapDexThumb(item);
    const statusChip = item.type === 'portal' ? `<span class="portal-list-state ${portalStatusCode(item.ref)}">${portalStatusLabel(item.ref)}</span>` : '';
    row.innerHTML = `
      <span class="mapdex-row-left">
        <span class="mapdex-row-avatar ${item.type}">
          ${thumb.startsWith('assets/') ? `<img src="${thumb}" alt="${item.name}">` : thumb}
        </span>
        <span class="mapdex-row-copy">
          <strong>${item.name}</strong>
          <small><em class="type-chip ${item.type}">${label}</em><label>${desc}</label>${statusChip}</small>
        </span>
      </span>
      <b>${Math.round(item.dist)} m <u>›</u></b>`;
    row.addEventListener("click", () => focusMapDexItem(item));
    list.appendChild(row);
  });
}
document.getElementById("locateBtn").addEventListener("click", startLocation);
document.addEventListener("pointerdown", requestDeviceCompass, { once:true, passive:true });
document.getElementById("resetViewBtn").addEventListener("click", resetGameCamera);
document.getElementById("toggleTransitBtn").addEventListener("click", (e) => { e.currentTarget.classList.toggle("active"); state.layers.transit = e.currentTarget.classList.contains("active"); applyLayerFilters(); });
document.getElementById("toggleGovBtn").addEventListener("click", (e) => { e.currentTarget.classList.toggle("active"); state.layers.gov = e.currentTarget.classList.contains("active"); applyLayerFilters(); });
document.getElementById("toggleHealthBtn").addEventListener("click", (e) => { e.currentTarget.classList.toggle("active"); state.layers.health = e.currentTarget.classList.contains("active"); applyLayerFilters(); });
document.getElementById("toggleUmkmBtn").addEventListener("click", (e) => { e.currentTarget.classList.toggle("active"); state.layers.umkm = e.currentTarget.classList.contains("active"); applyLayerFilters(); });
document.getElementById("mainMenuBtn").addEventListener("click", openMainMenu);
document.getElementById("closeMainMenuBtn").addEventListener("click", closeMainMenu);
document.querySelector("#mainMenuModal .game-menu-backdrop").addEventListener("click", closeMainMenu);
document.getElementById("menuExploreBtn").addEventListener("click", () => { closeMainMenu(); updateStatus("Mode jelajah portal aktif"); });
document.getElementById("menuScanBtn").addEventListener("click", () => { closeMainMenu(); scanNearestFromMenu(); });
document.getElementById("menuDexBtn").addEventListener("click", openPortalProgressFromMenu);
document.getElementById("menuResetBtn").addEventListener("click", () => { closeMainMenu(); resetGameCamera(); });
document.getElementById("menuReportBtn").addEventListener("click", () => { closeMainMenu(); openReportModal(); });
document.getElementById("reportCloseBtn").addEventListener("click", closeReportModal);
document.getElementById("reportCancelBtn").addEventListener("click", closeReportModal);
document.getElementById("reportSaveBtn").addEventListener("click", saveCurrentPointReport);
document.getElementById("reportModal").addEventListener("click", (e) => { if(e.target.id === "reportModal") closeReportModal(); });
document.getElementById("questStartBtn").addEventListener("click", startQuestFromPopup);
document.getElementById("npcDialogClose").addEventListener("click", closeNpcDialog);
document.getElementById("npcDialogLaterBtn").addEventListener("click", closeNpcDialog);
document.getElementById("npcDialogQuestBtn").addEventListener("click", acceptNpcQuest);
document.getElementById("npcDialog").addEventListener("click", (e) => { if(e.target.id === "npcDialog") closeNpcDialog(); });
document.getElementById("questCloseBtn").addEventListener("click", dismissActiveQuestPopup);
const __navCancelBtn = document.getElementById("navCancelBtn"); if(__navCancelBtn){ __navCancelBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); clearNavigationTarget(false); }); }
document.addEventListener("click", (e) => { if(e.target && e.target.id === "navCancelBtn"){ e.preventDefault(); e.stopPropagation(); clearNavigationTarget(false); } }, true);
document.getElementById("mapDexBtn").addEventListener("click", openMapDex);
document.getElementById("chatToggleBtn").addEventListener("click", () => { chatDock()?.classList.toggle("collapsed"); });
setInterval(() => updateCompassNeedleVisual(state.gpsHeading ?? state.deviceHeadingBearing), 700);
document.getElementById("playerHudBtn")?.addEventListener("click", () => { setBottomNavActive('profile'); openCharacterProfile(); });
document.getElementById("chatCloseBtn").addEventListener("click", closeChatDock);
document.getElementById("closeMissionBtn")?.addEventListener("click", closeMissionModal);
document.getElementById("missionModal")?.addEventListener("click", (e) => { if(e.target.id === "missionModal") closeMissionModal(); });
document.getElementById("closeMapDexBtn").addEventListener("click", closeMapDex);
document.getElementById("mapDexModal").addEventListener("click", (e) => { if(e.target.id === "mapDexModal") closeMapDex(); });
document.getElementById("closeDexBtn").addEventListener("click", closeCharacterProfile);
document.getElementById("dexModal").addEventListener("click", (e) => { if(e.target.id === "dexModal") closeCharacterProfile(); });
document.getElementById("closeInventoryBtn")?.addEventListener("click", closeInventoryModal);
document.getElementById("inventoryModal")?.addEventListener("click", (e) => { if(e.target.id === "inventoryModal") closeInventoryModal(); });
document.getElementById("sheetHandle").addEventListener("click", () => { sheetEl().classList.remove("hidden-sheet"); sheetEl().classList.toggle("collapsed"); syncMiniButton(); });
document.getElementById("sheetCloseBtn").addEventListener("click", (e) => { e.stopPropagation(); closeSheet(true, true); });
const __sheetMiniBtn = document.getElementById("sheetMiniBtn"); if(__sheetMiniBtn){ __sheetMiniBtn.addEventListener("click", () => { if(state.lastPoi) openSheet(state.lastPoi, state.activePoiMode || "manual"); }); }
document.querySelectorAll(".move-btn").forEach(bindMoveButton);
setupSafeMapDragControls();
document.getElementById('ruboAssistantClose')?.addEventListener('click', hideRuboAssistant);
// v114: popup bawah RUBO dimatikan.
document.addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); if(k==="w"||k==="arrowup") state.move.up=true; if(k==="s"||k==="arrowdown") state.move.down=true; if(k==="a"||k==="arrowleft") state.move.left=true; if(k==="d"||k==="arrowright") state.move.right=true; });
document.addEventListener("keyup", (e) => { const k = e.key.toLowerCase(); if(k==="w"||k==="arrowup") state.move.up=false; if(k==="s"||k==="arrowdown") state.move.down=false; if(k==="a"||k==="arrowleft") state.move.left=false; if(k==="d"||k==="arrowright") state.move.right=false; });



// v85 bottom game nav + quick report buttons
document.getElementById("reportQuickBtn")?.addEventListener("click", () => { setBottomNavActive('home'); setRuboEmotion('kaget','Laporkan titik','Sampaikan kondisi sekitar agar warga lain lebih terbantu.'); openReportModal(); });
document.getElementById("bottomHomeBtn")?.addEventListener("click", () => { setBottomNavActive('home'); showBottomNavHelp('home'); openMainMenu(); });
document.getElementById("bottomMissionBtn")?.addEventListener("click", () => { setBottomNavActive('mission'); showBottomNavHelp('mission'); openMissionModal(); });
document.getElementById("bottomHubBtn")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); setBottomNavActive('hub'); if(typeof openArCameraModal === 'function'){ openArCameraModal(); } else if(window.openArCameraModal){ window.openArCameraModal(); } else { console.warn('AR modal function belum siap'); } });
document.getElementById("bottomInventoryBtn")?.addEventListener("click", () => { setBottomNavActive('inventory'); showBottomNavHelp('inventory'); openInventoryModal(); });
document.getElementById("bottomProfileBtn")?.addEventListener("click", () => { setBottomNavActive('profile'); showBottomNavHelp('profile'); openCharacterProfile(); setRuboEmotion?.('serius','Profil Ranger','Lihat level, badge, dan progres eksplorasimu.'); });

updateWeatherChip();
updatePlayerUiMeta();
setTimeout(() => { refreshEnvironment(true); try{ snapPlayerToRoad(true); }catch(e){} }, 900);

function bindIconHoverFx(){
  document.querySelectorAll('.fab-compass,.fab-locate,.mapdex-action,.report-action,.bottom-nav-item,.bottom-hub-orb,.player-hud,.chat-toggle,.mapdex-row,.sheet-route-btn').forEach(el=>{
    if(el.dataset.fxBound) return;
    el.dataset.fxBound='1';
    const on=()=>{el.classList.add('icon-bounce'); setTimeout(()=>el.classList.remove('icon-bounce'),520);};
    el.addEventListener('mouseenter', on);
    el.addEventListener('pointerdown', on);
  });
}
setTimeout(bindIconHoverFx,200);
