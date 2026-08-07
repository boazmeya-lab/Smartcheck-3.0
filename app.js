/* ==========================================================================
   1. ÉTAT ET CONFIGURATION GLOBALE
   ========================================================================== */
let supabaseClient = null;
let html5QrcodeScanner = null;
let guests = [];

// Configuration Supabase par défaut (Remplacer si nécessaire)
const DEFAULT_SUPABASE_URL = "https://xyz.supabase.co"; 
const DEFAULT_SUPABASE_KEY = "eyJhbGci..."; 

/* ==========================================================================
   2. INITIALISATION ET NAVIGATION
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  loadConfigInputs();
  initSupabase();
});

/**
  Changement d'onglet et gestion du scanner caméra
 */
function switchTab(tabName) {
  // Masquer toutes les sections
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  
  // Réinitialiser la couleur des icônes de la barre de navigation
  document.querySelectorAll('.nav-btn').forEach(el => {
    el.classList.remove('text-[#F59E0B]');
    el.classList.add('text-slate-400');
  });

  // Afficher l'onglet actif et allumer son icône
  const targetTab = document.getElementById(`tab-${tabName}`);
  const targetNav = document.getElementById(`nav-${tabName}`);

  if (targetTab) targetTab.classList.remove('hidden');
  if (targetNav) {
    targetNav.classList.remove('text-slate-400');
    targetNav.classList.add('text-[#F59E0B]');
  }

  // Démarrer la caméra uniquement dans l'onglet Scanner
  if (tabName === 'scanner') {
    startScanner();
  } else {
    stopScanner();
  }
}

/* ==========================================================================
   3. INTEGRATION SUPABASE (DONNÉES ET TEMPS RÉEL)
   ========================================================================== */
function initSupabase() {
  const supaUrl = localStorage.getItem('supa_url') || DEFAULT_SUPABASE_URL;
  const supaKey = localStorage.getItem('supa_key') || DEFAULT_SUPABASE_KEY;

  if (supaUrl && supaKey) {
    try {
      supabaseClient = supabase.createClient(supaUrl, supaKey);
      fetchGuests();
      listenToSupabaseRealtime();
    } catch (e) {
      console.error("Erreur d'initialisation Supabase:", e);
    }
  }
}

/**
  Récupération initiale des invités
 */
async function fetchGuests() {
  if (!supabaseClient) return;
  
  const { data, error } = await supabaseClient
    .from('invites')
    .select('*')
    .order('nom', { ascending: true });

  if (!error && data) {
    guests = data;
    filterGuests(); // Met à jour la liste affichée
    updateDashboard(); // Met à jour le tableau de bord
  }
}

/**
  Écouteur Realtime Supabase (Met à jour automatiquement sur tous les téléphones)
 */
function listenToSupabaseRealtime() {
  if (!supabaseClient) return;

  supabaseClient
    .channel('public:invites')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invites' }, () => {
      fetchGuests();
    })
    .subscribe();
}

/* ==========================================================================
   4. RENDU DE L'INTERFACE ET FILTRAGE
   ========================================================================== */
/**
  Mise à jour des statistiques du Tableau de bord
 */
function updateDashboard() {
  const total = guests.length;
  const presents = guests.filter(g => g.present).length;
  const absents = total - presents;
  const taux = total > 0 ? Math.round((presents / total) * 100) : 0;

  const elTotal = document.getElementById('stat-total');
  const elPresents = document.getElementById('stat-presents');
  const elAbsents = document.getElementById('stat-absents');
  const elTaux = document.getElementById('stat-taux');

  if (elTotal) elTotal.innerText = total;
  if (elPresents) elPresents.innerText = presents;
  if (elAbsents) elAbsents.innerText = absents;
  if (elTaux) elTaux.innerText = `${taux}%`;
}

/**
  Affichage des invités (Conforme au design exact de la maquette)
 */
function renderGuests(listToRender) {
  const listEl = document.getElementById('guests-list');
  if (!listEl) return;

  if (listToRender.length === 0) {
    listEl.innerHTML = '<p class="text-center text-xs text-slate-400 py-6">Aucun invité trouvé.</p>';
    return;
  }

  listEl.innerHTML = listToRender.map(g => `
    <div class="py-3 flex items-center justify-between border-b border-slate-100 last:border-none">
      <div>
        <p class="font-bold text-slate-800 text-sm mb-0.5">${escapeHtml(g.nom)}</p>
        <div class="flex items-center gap-2 text-[11px]">
          <span class="text-slate-400 font-medium">
            ${g.present ? (g.scanned_at ? new Date(g.scanned_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Présent') : 'Non arrivé'}
          </span>
          <span class="bg-amber-50 text-[#D97706] border border-amber-100/80 px-2 py-0.5 rounded-md font-bold text-[10px] flex items-center gap-1">
            <span>🪑</span> Non attribuée
          </span>
        </div>
      </div>
      <div>
        <span class="px-3 py-1 rounded-lg text-xs font-bold ${g.present ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-rose-50 text-rose-600'}">
          ${g.present ? 'Présent' : 'Absent'}
        </span>
      </div>
    </div>
  `).join('');
}

/**
  Filtrage en temps réel via la barre de recherche "Chercher un ticket ou un nom..."
 */
