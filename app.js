// ==========================================
// 1. CONFIGURATION & INITIALISATION
// ==========================================
const SUPABASE_URL = "https://VOTRE_PROJET.supabase.co";
const SUPABASE_ANON_KEY = "VOTRE_CLE_ANON";

// Initialisation du client Supabase
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Éléments du DOM
const badgeEl = document.getElementById('badge');
const contentEl = document.getElementById('content');

// ==========================================
// 2. FONCTIONS AUXILIAIRES (UI & DATES)
// ==========================================

/**
 * Met à jour l'interface utilisateur selon le statut
 * @param {string} type - 'loading' | 'valid' | 'already-used' | 'error'
 * @param {string} badgeText - Libellé du badge
 * @param {string} htmlContent - Contenu HTML des détails
 */
function updateUI(type, badgeText, htmlContent) {
  if (badgeEl) {
    badgeEl.className = `status-badge ${type}`;
    badgeEl.textContent = badgeText;
  }
  if (contentEl) {
    contentEl.innerHTML = htmlContent;
  }
}

/**
 * Formate un timestamp ISO en heure locale (ex: 14:30:15)
 * @param {string} isoString 
 * @returns {string}
 */
function formatTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// ==========================================
// 3. LOGIQUE SMARTCHECK 3.0
// ==========================================

async function verifyCheckIn() {
  // Récupération du paramètre ?token=... présent dans l'URL
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  // CAS 1 : Token absent de l'URL
  if (!token) {
    updateUI(
      'error',
      'Code introuvable',
      '<p>Aucun jeton d\'accès ou code QR valide n\'a été détecté dans l\'URL.</p>'
    );
    return;
  }

  try {
    // CAS 2 : Recherche de l'invité dans la table Supabase 'guests'
    const { data: guest, error: fetchError } = await supabase
      .from('guests')
      .select('id, full_name, checked_in, checked_in_at, table_number')
      .eq('checkin_token', token)
      .single();

    if (fetchError || !guest) {
      updateUI(
        'error',
        'Accès Refusé',
        '<p>Ce code d\'accès est invalide ou n\'existe pas dans la base de données.</p>'
      );
      return;
    }

    // CAS 3 : Jeton déjà scanné auparavant
    if (guest.checked_in) {
      updateUI(
        'already-used',
        'Déjà Scanné',
        `
        <div class="details">
          <p><strong>Nom :</strong> ${guest.full_name}</p>
          <p><strong>Statut :</strong> Déjà présent(e)</p>
          <p><strong>Heure de passage :</strong> ${formatTime(guest.checked_in_at)}</p>
        </div>
        `
      );
      return;
    }

    // CAS 4 : Validation du premier passage
    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('guests')
      .update({
        checked_in: true,
        checked_in_at: nowIso
      })
      .eq('id', guest.id);

    if (updateError) {
      throw updateError;
    }

    updateUI(
      'valid',
      'Accès Autorisé',
      `
      <div class="details">
        <p><strong>Nom :</strong> ${guest.full_name}</p>
        <p><strong>Table / Zone :</strong> ${guest.table_number || 'Non assignée'}</p>
        <p><strong>Entrée enregistrée :</strong> ${formatTime(nowIso)}</p>
      </div>
      `
    );

  } catch (err) {
    console.error('SmartCheck Error:', err);
    updateUI(
      'error',
      'Erreur Réseau',
      '<p>Une erreur est survenue lors de la communication avec le serveur.</p>'
    );
  }
}

// ==========================================
// 4. EXECUTION
// ==========================================
document.addEventListener('DOMContentLoaded', verifyCheckIn);
