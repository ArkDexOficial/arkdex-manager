// ========================================================
// CONFIGURAÇÃO FIREBASE
// ========================================================
const firebaseConfig = {
    apiKey: "AIzaSyCoObGx8rVkUVdau2zeU2azChGvmmidHcA",
    authDomain: "arkdex-3ce32.firebaseapp.com",
    databaseURL: "https://arkdex-3ce32-default-rtdb.firebaseio.com",
    projectId: "arkdex-3ce32",
    storageBucket: "arkdex-3ce32.appspot.com",
    messagingSenderId: "33403949116",
    appId: "1:33403949116:web:b9e61305ae4b7cf0dd7339"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

let vipsGlobais = [];
let dataInicioWipe = null;
let modoFiltroVencidos = false;

// ========================================================
// CONTROLE DE ACESSO E LOGIN
// ========================================================
auth.onAuthStateChanged(user => {
    const loginOverlay = document.getElementById('login-overlay');
    const mainApp = document.getElementById('main-app');
    
    if (user) {
        loginOverlay.style.display = 'none';
        mainApp.style.display = 'block';
        carregarDataWipe();
        carregarDados();
        carregarLogs();
        carregarHistoricoWipes();
    } else {
        loginOverlay.style.display = 'flex';
        mainApp.style.display = 'none';
    }
});

function login() {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    
    if(!email || !pass) {
        Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Preencha todos os campos!', background: '#1a1f26', color: '#fff' });
        return;
    }

    auth.signInWithEmailAndPassword(email, pass).catch(err => {
        Swal.fire({ icon: 'error', title: 'Erro', text: 'E-mail ou senha incorretos!', background: '#1a1f26', color: '#fff' });
    });
}

function logout() { 
    auth.signOut(); 
}

// ========================================================
// PROCESSAMENTO DE REGISTROS
// ========================================================
function processarVip() {
    const idEdit = document.getElementById('edit-id').value;
    const nomesRaw = document.getElementById('nome').value.trim();
    const tipoVip = document.getElementById('tipoVip').value;
    const dataCompra = document.getElementById('dataCompra').value;
    const valor = parseFloat(document.getElementById('valor').value) || 0;
    const duracao = parseInt(document.getElementById('duracao').value) || 0;
    const obs = document.getElementById('obs').value.toUpperCase();

    if (!dataCompra) {
        Swal.fire({ icon: 'warning', title: 'Atenção', text: 'A data da compra é obrigatória!', background: '#1a1f26', color: '#fff' });
        return;
    }

    const idRef = idEdit || Date.now().toString();
    
    let vencimentoStr = "-";
    if (duracao > 0) {
        let venc = new Date(dataCompra + 'T12:00:00');
        venc.setDate(venc.getDate() + duracao);
        vencimentoStr = venc.toISOString().split('T')[0];
    }

    const reg = { 
        id: idRef, 
        nome: nomesRaw ? nomesRaw.toUpperCase() : "ID NÃO INFORMADO", 
        tipoVip, 
        valor, 
        dataCompra, 
        duracao, 
        vencimento: vencimentoStr, 
        obs, 
        baixado: false, 
        pausado: false 
    };

    db.ref('vips/' + idRef).set(reg).then(() => {
        saveLog(idEdit ? "EDITOU" : "LANÇOU", (nomesRaw ? nomesRaw.split('\n')[0] : "SEM ID") + "...");
        limparCampos();
        Swal.fire({ icon: 'success', title: 'Sucesso!', timer: 800, showConfirmButton: false, background: '#1a1f26', color: '#fff' });
    });
}

// ========================================================
// RENDERIZAÇÃO DA TABELA (COM CORES PULSANTES)
// ========================================================
function mostrarVips() {
    const tabela = document.getElementById('tabelaVips');
    const busca = document.getElementById('buscaSteam').value.toUpperCase().trim();
    const wipeFiltro = document.getElementById('filtroWipe').value;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    
    tabela.innerHTML = '';
    let faturamentoSoma = 0;
    let vendasContador = 0;
    let vencendo3dias = 0;
    let totalVencidosSemBaixa = 0;

    vipsGlobais.forEach(vip => {
        const coincideBusca = (busca === "" || vip.nome.includes(busca) || vip.obs.includes(busca));
        const pertenceWipe = (wipeFiltro === "atual") ? (vip.dataCompra >= dataInicioWipe) : (vip.dataCompra >= wipeFiltro);
        
        if (coincideBusca && pertenceWipe) {
            faturamentoSoma += (vip.valor || 0);
            vendasContador++;
            
            let diff = -999;
            if (vip.duracao > 0 && vip.vencimento !== "-") {
                const dV = new Date(vip.vencimento + 'T12:00:00');
                diff = Math.ceil((dV - hoje) / (1000 * 60 * 60 * 24));
            }

            if (diff >= 0 && diff <= 3 && !vip.pausado && vip.duracao > 0) vencendo3dias++;
            if (diff < 0 && !vip.baixado && vip.duracao > 0) totalVencidosSemBaixa++;

            if (modoFiltroVencidos && (diff >= 0 || vip.baixado)) return;

            let statusBadge = "";
            let tempoBadge = "";
            let glowClass = ""; 

            if (vip.pausado) {
                statusBadge = `<span class="badge status-paused">PAUSADO</span>`;
                tempoBadge = `<span class="days-left days-orange">CONGELADO</span>`;
            } else if (vip.tipoVip === "OUTROS" && vip.duracao === 0) {
                statusBadge = `<span class="badge" style="background: var(--primary); color: #000;">ITEM / PONTOS</span>`;
                tempoBadge = `<span class="days-left days-perm">ENTREGUE</span>`;
            } else if (vip.duracao === 0) {
                statusBadge = `<span class="badge status-perm">PERMANENTE</span>`;
                tempoBadge = `<span class="days-left days-perm">INFINITO</span>`;
            } else if (diff < 0) {
                statusBadge = `<span class="badge status-expired">VENCIDO</span>`;
                tempoBadge = `<span class="days-left days-red">EXPIRADO</span>`;
                glowClass = "glow-red"; 
            } else {
                statusBadge = `<span class="badge status-active">ATIVO</span>`;
                if (diff <= 3) {
                    tempoBadge = `<span class="days-left days-red">${diff} DIAS</span>`;
                    glowClass = "glow-red";
                } else if (diff <= 5) {
                    tempoBadge = `<span class="days-left days-orange">${diff} DIAS</span>`;
                    glowClass = "glow-orange";
                } else {
                    tempoBadge = `<span class="days-left days-green">${diff} DIAS</span>`;
                }
            }
            
            tabela.innerHTML += `
                <tr class="${vip.baixado ? 'row-baixa' : ''} ${vip.pausado ? 'row-paused' : ''}">
                    <td class="steam-id-wrap ${glowClass}">
                        <div style="font-weight:800; color:var(--text-main);">${vip.nome}</div>
                        <div style="margin-top:6px; display: flex; flex-wrap: wrap; gap: 5px; align-items: center;">
                            <span class="vip-tag ${getVipClass(vip.tipoVip)}">${vip.tipoVip}</span>
                            ${vip.obs ? `<span style="font-size:0.7rem; color:var(--warning); background: rgba(251,191,36,0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(251,191,36,0.2);">Obs: ${vip.obs}</span>` : ''}
                        </div>
                    </td>
                    <td style="color:var(--success); font-weight:800">R$ ${vip.valor.toFixed(2)}</td>
                    <td>${vip.dataCompra.split('-').reverse().join('/')}</td>
                    <td>${vip.vencimento === "-" ? "ÚNICO" : vip.vencimento.split('-').reverse().join('/')}</td>
                    <td><div style="display:flex; flex-direction:column; gap:5px;">${statusBadge} ${tempoBadge}</div></td>
                    <td>
                        <div class="action-buttons-wrap">
                            <button class="btn-mini btn-edit" onclick="editarVip('${vip.id}')">EDITAR</button>
                            <button class="btn-mini btn-pause" onclick="togglePausa('${vip.id}')">${vip.pausado ? 'RETOMAR' : 'PAUSAR'}</button>
                            <button class="btn-mini btn-baixa ${vip.baixado ? 'done' : ''}" onclick="marcarBaixa('${vip.id}')">${vip.baixado ? 'FINALIZADO' : 'BAIXA'}</button>
                            <button class="btn-mini btn-del" onclick="removerVip('${vip.id}')">DEL</button>
                        </div>
                    </td>
                </tr>`;
        }
    });

    document.getElementById('faturamentoMes').innerText = `R$ ${faturamentoSoma.toFixed(2)}`;
    document.getElementById('totalVendasMes').innerText = vendasContador;
    document.getElementById('vencendoLogo').innerText = vencendo3dias;
    
    const badge = document.getElementById('badge-vencidos');
    if(badge) {
        badge.innerText = totalVencidosSemBaixa;
        badge.style.display = totalVencidosSemBaixa > 0 ? 'block' : 'none';
    }
}

// ========================================================
// DEMAIS FUNÇÕES DE SUPORTE
// ========================================================
function getVipClass(tipo) {
    const t = tipo?.toUpperCase() || '';
    if (t.includes('ELITE')) return 'tag-elite';
    if (t.includes('IMPERADOR')) return 'tag-imperador';
    if (t.includes('LENDÁRIO') || t.includes('LENDARIO')) return 'tag-lendario';
    if (t.includes('EXTREME')) return 'tag-extreme';
    if (t.includes('SUPREMO')) return 'tag-supremo';
    return 'tag-unloked';
}

function carregarDataWipe() {
    db.ref('configuracoes/ultimoWipe').on('value', snap => {
        dataInicioWipe = snap.val() || new Date().toISOString().split('T')[0];
        document.getElementById('data-inicio-span').innerText = dataInicioWipe.split('-').reverse().join('/');
        mostrarVips();
    });
}

function carregarDados() {
    db.ref('vips').on('value', snap => {
        const data = snap.val();
        vipsGlobais = data ? Object.keys(data).map(k => ({...data[k], id: k})) : [];
        mostrarVips();
    });
}

function carregarLogs() {
    db.ref('logs').limitToLast(5).on('value', snap => {
        const display = document.getElementById('logDisplay');
        if(!display) return;
        display.innerHTML = "";
        snap.forEach(c => {
            const l = c.val();
            display.innerHTML = `<div>[${l.timestamp}] ${l.acao}: ${l.detalhe}</div>` + display.innerHTML;
        });
    });
}

function saveLog(acao, detalhe) {
    if(auth.currentUser) {
        db.ref('logs').push({ user: auth.currentUser.email, acao, detalhe, timestamp: new Date().toLocaleString() });
    }
}

function editarVip(id) {
    const v = vipsGlobais.find(v => v.id == id);
    if(!v) return;
    document.getElementById('edit-id').value = v.id;
    document.getElementById('nome').value = v.nome;
    document.getElementById('tipoVip').value = v.tipoVip;
    document.getElementById('dataCompra').value = v.dataCompra;
    document.getElementById('valor').value = v.valor;
    document.getElementById('duracao').value = v.duracao;
    document.getElementById('obs').value = v.obs || '';
    const btn = document.getElementById('btn-add');
    btn.innerText = "ALTERAR DADOS";
    btn.style.background = "var(--warning)";
    window.scrollTo({ top: 500, behavior: 'smooth' });
}

function removerVip(id) {
    Swal.fire({ title: 'Excluir?', icon: 'warning', showCancelButton: true, background: '#1a1f26', color: '#fff' })
    .then(r => { if(r.isConfirmed) db.ref('vips/' + id).remove(); });
}

function togglePausa(id) {
    const v = vipsGlobais.find(v => v.id == id);
    db.ref('vips/' + id).update({ pausado: !v.pausado });
}

function marcarBaixa(id) {
    const v = vipsGlobais.find(v => v.id == id);
    db.ref('vips/' + id).update({ baixado: !v.baixado });
}

function limparCampos() {
    ['edit-id', 'nome', 'valor', 'duracao', 'obs'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    const btn = document.getElementById('btn-add');
    btn.innerText = "LANÇAR REGISTRO";
    btn.style.background = "var(--primary)";
}

function filtrarVencidos() { modoFiltroVencidos = !modoFiltroVencidos; mostrarVips(); }

function carregarHistoricoWipes() {
    db.ref('configuracoes/historicoWipes').on('value', snap => {
        const select = document.getElementById('filtroWipe');
        if(!select) return;
        select.innerHTML = '<option value="atual">Ciclo Ativo (Agora)</option>';
        snap.forEach(w => {
            const d = w.val();
            select.innerHTML += `<option value="${d.inicio}">Wipe ${d.inicio.split('-').reverse().join('/')}</option>`;
        });
    });
}
