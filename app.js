// Données initiales
const state = {
  totalInvites: 3,
  presents: 0
};

// Mise à jour automatique des cartes
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

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  updateDashboard();

  const btnScan = document.getElementById('btn-scan');
  if (btnScan) {
    btnScan.addEventListener('click', () => {
      if (state.presents < state.totalInvites) {
        state.presents++;
        updateDashboard();
      }
    });
  }
});
