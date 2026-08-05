let html5QrcodeScanner;
let BaseDonneesInvites = JSON.parse(localStorage.getItem('smartcheck_db')) || [];
let WebhookUrl = localStorage.getItem('smartcheck_webhook') || '';

document.addEventListener('DOMContentLoaded', () => {
    let inputUrl = document.getElementById('webhook-url');
    if (inputUrl) inputUrl.value = WebhookUrl;
    MettreAJourAffichage();
});

function extraireNom(guest) {
    if (!guest) return 'Nom Inconnu';
    return guest.nom_complet || guest.nom || guest.full_name || guest.name || guest.guest_name || 'Invité sans nom';
}
// Ne vérifie STRICTEMENT que le scan à l'entrée, pas le formulaire RSVP
function verifierPresence(guest) {
    if (!guest) return false;
    
    // On ne regarde QUE la colonne de scan / enregistrement physique
    if (guest.scan === true) return true;
    
    let scanVal = guest.scan_status || guest.status_scan || guest.scanne;
    if (typeof scanVal === 'string') {
        let cleanVal = scanVal.trim().toLowerCase();
        return cleanVal === 'présent' || cleanVal === 'present' || cleanVal === 'scanné';
    }
    
    return false;
}


function switchView(viewId, element) {
    document.querySelectorAll('.app-view').forEach(view => view.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
    if(element) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        element.classList.add('active');
    }
    if (viewId !== 'scanner' && html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(err => console.log(err));
        let btn = document.getElementById('start-btn');
        if (btn) btn.style.display = 'flex';
    }
}

function demarrerScan() {
    document.getElementById('start-btn').style.display = 'none';
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 15, qrbox: { width: 250, height: 250 } }, false);
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

function normaliserTexte(str) {
    if(!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function onScanSuccess(decodedText) {
    let codeScanne = decodedText.trim();
    html5QrcodeScanner.clear().catch(err => console.log(err));
    
    let invite = BaseDonneesInvites.find(g => 
        (g.ticket_id && g.ticket_id.toUpperCase() === codeScanne.toUpperCase()) ||
        normaliserTexte(extraireNom(g)) === normaliserTexte(codeScanne)
    );
    
    if (invite) {
        if (verifierPresence(invite)) {
            let detailHeure = invite.heure ? 'Arrivé à ' + invite.heure : '';
            let displayTable = (invite.tableau || invite.table);
            let tableText = (displayTable && displayTable !== 'N/A' && displayTable !== 'Non attribuée') 
                ? `<div class="flash-table"><i class="fa-solid fa-chair"></i> ${displayTable}</div>` 
                : `<div class="flash-table">📍 Sans Table</div>`;
            
            declencherFlash(
                `<div class="flash-title">Déjà Scanné ! ⚠️</div>
                 <div class="flash-name">${extraireNom(invite)}</div>
                 ${tableText}
                 <span class="flash-extra">${detailHeure}</span>`, 
                'var(--danger)'
            );
            relancerScanneurApresDelai();
        } else {
            validerEntree(invite);
        }
    } else {
        declencherFlash(
            `<div class="flash-title">Accès Refusé ❌</div>
             <div class="flash-name">Ticket Inconnu</div>
             <div class="flash-extra">Veuillez synchroniser la base de données Supabase dans l'onglet "Invités".</div>`, 
            'var(--danger)'
        );
        relancerScanneurApresDelai();
    }
}

function onScanFailure(error) {}

async function validerEntree(invite) {
    let maintenant = new Date();
    let heureActuelle = maintenant.getHours().toString().padStart(2, '0') + ':' + maintenant.getMinutes().toString().padStart(2, '0');
    
    invite.statut = 'Présent';
    invite.scan_status = 'Présent';
    invite.scan = true;
    invite.heure = heureActuelle;

    sauvegarderLocalement();
    MettreAJourAffichage();
    
    let nomPropre = extraireNom(invite);
    let displayTable = (invite.tableau || invite.table);
    let tableHtml = (displayTable && displayTable !== 'N/A' && displayTable !== 'Non attribuée') 
        ? `<div class="flash-table"><i class="fa-solid fa-chair"></i> Table : ${displayTable}</div>` 
        : `<div class="flash-table">📍 Sans Table</div>`;

    declencherFlash(
        `<div class="flash-title">Accès Autorisé ✅</div>
         <div class="flash-name">${nomPropre}</div>
         ${tableHtml}`, 
        'var(--success)'
    );

    if (WebhookUrl) {
        try {
            await fetch(WebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'checkin', 
                    ticket_id: invite.ticket_id, 
                    nom_complet: nomPropre, 
                    heure: heureActuelle,
                    table: displayTable || 'Non attribuée'
                })
            });
        } catch (e) {
            console.error("Erreur Webhook", e);
        }
    }
    relancerScanneurApresDelai();
}

function relancerScanneurApresDelai() {
    setTimeout(() => {
        if (document.getElementById('view-scanner').classList.contains('active')) {
            demarrerScan();
        }
    }, 2500);
}

