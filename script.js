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
let dataInicioWipeAtivo = null;
let modoFiltroVencidos = false;

// ========================================================
// LOGIN E CONTROLE DE ACESSO
// ========================================================
auth.onAuthStateChanged(user => {
    document.getElementById('login-overlay').style.display = user ? 'none' : 'flex';
    document.getElementById('main-app').style.display = user ? 'block' : 'none';
    if (user) {
        carregarConfiguracoes();
        carregarDados();
        carregarLogs();
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
// LÓGICA DE WIPE (NOVO CICLO)
// ========================================================

// 1. CARREGA AS CONFIGURAÇÕES E O HISTÓRICO DE WIPES
function carregarConfiguracoes() {
    db.ref('configuracoes').on('value', snap => {
        const config = snap.val() || {};
        dataInicioWipeAtivo = config.ultimoWipe || new Date().toISOString().split('T')[0];
        document.getElementById('data-inicio-span').innerText = dataInicioWipeAtivo.split('-').reverse().join('/');
        
        // Atualiza o Select de Histórico
        const select = document.getElementById('filtroWipe');
        select.innerHTML = '<option value="atual">Ciclo Ativo (Agora)</option>';
        
        if (config.historicoWipes) {
            Object.values(config.historicoWipes).reverse().forEach(w => {
                select.innerHTML += `<option value="${w.inicio}">Wipe ${w.inicio.split('-').reverse().join('/')}</option>`;
            });
        }
        mostrarVips();
    });
}

// 2. FUNÇÃO DO BOTÃO "NOVO WIPE"
async function marcarNovoWipe() {
    const { value: confirmacao } = await Swal.fire({
        title: 'Iniciar Novo Wipe?',
        text: "Isso encerrará o ciclo atual e iniciará um novo a partir de hoje!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, Novo Wipe!',
        background: '#1a1f26',
        color: '#fff'
    });

    if (confirmacao) {
        const hoje = new Date().toISOString().split('T')[0];
        
        // Salva o wipe que está terminando no histórico
        const novoHistoricoRef = db.ref('configuracoes/historicoWipes').push();
        await novoHistoricoRef.set({ inicio: dataInicioWipeAtivo });

        // Atualiza a data do wipe ativo para hoje
        await db.ref('configuracoes/ultimoWipe').set(hoje);

        saveLog("SISTEMA", "INICIOU UM NOVO WIPE EM " + hoje);
        Swal.fire({ icon: 'success', title: 'Novo Ciclo Iniciado!', background: '#1a1f26', color: '#fff' });
    }
}

// ========================================================
// PROCESSAMENTO DE VIPS
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
        tipoVip, valor, dataCompra, duracao, 
        vencimento: vencimentoStr, 
        obs, baixado: false, pausado: false 
    };

    db.ref('vips/' + idRef).set(reg).then(() => {
        saveLog(idEdit ? "EDITOU" : "LANÇOU", reg.nome);
        limparCampos();
        Swal.fire({ icon: 'success', title: 'Salvo!', timer: 800, showConfirmButton: false, background: '#1a1f26', color: '#fff' });
    });
}

// ========================================================
// RENDERIZAÇÃO E CÁLCULOS
// ========================================================

function mostrarVips() {
    const tabela = document.getElementById('tabelaVips');
    const busca = document.getElementById('buscaSteam').value.toUpperCase().trim();
    const wipeFiltro = document.getElementById('filtroWipe').value;
    const anoFiltro = document.getElementById('filtroAno').value;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    
    tabela.innerHTML = '';
    let faturamentoCiclo = 0;
    let faturamentoAnual = 0;
    let vendasContador = 0;
    let vencendo3dias = 0;
    let totalVencidosSemBaixa = 0;

    // Primeiro, calcula o Faturamento Anual (independente de wipe)
    vipsGlobais.forEach(v => {
        if (v.dataCompra.startsWith(anoFiltro)) {
            faturamentoAnual += (v.valor || 0);
        }
    });

    // Filtra e exibe os VIPs na tabela
    vipsGlobais.forEach(vip => {
        const coincideBusca = (busca === "" || vip.nome.includes(busca) || vip.obs.includes(busca));
        
        // Lógica de filtro por Ciclo:
        // Se for "atual", pega da dataInicioWipeAtivo até o infinito.
        // Se for um wipe antigo, pega daquela data até o próximo wipe ou até a dataInicioWipeAtivo.
        let pertenceAoCiclo = false;
        if (wipeFiltro === "atual") {
            pertenceAoCiclo = (vip.dataCompra >= dataInicioWipeAtivo);
        } else {
            // Pega o próximo wipe no histórico para saber o limite final deste ciclo
            const select = document.getElementById('filtroWipe');
            const options = Array.from(select.options).map(o => o.value);
            const index = options.indexOf(wipeFiltro);
            const dataFimCiclo = options[index - 1] === "atual" ? dataInicioWipeAtivo : options[index - 1];
            
            pertenceAoCiclo = (vip.dataCompra >= wipeFiltro && vip.dataCompra < dataFimCiclo);
        }

        if (coincideBusca && pertenceAoCiclo) {
            faturamentoCiclo += (vip.valor || 0);
            vendasContador++;
            
            let diff = -999;
            if (vip.duracao > 0 && vip.vencimento !== "-") {
                const dV = new Date(vip.vencimento + 'T12:00:00');
                diff = Math.ceil((dV - hoje) / (1000 * 60 * 60 * 24));
            }

            if (diff >= 0 && diff <= 3 && !vip.pausado && vip.duracao > 0) vencendo3dias++;
            if (diff < 0 && !vip.baixado && vip.duracao > 0) totalVencidosSemBaixa++;
            if (modoFiltroVencidos && (diff >= 0 || vip.baixado)) return;

            let glowClass = "";
            let statusBadge = "";
            let tempoBadge = "";

            if (vip.pausado) {
                statusBadge = `<span class="badge status-paused">PAUSADO</span>`;
                tempoBadge = `<span class="days-left days-orange">CONGELADO</span>`;
            } else if (vip.tipoVip === "OUTROS" && vip.duracao === 0) {
                statusBadge = `<span class="badge" style="background: var(--primary); color: #000;">ITEM / PONTOS</span>`;
                tempoBadge = `<span class="days-left days-perm">ENTREGUE</span>`;
            } else if (vip.duracao === 0) {
                statusBadge = `<span class="badge status-perm">PERMANENTE</span>`;
                tempoBadge = `<span class="days-left days-perm">INFINITO</span>`;
            } else {
                if (diff < 0) {
                    statusBadge = `<span class="badge status-expired">VENCIDO</span>`;
                    tempoBadge = `<span class="days-left days-red">0 DIAS</span>`;
                    glowClass = "glow-red";
                } else if (diff <= 3) {
                    statusBadge = `<span class="badge status-active">ATIVO</span>`;
                    tempoBadge = `<span class="days-left days-red">${diff} DIAS</span>`;
                    glowClass = "glow-red";
                } else if (diff <= 5) {
                    statusBadge = `<span class="badge status-active">ATIVO</span>`;
                    tempoBadge = `<span class="days-left days-orange">${diff} DIAS</span>`;
                    glowClass = "glow-orange";
                } else {
                    statusBadge = `<span class="badge status-active">ATIVO</span>`;
                    tempoBadge = `<span class="days-left days-green">${diff} DIAS</span>`;
                }
            }

            tabela.innerHTML += `
                <tr class="${vip.baixado ? 'row-baixa' : ''} ${vip.pausado ? 'row-paused' : ''}">
                    <td class="steam-id-wrap ${glowClass}">
                        <div style="font-weight:800; color:var(--text-main);">${vip.nome}</div>
                        <div style="margin-top:6px; display: flex; flex-wrap: wrap; gap: 5px;">
                            <span class="vip-tag ${getVipClass(vip.tipoVip)}">${vip.tipoVip}</span>
                            ${vip.obs ? `<span style="font-size:0.7rem; color:var(--warning); background:rgba(251,191,36,0.1); padding:2px 6px; border-radius:4px; border:1px solid rgba(251,191,36,0.2);">Obs: ${vip.obs}</span>` : ''}
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

    // Atualiza Painéis
    document.getElementById('faturamentoMes').innerText = `R$ ${faturamentoCiclo.toFixed(2)}`;
    document.getElementById('resumoGeralHeader').innerText = `R$ ${faturamentoAnual.toFixed(2)}`;
    document.getElementById('totalVendasMes').innerText = vendasContador;
    document.getElementById('vencendoLogo').innerText = vencendo3dias;
    
    const b = document.getElementById('badge-vencidos');
    b.innerText = totalVencidosSemBaixa;
    b.style.display = totalVencidosSemBaixa > 0 ? 'block' : 'none';
}

// ========================================================
// AUXILIARES E DATABASE
// ========================================================

function getVipClass(tipo) {
    const t = tipo?.toUpperCase() || '';
    if (t.includes('ELITE')) return 'tag-elite';
    if (t.includes('IMPERADOR')) return 'tag-imperador';
    if (t.includes('LENDÁRIO')) return 'tag-lendario';
    if (t.includes('EXTREME')) return 'tag-extreme';
    if (t.includes('SUPREMO')) return 'tag-supremo';
    return 'tag-unloked';
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
        const d = document.getElementById('logDisplay');
        d.innerHTML = "";
        snap.forEach(c => {
            const l = c.val();
            d.innerHTML = `<div>[${l.timestamp}] ${l.acao}: ${l.detalhe}</div>` + d.innerHTML;
        });
    });
}

function saveLog(acao, detalhe) {
    if(auth.currentUser) db.ref('logs').push({ user: auth.currentUser.email, acao, detalhe, timestamp: new Date().toLocaleString() });
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
    ['edit-id', 'nome', 'valor', 'duracao', 'obs'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('btn-add').innerText = "LANÇAR REGISTRO";
    document.getElementById('btn-add').style.background = "var(--primary)";
}

function filtrarVencidos() { modoFiltroVencidos = !modoFiltroVencidos; mostrarVips(); }

// Coloque isso no final do seu script.js
window.onload = () => {
    // Define o ano atual no filtro automaticamente
    const anoAtual = new Date().getFullYear();
    const filtroAno = document.getElementById('filtroAno');
    if(filtroAno) filtroAno.value = anoAtual;
    
    // Atualiza a data no cabeçalho
    const dataHeader = document.getElementById('data-atual');
    if(dataHeader) dataHeader.innerText = new Date().toLocaleDateString('pt-br', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

let faturamentoAnual = 0;
const anoSelecionado = document.getElementById('filtroAno').value;

vipsGlobais.forEach(v => {
    // Se o VIP foi comprado no ano selecionado, soma no anual
    if (v.dataCompra && v.dataCompra.startsWith(anoSelecionado)) {
        faturamentoAnual += parseFloat(v.valor || 0);
    }
});
// Exibe no card de Receita Anual
document.getElementById('resumoGeralHeader').innerText = `R$ ${faturamentoAnual.toFixed(2)}`;
