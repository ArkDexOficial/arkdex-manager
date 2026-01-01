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
let modoFiltroVencidos = false; 
let dataInicioWipe = null;      
let vipsGlobais = [];
let historicoWipes = [];

// ========================================================
// 2. AUTENTICAÇÃO E INICIALIZAÇÃO
// ========================================================
auth.onAuthStateChanged(user => {
    const loginOverlay = document.getElementById('login-overlay');
    const mainApp = document.getElementById('main-app');

    if (user) {
        if(loginOverlay) loginOverlay.style.display = 'none';
        if(mainApp) mainApp.style.display = 'block';
        carregarDataWipe();
        carregarHistoricoWipes();
        carregarDados();
        carregarLogs();
    } else {
        if(loginOverlay) loginOverlay.style.display = 'flex';
        if(mainApp) mainApp.style.display = 'none';
    }
});

function login() {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    auth.signInWithEmailAndPassword(email, pass).catch(error => {
        Swal.fire({ icon: 'error', title: 'Erro no Login', text: error.message, background: '#1e293b', color: '#fff' });
    });
}

function logout() { auth.signOut(); }

// ========================================================
// 3. LOGS E WIPE
// ========================================================
function saveLog(acao, detalhe) {
    const user = auth.currentUser ? auth.currentUser.email : "Desconhecido";
    const timestamp = new Date().toLocaleString('pt-BR');
    db.ref('logs').push({ user, acao, detalhe, timestamp });
}

function carregarLogs() {
    db.ref('logs').limitToLast(10).on('value', snap => {
        const display = document.getElementById('logDisplay');
        if (!display) return;
        display.innerHTML = "";
        snap.forEach(child => {
            const l = child.val();
            display.innerHTML = `<div>[${l.timestamp}] <b>${l.user}</b> ${l.acao}: ${l.detalhe}</div>` + display.innerHTML;
        });
    });
}

function carregarDataWipe() {
    db.ref('configuracoes/ultimoWipe').on('value', snap => {
        dataInicioWipe = snap.val();
        // Se não houver data de wipe, define uma data bem antiga para mostrar tudo
        if (!dataInicioWipe) dataInicioWipe = "2000-01-01";
        
        const span = document.getElementById('data-inicio-span');
        if(span) span.innerText = dataInicioWipe.split('-').reverse().join('/');
        mostrarVips();
    });
}

function carregarHistoricoWipes() {
    db.ref('configuracoes/historicoWipes').on('value', snap => {
        const wipes = snap.val();
        const select = document.getElementById('filtroWipe');
        if(!select) return;
        select.innerHTML = '<option value="atual">Ciclo Ativo (Agora)</option>';
        historicoWipes = [];
        if (wipes) {
            Object.keys(wipes).forEach(key => {
                const w = wipes[key];
                historicoWipes.push(w);
                const option = document.createElement('option');
                option.value = w.inicio; 
                option.innerText = `Wipe: ${w.inicio.split('-').reverse().join('/')}`;
                select.appendChild(option);
            });
        }
    });
}

function marcarNovoWipe() {
    Swal.fire({
        title: 'Iniciar Novo Ciclo?',
        text: "O faturamento atual será zerado na tela principal e salvo no histórico.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, Novo Wipe!',
        background: '#1e293b', color: '#fff'
    }).then((result) => {
        if (result.isConfirmed) {
            const hoje = new Date().toISOString().split('T')[0];
            const faturamento = document.getElementById('faturamentoMes').innerText;
            
            // Salva no histórico antes de resetar
            db.ref('configuracoes/historicoWipes').push({
                inicio: dataInicioWipe,
                fim: hoje,
                faturamento: faturamento
            });

            db.ref('configuracoes/ultimoWipe').set(hoje);
            saveLog("WIPE", "Iniciou um novo ciclo de wipe.");
            Swal.fire({ icon: 'success', title: 'Ciclo Atualizado!', background: '#1e293b', color: '#fff' });
        }
    });
}

