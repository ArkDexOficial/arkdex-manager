// ========================================================
// CONFIGURAÇÃO FIREBASE (MANTIDA)
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
    document.getElementById('login-overlay').style.display = user ? 'none' : 'flex';
    document.getElementById('main-app').style.display = user ? 'block' : 'none';
    if (user) {
        carregarDataWipe();
        carregarDados();
        carregarLogs();
        carregarHistoricoWipes();
    }
});

function login() {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    auth.signInWithEmailAndPassword(email, pass).catch(err => {
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Acesso negado!', background: '#1a1f26', color: '#fff' });
    });
}
function logout() { auth.signOut(); }

// ========================================================
// LANÇAMENTO E EDIÇÃO (SUPORTE A MULTI-ID)
// ========================================================
function processarVip() {
    const idEdit = document.getElementById('edit-id').value;
    const nomesRaw = document.getElementById('nome').value.trim(); // Pega o conteúdo do textarea
    const tipoVip = document.getElementById('tipoVip').value;
    const dataCompra = document.getElementById('dataCompra').value;
    const valor = parseFloat(document.getElementById('valor').value) || 0;
    const duracao = parseInt(document.getElementById('duracao').value) || 0;
    const obs = document.getElementById('obs').value.toUpperCase();

    if (!nomesRaw || !dataCompra) {
        Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Preencha os IDs e a Data!', background: '#1a1f26', color: '#fff' });
        return;
    }

    // Se for edição, mantém o ID original. Se for novo, gera um.
    const idRef = idEdit || Date.now().toString();
    
    let vencimentoStr = "-";
    if (duracao > 0) {
        let venc = new Date(dataCompra + 'T12:00:00');
        venc.setDate(venc.getDate() + duracao);
        vencimentoStr = venc.toISOString().split('T')[0];
    }

    const reg = { 
        id: idRef, 
        nome: nomesRaw.toUpperCase(), // Salva o texto do textarea com as quebras de linha
        tipoVip, valor, dataCompra, duracao, 
        vencimento: vencimentoStr, obs, 
        baixado: false, pausado: false 
    };

    db.ref('vips/' + idRef).set(reg).then(() => {
        saveLog(idEdit ? "EDITOU" : "LANÇOU", nomesRaw.split('\n')[0] + "...");
        limparCampos();
        Swal.fire({ icon: 'success', title: 'Sucesso!', timer: 800, showConfirmButton: false, background: '#1a1f26', color: '#fff' });
    });
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
    document.getElementById('obs').value = v.obs;

    const btn = document.getElementById('btn-add');
    btn.innerText = "ALTERAR DADOS";
    btn.style.background = "var(--warning)";
    window.scrollTo({ top: 500, behavior: 'smooth' });
}

// ========================================================
// FUNÇÕES DE PAUSA E BAIXA
// ========================================================
function togglePausa(id) {
    const v = vipsGlobais.find(v => v.id == id);
    db.ref('vips/' + id).update({ pausado: !v.pausado });
}

function marcarBaixa(id) {
    const v = vipsGlobais.find(v => v.id == id);
    db.ref('vips/' + id).update({ baixado: !v.baixado });
}

function limparCampos() {
    ['edit-id', 'nome', 'valor', 'duracao', 'obs'].forEach(id => document.getElementById(id).value = '');
    const btn = document.getElementById('btn-add');
    btn.innerText = "LANÇAR REGISTRO";
    btn.style.background = "var(--primary)";
}

