// ========================================================
// 1. CONFIGURAÇÃO E INICIALIZAÇÃO
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

// Controle de Login
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
    auth.signInWithEmailAndPassword(email, pass).catch(err => Swal.fire({ icon: 'error', title: 'Erro', text: 'Acesso Negado!', background: '#1a1f26', color: '#fff' }));
}
function logout() { auth.signOut(); }

// ========================================================
// 2. FUNÇÕES DE STATUS E CORES (LAYOUT)
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

// ========================================================
// 3. PROCESSAMENTO (LANÇAR / EDITAR)
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
        Swal.fire({ icon: 'warning', title: 'Atenção', text: 'ID e Data são obrigatórios!', background: '#1a1f26', color: '#fff' });
        return;
    }

    let vencimentoStr = "-";
    if (duracao > 0) {
        let venc = new Date(dataCompra + 'T12:00:00');
        venc.setDate(venc.getDate() + duracao);
        vencimentoStr = venc.toISOString().split('T')[0];
    }

    const id = idEdit || Date.now().toString();
    const reg = { id, nome, tipoVip, valor, dataCompra, duracao, vencimento: vencimentoStr, obs, baixado: false };

    db.ref('vips/' + id).set(reg).then(() => {
        saveLog(idEdit ? "EDITOU" : "LANÇOU", nome);
        limparCampos();
        Swal.fire({ icon: 'success', title: 'Salvo!', timer: 1000, showConfirmButton: false, background: '#1a1f26', color: '#fff' });
    });
}

function editarVip(id) {
    const v = vipsGlobais.find(v => v.id == id);
    if (!v) return;
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

function limparCampos() {
    ['edit-id', 'nome', 'valor', 'duracao', 'obs'].forEach(id => document.getElementById(id).value = '');
    const btn = document.getElementById('btn-add');
    btn.innerText = "LANÇAR REGISTRO";
    btn.style.background = "var(--primary)";
}

// ========================================================
// 4. RENDERIZAÇÃO E CÁLCULOS (SOMA TUDO NA BUSCA)
// ========================================================
function mostrarVips() {
    const tabela = document.getElementById('tabelaVips');
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const busca = document.getElementById('buscaSteam').value.toUpperCase().trim();
    const wipeFiltro = document.getElementById('filtroWipe').value;
    
    tabela.innerHTML = '';
    let totalSoma = 0;
    let vendasCiclo = 0;
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
        const pertenceWipe = (wipeFiltro === "atual") ? (dCStr >= dataInicioWipe) : (dCStr >= wipeFiltro);

        if (coincideBusca) {
            // Se estiver buscando, soma o valor histórico total (todos os wipes)
            totalSoma += (vip.valor || 0);

            if (pertenceWipe) {
                if (diff < 0 && !vip.baixado) totalVencidosSemBaixa++;
                if (diff >= 0 && diff <= 3) vencendo3dias++;
                vendasCiclo++;

                // Lógica de Filtros de Visualização
                if (modoFiltroVencidos && (diff >= 0 || vip.baixado)) return;
                if (mostrarApenasAtivos && diff < 0) return;

                let glowClass = (diff <= 3 && diff >= 0) ? "glow-red" : "";
                let statusBadge = vip.duracao === 0 ? `<span class="badge status-perm">PERMANENTE</span>` : (diff < 0 ? `<span class="badge status-expired">VENCIDO</span>` : `<span class="badge status-active">ATIVO</span>`);
                let tempoBadge = `<span class="days-left ${diff < 0 ? 'days-red' : (diff <= 5 ? 'days-orange' : 'days-green')}">${diff < 0 ? 0 : (vip.duracao === 0 ? '∞' : diff)} DIAS</span>`;

                tabela.innerHTML += `
                    <tr class="${vip.baixado ? 'row-baixa' : ''}">
                        <td class="${glowClass}"><strong>${vip.nome}</strong> <span class="vip-tag ${getVipClass(vip.tipoVip)}">${vip.tipoVip}</span></td>
                        <td style="color:var(--success)">R$ ${vip.valor.toFixed(2)}</td>
                        <td>${dCStr.split('-').reverse().join('/')}</td>
                        <td>${vip.vencimento === "-" ? "ÚNICO" : vip.vencimento.split('-').reverse().join('/')}</td>
                        <td>${statusBadge} ${tempoBadge}</td>
                        <td>
                            <button class="btn-mini btn-edit" onclick="editarVip('${vip.id}')">EDITAR</button>
                            <button class="btn-mini btn-del" onclick="removerVip('${vip.id}')">DEL</button>
                        </td>
                    </tr>`;
            }
        }
    });

    // Atualiza Painel
    document.getElementById('faturamentoMes').innerText = `R$ ${totalSoma.toFixed(2)}`;
    document.getElementById('totalVendasMes').innerText = vendasCiclo;
    document.getElementById('vencendoLogo').innerText = vencendo3dias;
    document.getElementById('badge-vencidos').innerText = totalVencidosSemBaixa;
    document.getElementById('badge-vencidos').style.display = totalVencidosSemBaixa > 0 ? 'block' : 'none';
    document.getElementById('labelFaturamento').innerText = busca !== "" ? "Histórico Total do ID" : "Faturamento do Ciclo";
}

// ========================================================
// 5. AUXILIARES E WIPE
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

function filtrarVencidos() { modoFiltroVencidos = !modoFiltroVencidos; mostrarVips(); }
function toggleAtivos() { 
    mostrarApenasAtivos = !mostrarApenasAtivos; 
    document.getElementById('btnFiltroAtivo').classList.toggle('active');
    mostrarVips(); 
}

function marcarNovoWipe() {
    Swal.fire({
        title: 'Novo Wipe?',
        text: "O faturamento atual será arquivado.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Confirmar Wipe',
        background: '#1a1f26', color: '#fff'
    }).then(r => {
        if(r.isConfirmed) {
            const hoje = new Date().toISOString().split('T')[0];
            db.ref('configuracoes/ultimoWipe').set(hoje);
            saveLog("WIPE", "Novo ciclo iniciado.");
        }
    });
}

function removerVip(id) {
    Swal.fire({ title: 'Excluir?', icon: 'warning', showCancelButton: true, background: '#1a1f26', color: '#fff' })
    .then(r => { if(r.isConfirmed) db.ref('vips/' + id).remove(); });
}

function saveLog(acao, detalhe) {
    db.ref('logs').push({ user: auth.currentUser.email, acao, detalhe, timestamp: new Date().toLocaleString() });
}

function carregarLogs() {
    db.ref('logs').limitToLast(10).on('value', snap => {
        const d = document.getElementById('logDisplay');
        d.innerHTML = "";
        snap.forEach(c => {
            const l = c.val();
            d.innerHTML = `<div>[${l.timestamp}] ${l.acao}: ${l.detalhe}</div>` + d.innerHTML;
        });
    });
}

function carregarHistoricoWipes() {
    db.ref('configuracoes/historicoWipes').on('value', snap => {
        const s = document.getElementById('filtroWipe');
        s.innerHTML = '<option value="atual">Ciclo Ativo (Agora)</option>';
        snap.forEach(w => {
            const val = w.val();
            s.innerHTML += `<option value="${val.inicio}">Wipe ${val.inicio.split('-').reverse().join('/')}</option>`;
        });
    });
}