// ========================================================
// 4. FILTROS E BUSCA
// ========================================================
function carregarDados() {
    const hoje = new Date();
    const inputData = document.getElementById('dataCompra');
    if(inputData) inputData.value = hoje.toISOString().split('T')[0];
    
    const dataDisplay = document.getElementById('data-atual');
    if(dataDisplay) dataDisplay.innerText = hoje.toLocaleDateString('pt-BR', { dateStyle: 'full' });
    
    db.ref('vips').on('value', (snapshot) => {
        const data = snapshot.val();
        vipsGlobais = data ? Object.keys(data).map(key => ({...data[key], id: key})) : [];
        mostrarVips();
    });
}

function filtrarVencidos() {
    modoFiltroVencidos = !modoFiltroVencidos;
    const btnSino = document.querySelector('.notification-container');
    if (modoFiltroVencidos) {
        btnSino.style.borderColor = "var(--danger)";
        btnSino.style.background = "rgba(244, 63, 94, 0.1)";
    } else {
        btnSino.style.borderColor = "var(--border)";
        btnSino.style.background = "var(--input-bg)";
    }
    mostrarVips();
}

function toggleAtivos() {
    mostrarApenasAtivos = !mostrarApenasAtivos;
    const btn = document.getElementById('btnFiltroAtivo');
    btn.classList.toggle('active');
    btn.innerText = mostrarApenasAtivos ? "Mostrando Ativos" : "Apenas Ativos";
    mostrarVips();
}

function getVipClass(tipo) {
    const t = tipo?.toUpperCase() || '';
    if (t.includes('ELITE')) return 'tag-elite';
    if (t.includes('IMPERADOR')) return 'tag-imperador';
    if (t.includes('LENDÁRIO')) return 'tag-lendario';
    if (t.includes('EXTREME')) return 'tag-extreme';
    if (t.includes('SUPREMO')) return 'tag-supremo';
    return 'tag-unloked';
}

// ========================================================
// 5. PROCESSAMENTO (LANÇAR / EDITAR)
// ========================================================
function processarVip() {
    const idEdit = document.getElementById('edit-id').value;
    let nome = document.getElementById('nome').value.toUpperCase().trim();
    if (nome === "") { nome = "S/ ID"; }
    
    const tipoVip = document.getElementById('tipoVip').value.toUpperCase();
    const dataCompra = document.getElementById('dataCompra').value;
    const valor = parseFloat(document.getElementById('valor').value) || 0;
    const duracao = parseInt(document.getElementById('duracao').value) || 0;
    const obs = document.getElementById('obs').value.toUpperCase();

    if (!dataCompra) { Swal.fire("A Data é obrigatória!"); return; }

    let vencimentoStr = "-";
    if (duracao > 0) {
        let venc = new Date(dataCompra + 'T12:00:00');
        venc.setDate(venc.getDate() + duracao);
        vencimentoStr = venc.toISOString().split('T')[0];
    }

    let baixadoAnterior = false, pausadoAnterior = false, diasRestantesAnterior = 0;
    if(idEdit) {
        const existente = vipsGlobais.find(v => v.id == idEdit);
        if(existente) {
            baixadoAnterior = existente.baixado || false;
            pausadoAnterior = existente.pausado || false;
            diasRestantesAnterior = existente.diasRestantesAoPausar || 0;
        }
    }

    const id = idEdit ? idEdit : Date.now().toString();
    const reg = { 
        id, nome, tipoVip, valor, dataCompra, duracao, 
        vencimento: vencimentoStr, obs,
        baixado: baixadoAnterior, pausado: pausadoAnterior, 
        diasRestantesAoPausar: diasRestantesAnterior
    };

    db.ref('vips/' + id).set(reg).then(() => {
        saveLog(idEdit ? "EDITOU" : "LANÇOU", `${nome} (${tipoVip})`);
        limparCampos();
        Swal.fire({ icon: 'success', title: 'Salvo!', timer: 1500, showConfirmButton: false, background: '#1e293b', color: '#fff' });
    }).catch(err => {
        Swal.fire("Erro ao salvar", err.message, "error");
    });
}

