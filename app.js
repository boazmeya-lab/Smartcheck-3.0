// État global des données
const state = {
  totalInvites: 3,
  presents: 0,
  invitesList: [
    { name: "Alice Dupont", statut: "absent" },
    { name: "Bob Martin", statut: "absent" },
    { name: "Charlie Durand", statut: "absent" }
  ]
};

// Mise à jour du tableau de bord
function updateDashboard() {
  const total = state.totalInvites;
  const presents = state.presents;
  const absents = Math.max(0, total - presents);
  const taux = total > 0 ? Math.round((presents / total) * 100) : 0;

  document.getElementById('total-invites').textContent = total;
  document.getElementById('presents').textContent = presents;
  document.getElementById('absents').textContent = absents;
  document.getElementById('taux-acces').textContent = `${taux}%`;

  renderInvitesList();
}

// Génération de la liste dans l'onglet Invités
function renderInvitesList() {
  const container = document.getElementById('liste-invites');
  if (!container) return;

  container.innerHTML = state.invitesList.map(inv => `
    <li class="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
      <span class="font-medium text-[#1d2b3a]">${inv.name}</span>
      <span class="text-xs px-2.5 py-1 rounded-full font-semibold ${
        inv.statut === 'présent' 
          ? 'bg-green-100 text-green-700' 
          : 'bg-red-100 text-red-700'
      }">
        ${inv.statut === 'présent' ? 'Présent' : 'Absent'}
      </span>
    </li>
  `).join('');
}

// Enregistrement d'un scan réussi
function scannerInvite() {
  const nextAbsent = state.invitesList.find(i => i.statut === 'absent');
  if (nextAbsent) {
    nextAbsent.statut = 'présent';
    state.presents++;
    updateDashboard();
  }
}

// Gestion de la navigation par onglets
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      // Masquer toutes les vues
      tabContents.forEach(content => content.classList.add('hidden'));

      // Afficher la vue ciblée
      const selectedView = document.getElementById(`page-${targetTab}`);
      if (selectedView) selectedView.classList.remove('hidden');

      // Réinitialiser les couleurs des boutons
      navButtons.forEach(b => {
        b.classList.remove('text-[#f29913]');
        b.classList.add('text-slate-400');
      });

      // Activer le bouton cliqué
      btn.classList.remove('text-slate-400');
      btn.classList.add('text-[#f29913]');
    });
  });
}

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  updateDashboard();

  // Bouton "Lancer un Scan"
  document.getElementById('btn-scan')?.addEventListener('click', () => {
    document.querySelector('[data-tab="scanner"]')?.click();
  });

  // Bouton d'action dans l'onglet Scanner
  document.getElementById('btn-valider-scan')?.addEventListener('click', () => {
    scannerInvite();
    document.querySelector('[data-tab="accueil"]')?.click();
  });
});
