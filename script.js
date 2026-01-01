// ========================================================
// 1. CONFIGURAÇÃO E VARIÁVEIS GLOBAIS
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

let mostrarApenasAtivos = false;
let dataInicioWipe = null;      
let vipsGlobais = [];
let historicoWipes = [];

// ========================================================
// 2. AUTENTICAÇÃO
// ========================================================
auth.onAuthStateChanged(user => {
    const loginOverlay = document.getElementById('login-overlay');
    const mainApp = document.getElementById('main-app');
    if (user) {
        loginOverlay.style.display = 'none';
        mainApp.style.display = 'block';
        carregarDataWipe();
        carregarHistoricoWipes();
        carregarDados();
        carregarLogs();
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
// 3. LÓGICA DE CORES E CATEGORIAS (O QUE TINHA SAÍDO)
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
// 4. PROCESSAMENTO E EDIÇÃO
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
        vencimento: vencimentoStr, obs,
        baixado: false, pausado: false
    };

    db.ref('vips/' + id).set(reg).then(() => {
        saveLog(idEdit ? "EDITOU" : "LANÇOU", nome);
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

    // ALTERA O BOTÃO VISUALMENTE
    const btn = document.getElementById('btn-add');
    btn.innerText = "ALTERAR DADOS";
    btn.style.background = "var(--warning)"; // Muda para amarelo na edição
    window.scrollTo({ top: 500, behavior: 'smooth' });
}

function limparCampos() {
    ['edit-id', 'nome', 'valor', 'duracao', 'obs'].forEach(id => document.getElementById(id).value = '');
    const btn = document.getElementById('btn-add');
    btn.innerText = "LANÇAR REGISTRO";
    btn.style.background = "var(--primary)"; // Volta ao azul original
}

// ========================================================
// 5. RENDERIZAÇÃO E BUSCA (FATURAMENTO POR ID)
// ========================================================
function mostrarVips() {
    const tabela = document.getElementById('tabelaVips');
    if (!tabela) return;
    tabela.innerHTML = '';
    
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const busca = document.getElementById('buscaSteam').value.toUpperCase().trim();
    const wipeFiltro = document.getElementById('filtroWipe').value;

    let totalCalculado = 0;
    let vendasNoFiltro = 0;

    vipsGlobais.forEach(vip => {
        const dCStr = vip.dataCompra;
        const dVStr = vip.vencimento;
        let diff = -999;
        
        if (vip.duracao > 0 && dVStr !== "-") {
            const dV = new Date(dVStr + 'T12:00:00');
            diff = Math.ceil((dV - hoje) / (1000 * 60 * 60 * 24));
        }

        // LÓGICA DE EXIBIÇÃO
        let pertenceAoWipe = (wipeFiltro === "atual") ? (dCStr >= dataInicioWipe) : (dCStr >= wipeFiltro);
        let coincideComBusca = (busca === "" || vip.nome.includes(busca));
        
        if (coincideComBusca) {
            // Se houver busca, somamos o valor de TODOS os wipes que esse ID aparece
            totalCalculado += (vip.valor || 0);
            
            // Mas só mostramos na tabela se pertencer ao wipe selecionado
            if (pertenceAoWipe) {
                vendasNoFiltro++;
                
                let statusBadge = vip.duracao === 0 ? `<span class="badge status-perm">PERMANENTE</span>` : 
                                 (diff < 0 ? `<span class="badge status-expired">VENCIDO</span>` : `<span class="badge status-active">ATIVO</span>`);
                
                let tempoBadge = vip.duracao === 0 ? `<span class="days-left days-perm">ITEM</span>` : 
                                 `<span class="days-left ${diff < 3 ? 'days-red' : 'days-green'}">${diff < 0 ? 0 : diff} DIAS</span>`;

                tabela.innerHTML += `
                    <tr class="${vip.baixado ? 'row-baixa' : ''}">
                        <td><strong>${vip.nome}</strong> <span class="vip-tag ${getVipClass(vip.tipoVip)}">${vip.tipoVip}</span></td>
                        <td style="color:var(--success)">R$ ${vip.valor.toFixed(2)}</td>
                        <td>${dCStr.split('-').reverse().join('/')}</td>
                        <td>${dVStr === "-" ? "ÚNICO" : dVStr.split('-').reverse().join('/')}</td>
                        <td>${statusBadge} ${tempoBadge}</td>
                        <td>
                            <button class="btn-mini btn-edit" onclick="editarVip('${vip.id}')">EDITAR</button>
                            <button class="btn-mini btn-del" onclick="removerVip('${vip.id}')">DEL</button>
                        </td>
                    </tr>`;
            }
        }
    });

    // ATUALIZA OS CARDS
    document.getElementById('faturamentoMes').innerText = `R$ ${totalCalculado.toFixed(2)}`;
    document.getElementById('totalVendasMes').innerText = vendasNoFiltro;
    
    // Altera o label se estiver buscando
    document.getElementById('labelFaturamento').innerText = busca !== "" ? "Total Gasto pelo ID" : "Faturamento do Ciclo";
}

// ========================================================
// 6. FUNÇÕES DE APOIO (WIPE E LOGS)
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

function marcarNovoWipe() {
    Swal.fire({
        title: 'Novo Wipe?',
        text: "Isso limpará a visão do ciclo atual!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#f43f5e',
        confirmButtonText: 'Sim, Resetar!',
        background: '#1a1f26', color: '#fff'
    }).then((result) => {
        if (result.isConfirmed) {
            const hoje = new Date().toISOString().split('T')[0];
            db.ref('configuracoes/ultimoWipe').set(hoje);
            saveLog("WIPE", "Reiniciou o ciclo.");
        }
    });
}

function removerVip(id) {
    Swal.fire({
        title: 'Excluir?',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Sim, apagar',
        background: '#1a1f26', color: '#fff'
    }).then(r => { if(r.isConfirmed) db.ref('vips/' + id).remove(); });
}

function saveLog(acao, detalhe) {
    const user = auth.currentUser ? auth.currentUser.email : "Admin";
    db.ref('logs').push({ user, acao, detalhe, timestamp: new Date().toLocaleString() });
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
        if(snap.exists()){
            snap.forEach(w => {
                const data = w.val();
                select.innerHTML += `<option value="${data.inicio}">Wipe ${data.inicio}</option>`;
            });
        }
    });
}