// ========================================================
// 6. RENDERIZAÇÃO DA TABELA
// ========================================================
function mostrarVips() {
    const tabela = document.getElementById('tabelaVips');
    if (!tabela || !vipsGlobais) return;
    tabela.innerHTML = '';
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    
    const wipeFiltro = document.getElementById('filtroWipe').value;
    const anoF = parseInt(document.getElementById('filtroAno').value);
    const busca = document.getElementById('buscaSteam').value.toUpperCase().trim();

    let totalSoma = 0, qtdVendas = 0, totalAno = 0, proximosVenc = 0;
    let planosContagem = {};

    // Determina o intervalo de datas
    let dataInicioFiltro = dataInicioWipe || "2000-01-01";
    let dataFimFiltro = "9999-12-31";

    if (wipeFiltro !== "atual") {
        const wAntigo = historicoWipes.find(w => w.inicio === wipeFiltro);
        if(wAntigo) {
            dataInicioFiltro = wAntigo.inicio;
            dataFimFiltro = wAntigo.fim;
        }
    }

    const vipsOrdenados = [...vipsGlobais].sort((a,b) => new Date(b.dataCompra) - new Date(a.dataCompra));

    vipsOrdenados.forEach(vip => {
        const dC = new Date(vip.dataCompra + 'T00:00:00');
        if (dC.getFullYear() === anoF) totalAno += (vip.valor || 0);

        let diff = -999;
        let vencFormatado = "ÚNICO";
        let statusBadge = `<span class="badge status-perm">PERMANENTE</span>`;
        let tempoBadge = `<span class="days-left days-perm">ITEM/KIT</span>`;
        let cellGlowClass = "";
        
        if (vip.duracao > 0 && vip.vencimento !== "-") {
            const dV = new Date(vip.vencimento + 'T12:00:00');
            diff = Math.ceil((dV - hoje) / (1000 * 60 * 60 * 24));
            vencFormatado = vip.vencimento.split('-').reverse().join('/');
            if (diff <= 3 && diff >= 0) cellGlowClass = "glow-red";
            statusBadge = `<span class="badge ${diff < 0 ? 'status-expired' : 'status-active'}">${diff < 0 ? 'VENCIDO' : 'ATIVO'}</span>`;
            const dClass = diff <= 3 ? 'days-red' : (diff <= 5 ? 'days-orange' : 'days-green');
            tempoBadge = `<span class="days-left ${dClass}">${diff < 0 ? 0 : diff} DIAS</span>`;
        }

        if (vip.pausado) {
            statusBadge = `<span class="badge status-paused">PAUSADO</span>`;
            tempoBadge = `<span class="days-left days-orange">${vip.diasRestantesAoPausar} DIAS</span>`;
            vencFormatado = "CONGELADO";
        }
        
        // --- LÓGICA DE EXIBIÇÃO ---
        let exibir = false;
        if (modoFiltroVencidos) {
            exibir = (vip.duracao > 0 && diff < 0 && !vip.pausado && !vip.baixado);
        } else if (busca !== "") {
            exibir = vip.nome.includes(busca);
        } else {
            exibir = (vip.dataCompra >= dataInicioFiltro && vip.dataCompra <= dataFimFiltro);
            if (mostrarApenasAtivos && diff < 0 && !vip.pausado) exibir = false;
        }

        if (exibir) {
            totalSoma += (vip.valor || 0);
            qtdVendas++;
            if (!vip.pausado && vip.duracao > 0 && diff >= 0 && diff <= 3) proximosVenc++;
            planosContagem[vip.tipoVip] = (planosContagem[vip.tipoVip] || 0) + 1;

            let btnBaixa = (diff < 0 && vip.duracao > 0 && !vip.pausado) ? (vip.baixado ? `<button class="btn-mini btn-baixa done">✅ OK</button>` : `<button class="btn-mini btn-baixa" onclick="darBaixa('${vip.id}')">BAIXA</button>`) : "";
            let btnPause = (vip.duracao > 0 && (diff >= 0 || vip.pausado)) ? (vip.pausado ? `<button class="btn-mini btn-baixa" onclick="retomarVip('${vip.id}')">▶ RETOMAR</button>` : `<button class="btn-mini btn-pause" onclick="pausarVip('${vip.id}', ${diff})">⏸ PAUSAR</button>`) : "";

            tabela.innerHTML += `
                <tr class="${vip.baixado ? 'row-baixa' : ''} ${vip.pausado ? 'row-paused' : ''}">
                    <td class="${cellGlowClass}">
                        <div class="steam-id-wrap"><strong>${vip.nome}</strong> <span class="vip-tag ${getVipClass(vip.tipoVip)}">${vip.tipoVip}</span></div>
                        <div style="font-size:0.75rem; color:var(--primary); font-weight: 600; margin-top:4px;">${vip.obs || 'SEM OBS.'}</div>
                    </td>
                    <td style="font-weight:700; color:var(--success)">R$ ${(vip.valor || 0).toFixed(2)}</td>
                    <td>${vip.dataCompra.split('-').reverse().join('/')}</td>
                    <td style="font-weight:700">${vencFormatado}</td>
                    <td>${statusBadge} ${tempoBadge}</td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            ${btnPause} ${btnBaixa}
                            <button class="btn-mini btn-edit" onclick="editarVip('${vip.id}')">EDITAR</button>
                            <button class="btn-mini btn-del" onclick="removerVip('${vip.id}')">DEL</button>
                        </div>
                    </td>
                </tr>`;
        }
    });

    // Atualiza Resumos
    const planoPop = Object.keys(planosContagem).length > 0 ? Object.keys(planosContagem).reduce((a, b) => planosContagem[a] > planosContagem[b] ? a : b) : "-";
    document.getElementById('planoPopular').innerText = planoPop;
    document.getElementById('vencendoLogo').innerText = proximosVenc;
    document.getElementById('totalVendasMes').innerText = qtdVendas;
    document.getElementById('faturamentoMes').innerText = `R$ ${totalSoma.toFixed(2)}`;
    document.getElementById('resumoGeralHeader').innerText = `R$ ${totalAno.toFixed(2)}`;
}

