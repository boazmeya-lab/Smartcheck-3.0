let supabaseClient = null;
let html5QrcodeScanner = null;
let guests = [];

// 1. DÉMARRAGE ET CONFIGURATION
document.addEventListener('DOMContentLoaded', () => {
  loadConfigInputs();
  initSupabase();
});

function loadConfigInputs() {
  document.getElementById('cfg-supa-url').value = localStorage.getItem('supa_url') || '';
  document.getElementById('cfg-supa-key').value = localStorage.getItem('supa_key') || '';
  document.getElementById('cfg-n8n-url').value = localStorage.getItem('n8n_url') || '';
}

function saveConfig() {
  const url = document.getElementById('cfg-supa-url').value.trim();
  const key = document.getElementById('cfg-supa-key').value.trim();
  const n8n = document.getElementById('cfg-n8n-url').value.trim();

  localStorage.setItem('supa_url', url);
  localStorage.setItem('supa_key', key);
  localStorage.setItem('n8n_url', n8n);

  alert('Configuration enregistrée avec succès !');
  initSupabase();
}

function initSupabase() {
  const url = localStorage.getItem('supa_url');
  const key = localStorage.getItem('supa_key');

  if (url && key) {
    supabaseClient = supabase.createClient(url, key);
    fetchGuests();
    listenToSupabaseRealtime();
  }
}

// 2. RECUPÉRATION ET REALTIME SUPABASE
async function fetchGuests() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from('invites')
    .select('*')
    .order('nom');

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
      fetchGuests(); // Rechargement automatique en temps réel
    })
    .subscribe();
}

// 3. TABLEAU DE BORD ET LISTE DES INVITÉS
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

  if (guests.length === 0) {
    listEl.innerHTML = '<p class="text-center text-sm text-slate-400 py-4">Aucun invité trouvé.</p>';
    return;
  }

  listEl.innerHTML = guests.map(g => `
    <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
      <div>
        <p class="font-bold text-slate-800 text-sm">${g.nom}</p>
        <p class="text-xs text-slate-400">
          ${g.scanned_at ? new Date(g.scanned_at).toLocaleTimeString() : 'Pas encore scanné'}
        </p>
      </div>
      <span class="px-2.5 py-1 rounded-full text-xs font-bold ${g.present ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
        ${g.present ? 'Présent' : 'Absent'}
      </span>
    </div>
  `).join('');
}

// 4. NAVIGATION ET SCANNER QR CODE
function switchTab(tabName) {
  document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => {
    el.classList.remove('text-amber-500');
    el.classList.add('text-slate-400');
  });

  document.getElementById(`tab-${tabName}`).classList.remove('hidden');
  document.getElementById(`nav-${tabName}`).classList.remove('text-slate-400');
  document.getElementById(`nav-${tabName}`).classList.add('text-amber-500');

  if (tabName === 'scanner') {
    startScanner();
  } else {
    stopScanner();
  }
}

function startScanner() {
  if (html5QrcodeScanner) return;

  html5QrcodeScanner = new Html5Qrcode("reader");
  html5QrcodeScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    onScanSuccess
  );
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

async function onScanSuccess(decodedText) {
  const resEl = document.getElementById('scan-result');
  resEl.classList.remove('hidden', 'bg-emerald-100', 'text-emerald-800', 'bg-rose-100', 'text-rose-800');

  if (!supabaseClient) {
    resEl.classList.add('bg-rose-100', 'text-rose-800');
    resEl.innerText = "Erreur: Supabase n'est pas configuré.";
    return;
  }

  // Vérification de l'invité dans Supabase via ID ou Nom
  const { data: guest, error } = await supabaseClient
    .from('invites')
    .select('*')
    .or(`id.eq.${decodedText},nom.eq.${decodedText}`)
    .single();

  if (error || !guest) {
    resEl.classList.add('bg-rose-100', 'text-rose-800');
    resEl.innerText = "Invité introuvable !";
    return;
  }

  // Validation de la présence dans la base de données
  await supabaseClient
    .from('invites')
    .update({ present: true, scanned_at: new Date().toISOString() })
    .eq('id', guest.id);

  resEl.classList.add('bg-emerald-100', 'text-emerald-800');
  resEl.innerText = `Accès Autorisé : ${guest.nom}`;

  // Déclenchement de l'envoi vers n8n
  triggerN8nWebhook(guest);
}

// 5. INTÉGRATION N8N WEBHOOK
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

// 6. OUTILS ET BOUTONS D'ACTION (TEST & RESET)
async function testConnection() {
  const supaUrl = localStorage.getItem('supa_url');
  const n8nUrl = localStorage.getItem('n8n_url');

  if (!supaUrl) {
    alert("Veuillez d'abord configurer Supabase dans les paramètres.");
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
      n8nMsg = res.ok ? "Connecté (200 OK)" : `Erreur HTTP ${res.status}`;
    }

    alert(`Test réussi !\n- Supabase: Connecté\n- n8n Webhook: ${n8nMsg}`);
  } catch (err) {
    alert(`Échec du test: ${err.message}`);
  }
}

function resetApp() {
  if (confirm("Voulez-vous réinitialiser tous les paramètres locaux ?")) {
    localStorage.clear();
    loadConfigInputs();
    guests = [];
    renderGuests();
    updateDashboard();
    alert("Application réinitialisée !");
  }
}