async function synchroniserDonnees() {
    if (!WebhookUrl) {
        alert("Veuillez configurer l'URL du Webhook.");
        return;
    }
    try {
        let response = await fetch(WebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getGuests' })
        });
        if (response.ok) {
            let donnees = await response.json(); 
            if (Array.isArray(donnees)) {
                BaseDonneesInvites = donnees;
                sauvegarderLocalement();
                MettreAJourAffichage();
                alert("Données Supabase synchronisées avec succès !");
            }
        } else {
            alert("Erreur de récupération des données.");
        }
    } catch (e) {
        alert("Erreur de connexion n8n.");
    }
}

function filtrerInvites() {
    let inputSearch = document.getElementById('search-input');
    let query = inputSearch ? normaliserTexte(inputSearch.value) : '';
    let listeDiv = document.getElementById('liste-invites');
    if (!listeDiv) return;
    listeDiv.innerHTML = '';
    
    let invitesFiltres = BaseDonneesInvites.filter(g => 
        normaliserTexte(extraireNom(g)).includes(query) ||
        normaliserTexte(g.ticket_id).includes(query)
    );
    
    if(invitesFiltres.length === 0) {
        listeDiv.innerHTML = '<p style="color:#bdc3c7; text-align:center; margin-top:20px;">Aucun invité trouvé.</p>';
        return;
    }
    
    invitesFiltres.forEach(guest => {
        let estPresent = verifierPresence(guest);
        let badgeClass = estPresent ? 'present' : 'absent';
        let detailHeure = (estPresent && guest.heure) ? `Scanné à ${guest.heure}` : 'Non arrivé';
        
        let rawTable = guest.tableau || guest.table;
        let displayTable = (rawTable && rawTable !== 'N/A' && rawTable !== 'Non attribuée') ? rawTable : 'Non attribuée';
        let tableBadge = `<div class="guest-table-badge"><i class="fa-solid fa-chair"></i> ${displayTable}</div>`;
        
        let nomPropre = extraireNom(guest);
        
        listeDiv.innerHTML += `
            <div class="guest-item">
                <div class="guest-info">
                    <strong>${nomPropre}</strong>
                    <span class="guest-time">${detailHeure}</span>
                    ${tableBadge}
                </div>
                <div>
                    <span class="badge ${badgeClass}">${estPresent ? 'Présent' : 'Absent'}</span>
                    ${!estPresent ? `<button onclick="forcerValidation('${guest.ticket_id || nomPropre}')" style="margin-left:8px; font-size:11px; padding:4px 6px; border-radius:5px; border:none; background:var(--primary); color:white; cursor:pointer;"><i class="fa-solid fa-check"></i></button>` : ''}
                </div>
            </div>
        `;
    });
}

function forcerValidation(identifier) {
    let invite = BaseDonneesInvites.find(g => g.ticket_id === identifier || extraireNom(g) === identifier);
    if (invite) validerEntree(invite);
}

function sauvegarderParametres() {
    WebhookUrl = document.getElementById('webhook-url').value.trim();
    localStorage.setItem('smartcheck_webhook', WebhookUrl);
    alert("Configuration enregistrée !");
}

async function testerConnexion() {
    let url = document.getElementById('webhook-url').value.trim();
    if(!url) return alert("Entrez une URL.");
    try {
        let res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({action:'ping'}) });
        if(res.ok) alert("Connecté à n8n avec succès ! 🚀");
        else alert("Réponse du serveur avec une erreur.");
    } catch(e) {
        alert("Échec de la connexion.");
    }
}

function MettreAJourAffichage() {
    let total = BaseDonneesInvites.length;
    let presents = BaseDonneesInvites.filter(g => verifierPresence(g)).length;
    let ratio = total > 0 ? Math.round((presents / total) * 100) : 0;
    
    let elTotal = document.getElementById('stat-total');
    let elPresent = document.getElementById('stat-present');
    let elRatio = document.getElementById('stat-ratio');
    
    if (elTotal) elTotal.innerText = total;
    if (elPresent) elPresent.innerText = presents;
    if (elRatio) elRatio.innerText = ratio + '%';
    
    filtrerInvites();
}

function declencherFlash(message, couleur) {
    let overlay = document.getElementById('scan-overlay');
    if (!overlay) return;
    overlay.style.backgroundColor = couleur;
    overlay.innerHTML = message;
    overlay.style.display = 'flex';
    
    if (navigator.vibrate) navigator.vibrate([200]);
    setTimeout(() => overlay.style.display = 'none', 2500);
}

function sauvegarderLocalement() {
    localStorage.setItem('smartcheck_db', JSON.stringify(BaseDonneesInvites));
}

function reinitialiserLocale() {
    if (confirm("Voulez-vous vider le cache local ?")) {
        BaseDonneesInvites = [];
        sauvegarderLocalement();
        MettreAJourAffichage();
    }
}