// ========================================================
// 7. FUNÇÕES AUXILIARES
// ========================================================
function pausarVip(id, dias) { db.ref('vips/' + id).update({ pausado: true, diasRestantesAoPausar: dias }); }
function retomarVip(id) {
    const v = vipsGlobais.find(x => x.id == id);
    const hoje = new Date();
    let nV = new Date(); nV.setDate(hoje.getDate() + (v.diasRestantesAoPausar || 0));
    db.ref('vips/' + id).update({ pausado: false, vencimento: nV.toISOString().split('T')[0], dataCompra: hoje.toISOString().split('T')[0] });
}
function darBaixa(id) { db.ref('vips/' + id).update({ baixado: true }); }
function removerVip(id) { db.ref('vips/' + id).remove(); }

function editarVip(id) {
    const v = vipsGlobais.find(v => v.id == id);
    if(!v) return;
    document.getElementById('edit-id').value = v.id;
    document.getElementById('nome').value = v.nome === "S/ ID" ? "" : v.nome;
    document.getElementById('tipoVip').value = v.tipoVip;
    document.getElementById('dataCompra').value = v.dataCompra;
    document.getElementById('valor').value = v.valor;
    document.getElementById('duracao').value = v.duracao;
    document.getElementById('obs').value = v.obs;
    const btn = document.getElementById('btn-add');
    btn.innerText = "ALTERAR DADOS";
    btn.style.background = "#fbbf24";
}

function limparCampos() {
    ['edit-id', 'nome', 'valor', 'duracao', 'obs'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    const btn = document.getElementById('btn-add');
    if(btn) { btn.innerText = "LANÇAR REGISTRO"; btn.style.background = "var(--primary)"; }
    // CORREÇÃO: Formato ISO para o input date funcionar
    document.getElementById('dataCompra').value = new Date().toISOString().split('T')[0];
}