// ========================================================
// RENDERIZAÇÃO E BUSCA
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
        const coincideBusca = (busca === "" || vip.nome.includes(busca));
        
        // Se houver busca, somar faturamento histórico desse ID em todos os wipes
        if (coincideBusca) faturamentoSoma += (vip.valor || 0);

        const pertenceWipe = (wipeFiltro === "atual") ? (vip.dataCompra >= dataInicioWipe) : (vip.dataCompra >= wipeFiltro);
        if (coincideBusca && pertenceWipe) {
            vendasContador++;
            
            let diff = -999;
            if (vip.duracao > 0 && vip.vencimento !== "-") {
                const dV = new Date(vip.vencimento + 'T12:00:00');
                diff = Math.ceil((dV - hoje) / (1000 * 60 * 60 * 24));
            }

            if (diff >= 0 && diff <= 3) vencendo3dias++;
            if (diff < 0 && !vip.baixado) totalVencidosSemBaixa++;

            // Filtro da Badge do Sino
            if (modoFiltroVencidos && (diff >= 0 || vip.baixado)) return;

            let statusBadge = vip.pausado ? `<span class="badge status-paused">PAUSADO</span>` :
                             (vip.duracao === 0 ? `<span class="badge status-perm">PERMANENTE</span>` : 
                             (diff < 0 ? `<span class="badge status-expired">VENCIDO</span>` : `<span class="badge status-active">ATIVO</span>`));
            
            let tempoBadge = `<span class="days-left ${diff < 0 ? 'days-red' : (diff <= 5 ? 'days-orange' : 'days-green')}">${diff < 0 ? 0 : (vip.duracao === 0 ? 'ITEM' : diff)} DIAS</span>`;
            let glowClass = (diff <= 3 && diff >= 0 && !vip.pausado) ? "glow-red" : "";

            tabela.innerHTML += `
                <tr class="${vip.baixado ? 'row-baixa' : ''} ${vip.pausado ? 'row-paused' : ''}">
                    <td class="steam-id-wrap ${glowClass}">
                        <strong>${vip.nome}</strong><br>
                        <span class="vip-tag ${getVipClass(vip.tipoVip)}">${vip.tipoVip}</span>
                    </td>
                    <td style="color:var(--success); font-weight:800">R$ ${vip.valor.toFixed(2)}</td>
                    <td>${vip.dataCompra.split('-').reverse().join('/')}</td>
                    <td>${vip.vencimento === "-" ? "ÚNICO" : vip.vencimento.split('-').reverse().join('/')}</td>
                    <td>${statusBadge} ${tempoBadge}</td>
                    <td>
                        <div class="action-buttons-wrap">
                            <button class="btn-mini btn-edit" onclick="editarVip('${vip.id}')">EDITAR</button>
                            <button class="btn-mini btn-pause" onclick="togglePausa('${vip.id}')">${vip.pausado ? 'VOLTAR' : 'PAUSAR'}</button>
                            <button class="btn-mini btn-baixa ${vip.baixado ? 'done' : ''}" onclick="marcarBaixa('${vip.id}')">${vip.baixado ? 'CONCLUÍDO' : 'DAR BAIXA'}</button>
                            <button class="btn-mini btn-del" onclick="removerVip('${vip.id}')">DEL</button>
                        </div>
                    </td>
                </tr>`;
        }
    });

    // Atualização dos Painéis
    document.getElementById('faturamentoMes').innerText = `R$ ${faturamentoSoma.toFixed(2)}`;
    document.getElementById('totalVendasMes').innerText = vendasContador;
    document.getElementById('vencendoLogo').innerText = vencendo3dias;
    document.getElementById('labelFaturamento').innerText = busca !== "" ? "Faturamento Total do ID" : "Faturamento do Ciclo";
    
    const badge = document.getElementById('badge-vencidos');
    badge.innerText = totalVencidosSemBaixa;
    badge.style.display = totalVencidosSemBaixa > 0 ? 'block' : 'none';
}

// ========================================================
// CARREGAMENTO DE DADOS (DATABASE)
// ========================================================
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
        display.innerHTML = "";
        snap.forEach(c => {
            const l = c.val();
            display.innerHTML = `<div>[${l.timestamp}] ${l.acao}: ${l.detalhe}</div>` + display.innerHTML;
        });
    });
}

function saveLog(acao, detalhe) {
    db.ref('logs').push({ user: auth.currentUser.email, acao, detalhe, timestamp: new Date().toLocaleString() });
}

function removerVip(id) {
    Swal.fire({ title: 'Excluir?', icon: 'warning', showCancelButton: true, background: '#1a1f26', color: '#fff' })
    .then(r => { if(r.isConfirmed) db.ref('vips/' + id).remove(); });
}

function filtrarVencidos() { modoFiltroVencidos = !modoFiltroVencidos; mostrarVips(); }

function carregarHistoricoWipes() {
    db.ref('configuracoes/historicoWipes').on('value', snap => {
        const select = document.getElementById('filtroWipe');
        select.innerHTML = '<option value="atual">Ciclo Ativo (Agora)</option>';
        snap.forEach(w => {
            const d = w.val();
            select.innerHTML += `<option value="${d.inicio}">Wipe ${d.inicio.split('-').reverse().join('/')}</option>`;
        });
    });
}
