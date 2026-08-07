// État des données
const state = {
  totalInvites: 3,
  presents: 0
};

// Mise à jour de l'affichage du Tableau de Bord
function updateDashboard() {
  const total = state.totalInvites;
  const presents = state.presents;
  const absents = Math.max(0, total - presents);
  const taux = total > 0 ? Math.round((presents / total) * 100) : 0;

  document.getElementById('total-invites').textContent = total;
  document.getElementById('presents').textContent = presents;
  document.getElementById('absents').textContent = absents;
  document.getElementById('taux-acces').textContent = `${taux}%`;
}

// Navigation entre onglets
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabContents.forEach(content => content.classList.add('hidden'));
      document.getElementById(`page-${targetTab}`)?.classList.remove('hidden');

      navButtons.forEach(b => {
        b.classList.remove('text-[#f29913]');
        b.classList.add('text-slate-400');
      });

      btn.classList.remove('text-slate-400');
      btn.classList.add('text-[#f29913]');
    });
  });
}

// Test de connexion à n8n via Webhook
async function testN8nConnection() {
  const urlInput = document.getElementById('n8n-url');
  const statusDiv = document.getElementById('n8n-status');
  const url = urlInput.value.trim();

  if (!url) {
    statusDiv.textContent = "Veuillez entrer une URL Webhook n8n valide.";
    statusDiv.className = "text-xs font-semibold text-center text-amber-600 block";
    return;
  }

  // Enregistrer le lien dans le navigateur
  localStorage.setItem('n8n_webhook_url', url);

  statusDiv.textContent = "Test en cours...";
  statusDiv.className = "text-xs font-semibold text-center text-slate-500 block";

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'ping', message: 'Test de connexion SmartCheck' })
    });

    if (response.ok) {
      statusDiv.textContent = "✓ Connexion réussie à n8n !";
      statusDiv.className = "text-xs font-semibold text-center text-green-600 block";
    } else {
      statusDiv.textContent = `Erreur de réponse n8n (${response.status})`;
      statusDiv.className = "text-xs font-semibold text-center text-red-600 block";
    }
  } catch (err) {
    statusDiv.textContent = "× Échec de la connexion (Vérifiez l'URL ou CORS)";
    statusDiv.className = "text-xs font-semibold text-center text-red-600 block";
  }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  updateDashboard();

  // Charger le lien n8n déjà sauvegardé
  const savedUrl = localStorage.getItem('n8n_webhook_url');
  if (savedUrl) {
    document.getElementById('n8n-url').value = savedUrl;
  }

  // Événements boutons
  document.getElementById('btn-test-n8n')?.addEventListener('click', testN8nConnection);

  document.getElementById('btn-reset')?.addEventListener('click', () => {
    if (confirm("Voulez-vous vraiment réinitialiser les présences à zéro ?")) {
      state.presents = 0;
      updateDashboard();
      alert("Les données ont été réinitialisées.");
    }
  });

  document.getElementById('btn-scan')?.addEventListener('click', () => {
    document.querySelector('[data-tab="scanner"]')?.click();
  });

  document.getElementById('btn-simuler-scan')?.addEventListener('click', () => {
    if (state.presents < state.totalInvites) {
      state.presents++;
      updateDashboard();
    }
    document.querySelector('[data-tab="accueil"]')?.click();
  });
});
