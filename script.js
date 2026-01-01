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
let mostrarApenasAtivos = false;

// ========================================================
// CONTROLE DE ACESSO
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
    auth.signInWithEmailAndPassword(email, pass).catch(err => {
        Swal.fire({ icon: 'error', title: 'Erro', text: 'Acesso negado!', background: '#1a1f26', color: '#fff' });
    });
}
function logout() { auth.signOut(); }

// ========================================================
// LÓGICA DE CATEGORIAS E CORES (CSS INTEGRATION)
// ========================================================
function getVipClass(tipo) {
    const t = tipo?.toUpperCase() || '';
    if (t.includes('ELITE')) return 'tag-elite';
    if (t.includes('IMPERADOR')) return 'tag-imperador';
    if (t.includes('LENDÁRIO') || t.includes('LENDARIO')) return 'tag-lendario';
    if (t.includes('EXTREME')) return 'tag-extreme';
    if (t.includes('SUPREMO')) return 'tag-supremo';
    if (t.includes('UNLOKED')) return 'tag-unloked';
    return 'tag-outros';
}

// ========================================================
// LANÇAMENTO E EDIÇÃO
// ========================================================
function processarVip() {
    const idEdit = document.getElementById('edit-id').value;
    const nome = document.getElementById('nome').value.toUpperCase().trim();
    const tipoVip = document.getElementById('tipoVip').value;
    const dataCompra = document.getElementById('dataCompra').value;
    const valor = parseFloat(document.getElementById('valor').value) || 0;
    const duracao = parseInt(document.getElementById('duracao').value) || 0;
    const obs = document.getElementById('obs').value.toUpperCase();

    if (!nome || !dataCompra) {
        Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Preencha ID e Data!', background: '#1a1f26', color: '#fff' });
        return;
    }

    let vencimentoStr = "-";
    if (duracao > 0) {
        let venc = new Date(dataCompra + 'T12:00:00');
        venc.setDate(venc.getDate() + duracao);
        vencimentoStr = venc.toISOString().split('T')[0];
    }

    const id = idEdit || Date.now().toString();
    const reg = { 
        id, nome, tipoVip, valor, dataCompra, duracao, 
        vencimento: vencimentoStr, obs, baixado: false 
    };

    db.ref('vips/' + id).set(reg).then(() => {
        saveLog(idEdit ? "EDITOU" : "LANÇOU", nome.substring(0, 20) + "...");
        limparCampos();
        Swal.fire({ icon: 'success', title: 'Sucesso!', timer: 1000, showConfirmButton: false, background: '#1a1f26', color: '#fff' });
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

    // EFEITO VISUAL NO BOTÃO
    const btn = document.getElementById('btn-add');
    btn.innerText = "ALTERAR DADOS";
    btn.style.background = "var(--warning)";
    window.scrollTo({ top: 500, behavior: 'smooth' });
}

function limparCampos() {
    ['edit-id', 'nome', 'valor', 'duracao', 'obs'].forEach(id => document.getElementById(id).value = '');
    const btn = document.getElementById('btn-add');
    btn.innerText = "LANÇAR REGISTRO";
    btn.style.background = "var(--primary)";
}

// ========================================================
// RENDERIZAÇÃO DA TABELA E BUSCA POR ID (FATURAMENTO HISTÓRICO)
// ========================================================
function mostrarVips() {
    const tabela = document.getElementById('tabelaVips');
    const busca = document.getElementById('buscaSteam').value.toUpperCase().trim();
    const wipeFiltro = document.getElementById('filtroWipe').value;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    
    tabela.innerHTML = '';
    let faturamentoMostrado = 0;
    let vendasMostradas = 0;
    let vencendo3dias = 0;
    let totalVencidosSemBaixa = 0;

    vipsGlobais.forEach(vip => {
        const dCStr = vip.dataCompra;
        let diff = -999;
        
        if (vip.duracao > 0 && vip.vencimento !== "-") {
            const dV = new Date(vip.vencimento + 'T12:00:00');
            diff = Math.ceil((dV - hoje) / (1000 * 60 * 60 * 24));
        }

        const coincideBusca = (busca === "" || vip.nome.includes(busca));
        const pertenceAoWipe = (wipeFiltro === "atual") ? (dCStr >= dataInicioWipe) : (dCStr >= wipeFiltro);

        if (coincideBusca) {
            // Se estiver buscando um ID, somamos TUDO que ele já gastou na história
            faturamentoMostrado += (vip.valor || 0);

            // Só mostramos na tabela o que for do wipe selecionado
            if (pertenceAoWipe) {
                vendasMostradas++;
                
                // Contadores para os cards de insight
                if (diff >= 0 && diff <= 3) vencendo3dias++;
                if (diff < 0 && !vip.baixado) totalVencidosSemBaixa++;

                // Lógica de Filtros (Apenas Ativos / Vencidos sem Baixa)
                if (mostrarApenasAtivos && diff < 0) return;
                if (modoFiltroVencidos && (diff >= 0 || vip.baixado)) return;

                // Estilos e Badges
                let glowClass = (diff <= 3 && diff >= 0) ? "glow-red" : (diff <= 7 ? "glow-orange" : "");
                let statusBadge = vip.duracao === 0 ? `<span class="badge status-perm">PERMANENTE</span>` : 
                                 (diff < 0 ? `<span class="badge status-expired">VENCIDO</span>` : `<span class="badge status-active">ATIVO</span>`);
                
                let tempoBadge = vip.duracao === 0 ? `<span class="days-left days-perm">ITEM</span>` : 
                                 `<span class="days-left ${diff < 0 ? 'days-red' : (diff <= 5 ? 'days-orange' : 'days-green')}">${diff < 0 ? 0 : diff} DIAS</span>`;

                tabela.innerHTML += `
                    <tr class="${vip.baixado ? 'row-baixa' : ''} ${vip.pausado ? 'row-paused' : ''}">
                        <td class="steam-id-wrap ${glowClass}">
                            <strong>${vip.nome}</strong> 
                            <span class="vip-tag ${getVipClass(vip.tipoVip)}">${vip.tipoVip}</span>
                        </td>
                        <td style="color:var(--success); font-weight:800">R$ ${vip.valor.toFixed(2)}</td>
                        <td>${dCStr.split('-').reverse().join('/')}</td>
                        <td>${vip.vencimento === "-" ? "ÚNICO" : vip.vencimento.split('-').reverse().join('/')}</td>
                        <td>${statusBadge} ${tempoBadge}</td>
                        <td>
                            <div class="action-buttons-wrap">
                                <button class="btn-mini btn-edit" onclick="editarVip('${vip.id}')">EDITAR</button>
                                <button class="btn-mini btn-baixa ${vip.baixado ? 'done' : ''}" onclick="marcarBaixa('${vip.id}')">BAIXA</button>
                                <button class="btn-mini btn-del" onclick="removerVip('${vip.id}')">DEL</button>
                            </div>
                        </td>
                    </tr>`;
            }
        }
    });

    // Atualiza os Cards Superiores
    document.getElementById('faturamentoMes').innerText = `R$ ${faturamentoMostrado.toFixed(2)}`;
    document.getElementById('totalVendasMes').innerText = vendasMostradas;
    document.getElementById('vencendoLogo').innerText = vencendo3dias;
    
    // Badge do Sino (Vencidos sem baixa)
    const badge = document.getElementById('badge-vencidos');
    badge.innerText = totalVencidosSemBaixa;
    badge.style.display = totalVencidosSemBaixa > 0 ? 'block' : 'none';

    // Texto dinâmico do faturamento
    document.getElementById('labelFaturamento').innerText = busca !== "" ? "Total Gasto pelo ID" : "Faturamento do Ciclo";
}

// ========================================================
// FUNÇÕES AUXILIARES
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

function marcarBaixa(id) {
    const v = vipsGlobais.find(v => v.id == id);
    db.ref('vips/' + id).update({ baixado: !v.baixado });
}

function toggleAtivos() {
    mostrarApenasAtivos = !mostrarApenasAtivos;
    document.getElementById('btnFiltroAtivo').classList.toggle('active');
    mostrarVips();
}

function filtrarVencidos() {
    modoFiltroVencidos = !modoFiltroVencidos;
    mostrarVips();
}

function removerVip(id) {
    Swal.fire({
        title: 'Excluir registro?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: 'var(--danger)',
        confirmButtonText: 'Sim, apagar!',
        background: '#1a1f26', color: '#fff'
    }).then(r => { if(r.isConfirmed) db.ref('vips/' + id).remove(); });
}

function marcarNovoWipe() {
    Swal.fire({
        title: 'Iniciar Novo Wipe?',
        text: "O ciclo atual será arquivado no histórico.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Confirmar Wipe',
        background: '#1a1f26', color: '#fff'
    }).then(r => {
        if(r.isConfirmed) {
            const hoje = new Date().toISOString().split('T')[0];
            db.ref('configuracoes/ultimoWipe').set(hoje);
            saveLog("WIPE", "Reiniciou o ciclo.");
        }
    });
}

function saveLog(acao, detalhe) {
    db.ref('logs').push({ 
        user: auth.currentUser.email, 
        acao, 
        detalhe, 
        timestamp: new Date().toLocaleString() 
    });
}

function carregarLogs() {
    db.ref('logs').limitToLast(5).on('value', snap => {
        const display = document.getElementById('logDisplay');
        display.innerHTML = "";
        snap.forEach(child => {
            const l = child.val();
            display.innerHTML = `<div>[${l.timestamp}] ${l.acao}: ${l.detalhe}</div>` + display.innerHTML;
        });
    });
}

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
