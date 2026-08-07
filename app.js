let supabaseClient = null;
let html5QrcodeScanner = null;
let guests = [];

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
  loadConfigInputs();
  initSupabase();
});

// Navigation entre onglets (Correction du blocage)
function switchTab(tabName) {
  // Masquer toutes les sections
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  
  // Réinitialiser la couleur des boutons de navigation
  document.querySelectorAll('.nav-btn').forEach(el => {
    el.classList.remove('text-[#F59E0B]');
    el.classList.add('text-slate-400');
  });

  // Afficher l'onglet sélectionné
  const targetTab = document.getElementById(`tab-${tabName}`);
  const targetNav = document.getElementById(`nav-${tabName}`);

  if (targetTab) targetTab.classList.remove('hidden');
  if (targetNav) {
    targetNav.classList.remove('text-slate-400');
    targetNav.classList.add('text-[#F59E0B]');
  }

  // Activer ou désactiver le scanner selon l'onglet
  if (tabName === 'scanner') {
    startScanner();
  } else {
    stopScanner();
  }
}

// Chargement des identifiants
function loadConfigInputs() {
  const supaUrl = localStorage.getItem('supa_url') || '';
  const supaKey = localStorage.getItem('supa_key') || '';
  const n8nUrl = localStorage.getItem('n8n_url') || '';

  if (document.getElementById('cfg-supa-url')) document.getElementById('cfg-supa-url').value = supaUrl;
  if (document.getElementById('cfg-supa-key')) document.getElementById('cfg-supa-key').value = supaKey;
  if (document.getElementById('cfg-n8n-url')) document.getElementById('cfg-n8n-url').value = n8nUrl;
}

function saveConfig() {
  const url = document.getElementById('cfg-supa-url').value.trim();
  const key = document.getElementById('cfg-supa-key').value.trim();
  const n8n = document.getElementById('cfg-n8n-url').value.trim();

  localStorage.setItem('supa_url', url);
  localStorage.setItem('supa_key', key);
  localStorage.setItem('n8n_url', n8n);

  alert('Configuration enregistrée !');
  initSupabase();
}

function initSupabase() {
  const url = localStorage.getItem('supa_url');
  const key = localStorage.getItem('supa_key');

  if (url && key) {
    try {
      supabaseClient = supabase.createClient(url, key);
      fetchGuests();
      listenToSupabaseRealtime();
    } catch (e) {
      console.error("Erreur d'initialisation Supabase:", e);
    }
  }
}

async function fetchGuests() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from('invites').select('*').order('nom');
  if (!error && data) {
    guests = data;
    renderGuests();
    updateDashboard();
  }
}

function listenToSupabaseRealtime() {
  if (!supabaseClient) return;
  supabaseClient
    .channel('public:invites')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invites' }, () => {
      fetchGuests();
    })
    .subscribe();
}

function updateDashboard() {
  const total = guests.length;
  const presents = guests.filter(g => g.present).length;
  const absents = total - presents;
  const taux = total > 0 ? Math.round((presents / total) * 100) : 0;

  document.getElementById('stat-total').innerText = total;
  document.getElementById('stat-presents').innerText = presents;
  document.getElementById('stat-absents').innerText = absents;
  document.getElementById('stat-taux').innerText = `${taux}%`;
}

function renderGuests() {
  const listEl = document.getElementById('guests-list');
  if (!listEl) return;

  if (guests.length === 0) {
    listEl.innerHTML = '<p class="text-center text-xs text-slate-400 py-6">Aucun invité trouvé.</p>';
    return;
  }

  listEl.innerHTML = guests.map(g => `
    <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
      <div>
        <p class="font-bold text-slate-800 text-xs">${g.nom}</p>
        <p class="text-[10px] text-slate-400">${g.scanned_at ? new Date(g.scanned_at).toLocaleTimeString() : 'Pas encore scanné'}</p>
      </div>
      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${g.present ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
        ${g.present ? 'Présent' : 'Absent'}
      </span>
    </div>
  `).join('');
}

function startScanner() {
  if (html5QrcodeScanner) return;
  html5QrcodeScanner = new Html5Qrcode("reader");
  html5QrcodeScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    onScanSuccess
  ).catch(err => console.error("Erreur caméra:", err));
}

function stopScanner() {
  if (html5QrcodeScanner) {
    html5QrcodeScanner.stop().then(() => {
      html5QrcodeScanner = null;
    }).catch(() => html5QrcodeScanner = null);
  }
}

async function onScanSuccess(decodedText) {
  const resEl = document.getElementById('scan-result');
  resEl.classList.remove('hidden', 'bg-emerald-100', 'text-emerald-800', 'bg-rose-100', 'text-rose-800');

  if (!supabaseClient) {
    resEl.classList.add('bg-rose-100', 'text-rose-800');
    resEl.innerText = "Supabase non configuré.";
    return;
  }

  const { data: guest, error } = await supabaseClient
    .from('invites')
    .select('*')
    .or(`id.eq.${decodedText},nom.eq.${decodedText}`)
    .single();

  if (error || !guest) {
    resEl.classList.add('bg-rose-100', 'text-rose-800');
    resEl.innerText = "Invité non trouvé !";
    return;
  }

  await supabaseClient
    .from('invites')
    .update({ present: true, scanned_at: new Date().toISOString() })
    .eq('id', guest.id);

  resEl.classList.add('bg-emerald-100', 'text-emerald-800');
  resEl.innerText = `Accès Autorisé : ${guest.nom}`;

  triggerN8nWebhook(guest);
}

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

async function testConnection() {
  const supaUrl = localStorage.getItem('supa_url');
  const n8nUrl = localStorage.getItem('n8n_url');

  if (!supaUrl) {
    alert("Configurez d'abord Supabase.");
    return;
  }

  try {
    const { data, error } = await supabaseClient.from('invites').select('count', { count: 'exact' });
    if (error) throw error;

    let n8nMsg = "Non configuré";
    if (n8nUrl) {
      const res = await fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true })
      });
      n8nMsg = res.ok ? "OK (200)" : `Erreur ${res.status}`;
    }

    alert(`Connexion réussie !\n• Supabase: Actif\n• n8n: ${n8nMsg}`);
  } catch (err) {
    alert(`Erreur de connexion: ${err.message}`);
  }
}

function resetApp() {
  if (confirm("Réinitialiser les paramètres locaux ?")) {
    localStorage.clear();
    loadConfigInputs();
    guests = [];
    renderGuests();
    updateDashboard();
    alert("Application réinitialisée.");
  }
}