function filterGuests() {
  const searchInput = document.getElementById('guest-search');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const filtered = guests.filter(g => g.nom.toLowerCase().includes(query));
  renderGuests(filtered);
}

/* ==========================================================================
   5. SCANNER QR CODE (CAMÉRA ET GALERIE TÉLÉPHONE)
   ========================================================================== */
function startScanner() {
  if (html5QrcodeScanner) return;

  html5QrcodeScanner = new Html5Qrcode("reader");
  html5QrcodeScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    onScanSuccess
  ).catch(err => console.error("Erreur d'accès caméra:", err));
}

function stopScanner() {
  if (html5QrcodeScanner) {
    html5QrcodeScanner.stop().then(() => {
      html5QrcodeScanner = null;
    }).catch(() => {
      html5QrcodeScanner = null;
    });
  }
}

/**
  Importation d'une image QR Code depuis la galerie du téléphone
 */
async function scanImageFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const resEl = document.getElementById('file-scan-result');
  if (resEl) {
    resEl.classList.remove('hidden', 'bg-emerald-100', 'text-emerald-800', 'bg-rose-100', 'text-rose-800');
    resEl.classList.add('bg-amber-50', 'text-amber-800');
    resEl.innerText = "Analyse de l'image en cours...";
  }

  const html5QrCode = new Html5Qrcode("reader");
  try {
    const decodedText = await html5QrCode.scanFile(file, true);
    if (resEl) {
      resEl.classList.remove('bg-amber-50', 'text-amber-800');
      resEl.classList.add('bg-emerald-100', 'text-emerald-800');
      resEl.innerText = `QR Code détecté : ${decodedText}`;
    }
    onScanSuccess(decodedText);
  } catch (err) {
    if (resEl) {
      resEl.classList.remove('bg-amber-50', 'text-amber-800');
      resEl.classList.add('bg-rose-100', 'text-rose-800');
      resEl.innerText = "Aucun QR Code valide détecté sur cette image.";
    }
  }
}

/**
  Logique d'accès lors de la détection du QR Code
 */
async function onScanSuccess(decodedText) {
  const resEl = document.getElementById('scan-result');
  if (resEl) {
    resEl.classList.remove('hidden', 'bg-emerald-100', 'text-emerald-800', 'bg-rose-100', 'text-rose-800');
  }

  if (!supabaseClient) {
    if (resEl) {
      resEl.classList.add('bg-rose-100', 'text-rose-800');
      resEl.innerText = "Erreur: Supabase non connecté.";
    }
    return;
  }

  // Recherche de l'invité par ID ou Nom dans Supabase
  const { data: guest, error } = await supabaseClient
    .from('invites')
    .select('*')
    .or(`id.eq.${decodedText},nom.eq.${decodedText}`)
    .single();

  if (error || !guest) {
    if (resEl) {
      resEl.classList.add('bg-rose-100', 'text-rose-800');
      resEl.innerText = "Invité introuvable !";
    }
    return;
  }

  // Marquer l'invité comme PRÉSENT
  await supabaseClient
    .from('invites')
    .update({ present: true, scanned_at: new Date().toISOString() })
    .eq('id', guest.id);

  if (resEl) {
    resEl.classList.add('bg-emerald-100', 'text-emerald-800');
    resEl.innerText = `Accès Autorisé : ${guest.nom}`;
  }

  // Envoi de la notification vers n8n
  triggerN8nWebhook(guest);
}

/* ==========================================================================
   6. GESTION N8N ET UTILITAIRES
   ========================================================================== */
async function triggerN8nWebhook(guest) {
  const n8nUrl = localStorage.getItem('n8n_url');
  if (!n8nUrl) return;

  try {
    await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'guest_checked_in',
        guest: guest,
        timestamp: new Date().toISOString()
      })
    });
  } catch (e) {
    console.error("Erreur Webhook n8n:", e);
  }
}

function loadConfigInputs() {
  const n8nUrl = localStorage.getItem('n8n_url') || '';
  const inputN8n = document.getElementById('cfg-n8n-url');
  if (inputN8n) inputN8n.value = n8nUrl;
}

function saveConfig() {
  const inputN8n = document.getElementById('cfg-n8n-url');
  if (inputN8n) {
    localStorage.setItem('n8n_url', inputN8n.value.trim());
    alert('Configuration n8n enregistrée !');
  }
}

async function testConnection() {
  const n8nUrl = localStorage.getItem('n8n_url');

  if (!n8nUrl) {
    alert("Veuillez saisir l'URL du Webhook n8n.");
    return;
  }

  try {
    const res = await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true, timestamp: new Date().toISOString() })
    });

    if (res.ok) {
      alert("Connexion n8n réussie (HTTP 200 OK) !");
    } else {
      alert(`Erreur n8n: Code HTTP ${res.status}`);
    }
  } catch (err) {
    alert(`Échec du test de connexion n8n: ${err.message}`);
  }
}

function resetApp() {
  if (confirm("Réinitialiser l'application et effacer les configurations locales ?")) {
    localStorage.clear();
    loadConfigInputs();
    alert("Application réinitialisée !");
  }
}

// Fonction de sécurisation contre l'injection de texte HTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
