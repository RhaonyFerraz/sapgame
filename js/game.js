// SAP Game - Logic Core
window.onerror = function(msg, url, lineNo, colNo, error) {
    alert("ERRO GLOBAL: " + msg + "\nLinha: " + lineNo + "\nArquivo: " + url);
    return false;
};

const GRAVITY_IMAGES = [
    "cenario1/01.png",
    "cenario1/02.png",
    "cenario1/03.png",
    "cenario1/04.png",
    "cenario1/05.png",
    "cenario1/06.png",
    "cenario1/07.png",
    "cenario1/08.png",
    "cenario1/09.png",
    "cenario1/10.png",
    "cenario1/11.png"
];

let currentLang = 'pt';
try {
    currentLang = localStorage.getItem('sap-game-lang') || 'pt';
} catch(e) { console.warn("localStorage inacessível"); }

const DIFFICULTY = {
    NORMAL: {
        initialMoney: 800,
        rewards: { correct: 150, wrong: -100 },
        expensesCycle: 4,
        expensesAmount: 540,
    }
};

const state = {
    language: currentLang,
    pos: 1,
    money: DIFFICULTY.NORMAL.initialMoney, // Capital inicial rebalanceado
    statement: [], // Histórico de transações (Extrato)
    difficulty: 'NORMAL',
    level: 1, // 1: Pequena, 2: Média, 3: Grande
    consultants: 0,
    questions: [],
    currentQuestion: null,
    millerRewardGiven: false,
    lastFreeInvestTurn: 0,
    
    // NOVO: Rastreamento de métricas
    stats: {
        correctAnswers: 0,
        wrongAnswers: 0,
        totalEventsDamage: 0,
        totalEventsGains: 0,
        investmentsMade: 0
    },

    bank: {
        loans: [],
        investments: [],
        creditLimit: 3000,
        isDefaulting: false, // Bloqueio de novos créditos
        autoDebit: false,
        consortiums: []
    },
    emails: [], // Caixa de Entrada
    emailOutbox: [], // Caixa de Saída
    emailTrash: [], // Lixeira
    currentEmailFolder: 'inbox',
    emailTaskActive: false, // Novo: Alerta de tarefa/novidade
    machineryTaskSeen: false, // Novo: Bloqueia o piscar após selecionado
    machineryEmailSentRound: null, // Rodada em que o e-mail de máquinas foi enviado
    machineryEmailReplied: false, // Se a resposta automática já foi entregue
    machineryReplySeen: false, // Se o player já leu a resposta "oii"
    bonusPoints: 0, // Pontos de Brinde acumulados
    upgrades: {
        infra: 0,
        machines: 0,
        training: 0,
        marketing: 0,
        logistics: 0,
        consultants: 0
    },
    inventory: {
        warehouse: 5000,
        machinery: 0,
        packaging: 800,
        rawMaterials: 0,
        finishedGoods: 780,
        fleet: 0
    },
    expensePenalty: 0,
    expensePaid: false,
    expenses: {
        employees: 200,
        accounting: 80,
        electricity: 150,
        water: 60,
        internet: 50
    },
    bgIndex: 0,
    isRenting: false,
    consecutiveWrong: 0,
    pendingBlitz: false,
    blitzDebt: 0,
    rentCounter: 0,
    rentType: null, // 'auto' ou 'manual'
    finance: {
        payables: [],
        receivables: [],
        nextId: 1
    },
    tickerManuallyCollapsed: false,
    emailNotificationPending: false,
    expensesOverdue: false,
    expenseOverdueRounds: 0,
    strikePenaltyPending: false,
    emailAlertRounds: 0
};

function updateMoney(amount, reasonKey) {
    amount = Number(amount);
    if (isNaN(amount) || amount === 0) return;
    
    state.money += amount;
    
    // Identificar tipo (entrada ou saída) e gravar no extrato
    state.statement.unshift({
        turn: state.pos,
        amount: amount,
        reason: t(reasonKey) || reasonKey,
        balance: state.money,
        type: amount > 0 ? 'income' : 'expense'
    });
    
    // Auto-update HUD on every money change
    updateHUD();
    
    // Manter apenas as últimas 100 transações
    if (state.statement.length > 100) {
        state.statement.pop();
    }

    // Auto-Pawn Mechanism (Recuperação Judicial Automática)
    const invTotal = state.inventory.warehouse + state.inventory.machinery + 
                     state.inventory.packaging + state.inventory.rawMaterials + 
                     state.inventory.finishedGoods + state.inventory.fleet;
                     
    if (invTotal > 0 && state.money <= -(invTotal * 0.05)) {
        setTimeout(() => triggerAutoPawn(invTotal), 150); // Delay curto para o JS terminar chamadas locais
    }
}

window.triggerFloatingMoney = function(amount, sourceElement, type = 'correct') {
    if (!sourceElement || !UI.money) return;

    // Pega as posições
    const rect = sourceElement.getBoundingClientRect();
    const targetRect = UI.money.getBoundingClientRect();

    // Cria o elemento flutuante
    const floatEl = document.createElement('div');
    floatEl.className = `money-flutuante ${type}`;
    floatEl.innerText = amount >= 0 ? `+$${amount}` : `-$${Math.abs(amount)}`;
    
    // Posição inicial (centro do botão)
    floatEl.style.left = (rect.left + rect.width / 2) + 'px';
    floatEl.style.top = (rect.top + rect.height / 2) + 'px';
    floatEl.style.transform = 'translate(-50%, -50%)';
    floatEl.style.opacity = '0';

    document.body.appendChild(floatEl);

    // Inicia animação
    requestAnimationFrame(() => {
        floatEl.style.opacity = '1';
        floatEl.style.transform = 'translate(-50%, -100%) scale(1.5)';
        
        setTimeout(() => {
            floatEl.style.left = (targetRect.left + targetRect.width / 2) + 'px';
            floatEl.style.top = (targetRect.top + targetRect.height / 2) + 'px';
            floatEl.style.transform = 'translate(-50%, -50%) scale(0.5)';
            floatEl.style.opacity = '0.5';
            
            setTimeout(() => {
                if (floatEl.parentNode) floatEl.parentNode.removeChild(floatEl);
                // Pulso no saldo do HUD
                const pulseClass = type === 'correct' ? 'money-pulse' : 'money-pulse-red';
                UI.money.classList.add(pulseClass);
                setTimeout(() => UI.money.classList.remove(pulseClass), 500);
            }, 1200);
        }, 300);
    });
};

function triggerAutoPawn(total) {
    if (total <= 0) return;
    
    // Zera o inventario ANTES de chamar updateMoney para evitar loops no gatilho interno
    state.inventory.warehouse = 0;
    state.inventory.machinery = 0;
    state.inventory.packaging = 0;
    state.inventory.rawMaterials = 0;
    state.inventory.finishedGoods = 0;
    state.inventory.fleet = 0;
    
    // Ativa status de inquilino eterno do Banco
    state.isRenting = true;
    state.rentCounter = 0;
    state.rentType = 'auto';
    
    const liquidationValue = Math.floor(total * 0.5);
    updateMoney(liquidationValue, "extrato_inventory_pawn");
    
    if (typeof updateInventoryUI === 'function') updateInventoryUI();
    if (typeof updateHUD === 'function') updateHUD();
    
    alert(t("alert_auto_pawn", { amount: liquidationValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }));
}

// --- Start Screen Logic (Promoted for priority) ---
let hasStarted = false;
const startJourney = (e) => {
    console.log("startJourney acionado!", e ? e.type : 'manual');
    if (hasStarted) return;
    hasStarted = true;
    if (e && e.type === 'touchstart') e.preventDefault();
    
    try {
        if (typeof initAudio === 'function') initAudio();
    } catch(err) {
        console.warn('Audio unlock blocked', err);
    }
    
    // Sound removed as requested
    
    const splash = document.getElementById('splash-screen');
    const reveal = document.getElementById('start-reveal-overlay');
    const rText = document.getElementById('reveal-text-container');
    const rImg = document.getElementById('reveal-image');
    const rImg2 = document.getElementById('reveal-image-2');
    
    if (reveal && rText && rImg) {
        console.log("Iniciando sequência de introdução...");
        // Phase 1: mens3.png + text
        reveal.classList.remove('hidden');
        rImg.classList.remove('hidden');
        rText.classList.remove('hidden');
        
        // Início do fade in
        setTimeout(() => {
            reveal.style.opacity = '1';
            rImg.style.opacity = '1';
            rText.style.opacity = '1';
        }, 50);
        
        // FASE DE TRANSIÇÃO: A imagem começa a sumir ANTES do texto (3s)
        setTimeout(() => {
            console.log("Imagem 1 começando a sumir (antes do texto)...");
            rImg.style.opacity = '0';
        }, 3000);

        // O texto começa a sumir no tempo original (4s)
        setTimeout(() => {
            console.log("Texto começando a sumir...");
            rText.style.opacity = '0';
            
            setTimeout(() => {
                rText.classList.add('hidden');

                // Encurtado o tempo de espera da Imagem 2 para agilizar
                setTimeout(() => {
                    // Fase 3: Troca para mens.png
                    if (rImg2) {
                        rImg2.classList.remove('hidden');
                        rImg2.style.opacity = '1';
                    }

                    setTimeout(() => {
                        // Fase 4: Fade out final
                        reveal.style.opacity = '0';
                        if (splash) splash.style.opacity = '0';

                        setTimeout(() => {
                            reveal.classList.add('hidden');
                            reveal.style.pointerEvents = 'none';
                            if (splash) {
                                splash.style.display = 'none';
                                splash.style.pointerEvents = 'none';
                            }
                            initGame();
                            initTicker();
                        }, 800);
                    }, 2000); // mens.png agora apenas por 2s para fluidez
                }, 1000); // Reduzido o tempo de espera "sozinho" da primeira fase
            }, 800);
        }, 4000);
    } else {
        // Fallback
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.style.display = 'none';
                initGame();
                initTicker();
            }, 500);
        } else {
            initGame();
            initTicker();
        }
    }
};
// Bind to window for onclick fallback
window.startJourney = startJourney;

window.skipIntro = () => {
    console.log("skipIntro: Pulo acionado pelo usuário.");
    if (window.gameInitialized) return;
    
    // Esconde todos os elementos de intro imediatamente
    const ids = ['splash-screen', 'start-reveal-overlay', 'title-intro'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            el.classList.add('hidden');
        }
    });
    
    // Inicia o jogo sem delay
    initGame();
    initTicker();
};

// Attach listeners immediately
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) {
        ['click', 'touchstart'].forEach(evt => {
            startBtn.addEventListener(evt, startJourney, { passive: false });
        });
    }
});

const GAME_CONFIG = {
    NORMAL: {
        correctBaseReward: 150,
        wrongBasePenalty: 100,
        expensesBase: 540,
        passiveRevenue: {
            infra: 0,
            machines: 0,
            training: 0,
            marketing: 0,
            logistics: 0,
            consultants: 0
        },
        upgradeCosts: {
            infra: [
                500, 600, 720, 864, 1037, 1244, 1493, 1792, 2150, 2580,
                3096, 3715, 4458, 5350, 6420, 7704, 9245, 11094, 13313, 15975,
                19170, 23004, 27605, 33126, 39751, 47701, 57241, 68689, 82427, 98912
            ],
            machines: [
                800, 960, 1152, 1382, 1658, 1990, 2388, 2866, 3439, 4127,
                4952, 5942, 7131, 8557, 10268, 12322, 14786, 17743, 21292, 25550,
                30660, 36792, 44150, 52980, 63576, 76291, 91549, 109859, 131831, 158197
            ],
            training: [
                400, 480, 576, 691, 829, 995, 1194, 1433, 1720, 2064, 
                2477, 2972, 3566, 4279, 5135, 6162, 7394, 8873, 10648, 12778, 
                15334, 18401, 22081, 26497, 31796, 38155, 45786, 54943, 65932, 79118
            ],
            marketing: [
                600, 720, 864, 1037, 1244, 1493, 1792, 2150, 2580, 3096,
                3715, 4458, 5350, 6420, 7704, 9245, 11094, 13313, 15975, 19170,
                23004, 27605, 33126, 39751, 47701, 57241, 68689, 82427, 98912, 118694
            ],
            consultants: [
                500, 590, 696, 821, 969, 1144, 1349, 1592, 1879, 2217,
                2616, 3087, 3643, 4299, 5073, 5986, 7063, 8334, 9835, 11605,
                13694, 16159, 19067, 22500, 26550, 31329, 36968, 43622, 51474, 60739
            ],
            logistics: [
                700, 840, 1008, 1210, 1452, 1742, 2090, 2508, 3010, 3612,
                4334, 5201, 6241, 7489, 8987, 10784, 12941, 15529, 18635, 22362,
                26834, 32201, 38641, 46369, 55643, 66772, 80126, 96151, 115381, 138457
            ]
        },
        eventProbabilityBase: 0.15
    }
};

const STRATEGIC_DATA = {
    infra: { name: "Infraestrutura", baseCost: 500, costMult: 1.5, revenue: 100 },
    machines: { name: "Máquinas", baseCost: 800, costMult: 1.6, revenue: 180 },
    training: { name: "Treinamento", baseCost: 400, costMult: 1.4, revenue: 70 },
    marketing: { name: "Propaganda", baseCost: 600, costMult: 1.5, revenue: 120 },
    logistics: { name: "Logística", baseCost: 700, costMult: 1.5, revenue: 140 },
    consultants: { name: "Consultores", baseCost: 500, costMult: 1.5, revenue: 0 }
};

let UI = {};

function updateUIReferences() {
    UI = {
        money: document.getElementById('money'),
        level: document.getElementById('level'),
        consultants: document.getElementById('consultants'),
        consultantsModal: document.getElementById('consultants-modal'),
        btnBuy: null, // Removido botão antigo de compra
        board: document.getElementById('board-container'),
        modal: document.getElementById('modal'),
        mTitle: document.getElementById('modal-title'),
        mText: document.getElementById('modal-text'),
        mOptions: document.getElementById('modal-options'),
        mFeedback: document.getElementById('modal-feedback'),
        mAction: document.getElementById('modal-action-btn'),
        mBtnBonus: document.getElementById('mBtnBonus'),
        mBtnReveal: document.getElementById('btn-reveal'),
        mImage: document.getElementById('modal-image'),
        mBtnNo: document.getElementById('modal-no-btn'),
        
        // Bank UI
        bankModal: document.getElementById('bank-modal'),
        btnOpenBank: document.getElementById('btn-open-bank'),
        btnCloseBank: document.getElementById('btn-close-bank'),
        bankTabs: document.querySelectorAll('.bank-tab'),
        bankPanels: document.querySelectorAll('.bank-panel'),
        
        // Extrato UI
        extratoModal: document.getElementById('extrato-modal'),
        btnOpenExtrato: document.getElementById('btn-bank-extrato'),
        btnCloseExtrato: document.getElementById('btn-close-extrato'),
        extratoList: document.getElementById('extrato-list'),
        loanAmount: document.getElementById('loan-amount'),
        investAmount: document.getElementById('invest-amount'),
        investDuration: document.getElementById('invest-duration'),
        btnConfirmLoan: document.getElementById('btn-confirm-loan'),
        btnConfirmInvest: document.getElementById('btn-confirm-invest'),
        
        // Strategic Investments UI
        investModal: document.getElementById('invest-modal'),
        btnOpenInvest: document.getElementById('btn-open-invest'),
        btnCloseInvest: document.getElementById('btn-close-invest'),
        
        // Financeiro UI
        financeModal: document.getElementById('finance-modal'),
        btnOpenFinance: document.getElementById('btn-open-finance'),
        btnCloseFinance: document.getElementById('btn-close-finance'),
        ficheiroTabs: document.querySelectorAll('.ficheiro-tab'),
        ficheiroPanels: document.querySelectorAll('.ficheiro-panel'),
        ficheiroContent: document.querySelector('.ficheiro-content'),
        
        // Inventory UI
        inventoryModal: document.getElementById('inventory-modal'),
        btnOpenInventory: document.getElementById('btn-open-inventory'),
        btnCloseInventory: document.getElementById('btn-close-inventory'),
        btnPawnInventory: document.getElementById('btn-pawn-inventory'),
        btnPatrimonialAgreement: document.getElementById('btn-patrimonial-agreement'),
        
        // Expenses UI
        expensesModal: document.getElementById('expenses-modal'),
        btnOpenExpenses: document.getElementById('btn-open-expenses'),
        btnCloseExpenses: document.getElementById('btn-close-expenses'),
        
        // Stats elements
        invWarehouse: document.getElementById('inv-warehouse'),
        invMachinery: document.getElementById('inv-machinery'),
        invPackaging: document.getElementById('inv-packaging'),
        invRawMaterials: document.getElementById('inv-raw-materials'),
        invFinishedGoods: document.getElementById('inv-finished-goods'),
        invFleet: document.getElementById('inv-fleet'),
        invTotal: document.getElementById('inv-total'),

        expEmployees: document.getElementById('exp-employees'),
        expAccounting: document.getElementById('exp-accounting'),
        expElectricity: document.getElementById('exp-electricity'),
        expWater: document.getElementById('exp-water'),
        expInternet: document.getElementById('exp-internet'),
        expLoans: document.getElementById('exp-loans'),
        expInfraDiscount: document.getElementById('exp-infra-discount'),
        expPenalty: document.getElementById('exp-penalty'),
        expTotal: document.getElementById('exp-total'),
        expenseDecisionBox: document.getElementById('expense-decision-box'),
        btnPayNow: document.getElementById('btn-pay-now'),
        btnPayLater: document.getElementById('btn-pay-later'),
        
        // Emails
        emailModal: document.getElementById('email-modal'),
        emailList: document.getElementById('email-list'),
        btnOpenEmail: document.getElementById('btn-open-email'),

        // New Pill HUD elements
        hudHeader: document.getElementById('hud-header'),
        btnLangToggle: document.getElementById('btn-lang-toggle'),
        btnStartTurn: document.getElementById('btn-start-turn')
    };
}

// --- Localization Core ---

function t(key, params = {}) {
    let str = translations[state.language][key] || key;
    Object.keys(params).forEach(p => {
        str = str.replace(`{${p}}`, params[p]);
    });
    return str;
}

function updateLanguageUI() {
    // Standard data-t elements
    document.querySelectorAll('[data-t]').forEach(el => {
        el.innerText = t(el.dataset.t);
    });

    // Special data-t-title elements
    document.querySelectorAll('[data-t-title]').forEach(el => {
        el.title = t(el.dataset.t_title); // Wait, DOM dataset uses camelCase if it has hyphens, but data-t-title should be tTitle or t-title.
        // Better: el.getAttribute('data-t-title')
        el.title = t(el.getAttribute('data-t-title'));
    });

    // Language toggle button (ícone único agora)
    if (UI.btnLangToggle) {
        const flagImg = UI.btnLangToggle.querySelector('img');
        if (flagImg) {
            flagImg.src = state.language === 'en' ? "faviconsmenu/portuguese.png" : "faviconsmenu/english-language.png";
        }
    }

    // Update level display which is dynamic
    updateHUD();

    // Update Strategic UI if open
    if (!UI.investModal.classList.contains('hidden')) updateInvestUI();
}

async function changeLanguage(lang) {
    state.language = lang;
    localStorage.setItem('sap-game-lang', lang);
    await loadQuestions(lang);
    state.questions = [...questionsList]; // Refresh current pool
    console.log(`Language changed to ${lang}. Questions in pool: ${state.questions.length}`);
    updateLanguageUI();

    // If a question is active, refresh it
    if (!UI.modal.classList.contains('hidden') && state.currentQuestion) {
        // Find the translated version of the same question
        const sameQ = state.questions.find(q => q.id === state.currentQuestion.id);
        if (sameQ) {
            state.currentQuestion = sameQ;
            // Re-render modal content
            askQuestion(true); // pass true to skip re-picking
        }
    }
}

function toggleLanguage() {
    const nextLang = state.language === 'pt' ? 'en' : 'pt';
    changeLanguage(nextLang);
}

async function initGame() {
    if (window.gameInitialized) return;
    window.gameInitialized = true;
    
    console.log("initGame: INICIANDO...");
    updateUIReferences();
    if (UI.hudHeader) UI.hudHeader.classList.remove('hidden');
    console.log("initGame: Referências UI atualizadas.");

    // Automatic background slideshow removed as per user request (Rotation now happens on correct answer)
    /*
    try {
        if (!window.bgInterval) {
            window.bgInterval = setInterval(() => {
                if (typeof GRAVITY_IMAGES !== 'undefined' && GRAVITY_IMAGES.length > 0) {
                    state.bgIndex = (state.bgIndex + 1) % GRAVITY_IMAGES.length;
                    updateBackgroundImage();
                }
            }, 20000);
            console.log("initGame: Slideshow de fundo iniciado (20s).");
        }
    } catch(e) { console.warn("Erro no slideshow:", e); }
    */

    try {
        console.log(`initGame: Carregando perguntas para idioma: ${state.language}`);
        await loadQuestions(state.language);
        state.questions = [...questionsList];
        console.log(`initGame: ${state.questions.length} perguntas carregadas.`);
    } catch(e) {
        console.error("initGame ERROR ao carregar perguntas:", e);
    }

    try {
        console.log("initGame: Renderizando tabuleiro e HUD inicial...");
        renderBoard();
        updateHUD();
    } catch(e) {
        console.error("initGame ERROR ao renderizar tabuleiro/HUD:", e);
    }
    
    // Binding events safely
    console.log("initGame: Vinculando eventos...");
    if (UI.mAction) UI.mAction.addEventListener('click', closeModal);
    if (UI.btnBuy) UI.btnBuy.addEventListener('click', buyConsultant);
    
    // Bank events
    if (UI.btnCloseBank) UI.btnCloseBank.addEventListener('click', closeBank);
    UI.bankTabs.forEach(tab => tab.addEventListener('click', () => switchBankTab(tab.dataset.tab)));
    
    if (UI.loanAmount) UI.loanAmount.addEventListener('input', updateLoanPreview);
    document.querySelectorAll('input[name="loan-installments"]').forEach(i => i.addEventListener('change', updateLoanPreview));
    
    if (UI.investAmount) UI.investAmount.addEventListener('input', updateInvestPreview);
    if (UI.investDuration) UI.investDuration.addEventListener('input', updateInvestPreview);
    
    if (UI.btnConfirmLoan) UI.btnConfirmLoan.addEventListener('click', confirmLoan);
    if (UI.btnConfirmInvest) UI.btnConfirmInvest.addEventListener('click', confirmInvest);
    
    // Consortium events
    const consAmount = document.getElementById('consortium-amount');
    if (consAmount) consAmount.addEventListener('input', updateConsortiumPreview);
    document.querySelectorAll('input[name="consortium-installments"]').forEach(i => {
        i.addEventListener('change', updateConsortiumPreview);
    });
    
    // Extrato events
    if (UI.btnCloseExtrato) UI.btnCloseExtrato.addEventListener('click', closeExtrato);
    
    // Strategic Invest events
    if (UI.btnCloseInvest) UI.btnCloseInvest.addEventListener('click', () => window.closeInvest());
    
    // Financeiro events
    if (UI.btnCloseFinance) UI.btnCloseFinance.addEventListener('click', () => window.closeFinance());
    
    // Email events

    if (UI.ficheiroTabs) {
        UI.ficheiroTabs.forEach(tab => {
            tab.addEventListener('click', () => switchFicheiroTab(tab.dataset.ficha));
        });
    }
    
    // Inventory events
    if (UI.btnCloseInventory) UI.btnCloseInventory.addEventListener('click', () => window.closeInventory());
    if (UI.btnPawnInventory) UI.btnPawnInventory.addEventListener('click', () => pawnInventory());
    if (UI.btnPatrimonialAgreement) UI.btnPatrimonialAgreement.addEventListener('click', () => performPatrimonialAgreement());
    
    // Expenses events
    if (UI.btnCloseExpenses) UI.btnCloseExpenses.addEventListener('click', () => window.closeExpenses());
    
    if (UI.btnPayNow) UI.btnPayNow.addEventListener('click', () => payExpensesNow());
    if (UI.btnPayLater) UI.btnPayLater.addEventListener('click', () => postponeExpenses());
    if (UI.btnStartTurn) UI.btnStartTurn.addEventListener('click', () => startTurn());

    // Apply translation on load
    updateLanguageUI();

    // Slideshow start moved to beginning of initGame
    
    console.log("initGame: CONCLUÍDO COM SUCESSO.");
}

function renderBoard() {
    // A interação agora é centralizada exclusivamente no botão START do HUD.
    // O tabuleiro circular/linear foi removido conforme solicitado.
    if (UI.board) UI.board.innerHTML = '';
}

function applyBlitzPenalty() {
    const penalty = 1000;
    
    // Reutiliza o modal já aberto — troca o conteúdo
    UI.mTitle.innerText = t("blitz_title");
    UI.mText.innerText = t("blitz_text");
    UI.mOptions.innerHTML = '';
    UI.mFeedback.innerHTML = '';
    UI.mFeedback.classList.add('hidden');
    if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
    if (UI.mBtnReveal) UI.mBtnReveal.classList.add('hidden');
    const btnRevealEn = document.getElementById('btn-reveal-en');
    if (btnRevealEn) btnRevealEn.classList.add('hidden');
    
    // Esconde o botão de ação padrão — usaremos botões custom
    UI.mAction.style.display = 'none';
    
    // Botão: PAGAR AGORA
    const btnPagar = document.createElement('button');
    btnPagar.className = 'option-btn';
    btnPagar.style.cssText = 'background: linear-gradient(135deg, #27ae60, #2ecc71); border: none; color: #fff; font-weight: bold; margin: 5px;';
    btnPagar.innerText = '💰 Pagar Agora (R$ 1.000)';
    btnPagar.onclick = () => {
        updateMoney(-penalty, "extrato_blitz_penalty");
        closeModal();
        updateHUD();
    };
    
    // Botão: PAGAR DEPOIS
    const btnDepois = document.createElement('button');
    btnDepois.className = 'option-btn';
    btnDepois.style.cssText = 'background: linear-gradient(135deg, #e74c3c, #c0392b); border: none; color: #fff; font-weight: bold; margin: 5px;';
    btnDepois.innerText = '⏳ Pagar Depois (+5% por rodada)';
    btnDepois.onclick = () => {
        // Integração com SISTEMA FINANCEIRO (Contas Vencidas)
        if (!state.finance) state.finance = { payables: [], receivables: [], nextId: 1 };
        const id = 'fin_' + (state.finance.nextId++);
        state.finance.payables.push({
            id: id,
            name: "Multa: Blitz Policial (Habilitação)",
            amount: penalty,
            turnsLeft: 0,
            late: true
        });
        console.log(`BLITZ: Multa movida para Contas Vencidas do Financeiro (ID: ${id})`);
        closeModal();
        updateHUD();
    };
    
    UI.mOptions.appendChild(btnPagar);
    UI.mOptions.appendChild(btnDepois);
    
    // Garante que o modal está visível
    UI.modal.classList.remove('hidden');
    forceScrollToTop();
}

// --- Ticker Bar Management ---

/**
 * Atualiza a visibilidade do letreiro (ticker) baseado no estado do jogo
 * @param {boolean} forceHide - Força a ocultação idependente de outros fatores
 */
function updateTickerVisibility(forceHide = false) {
    const tickerBar = document.getElementById('ticker-bar');
    const tickerBtn = document.getElementById('btn-toggle-ticker');
    if (!tickerBar) return;

    // Se forçado a esconder ou se o usuário colapsou manualmente
    if (forceHide || state.tickerManuallyCollapsed) {
        tickerBar.classList.add('collapsed');
        if (tickerBtn) tickerBtn.classList.remove('active-toggle');
    } else {
        // Mostra o letreiro
        tickerBar.classList.remove('collapsed');
        if (tickerBtn) tickerBtn.classList.add('active-toggle');
    }
}

/**
 * Função global para o botão do olho no HUD
 */
window.toggleTicker = function() {
    const tickerBar = document.getElementById('ticker-bar');
    if (!tickerBar) return;
    
    // Troca o estado manual
    state.tickerManuallyCollapsed = !tickerBar.classList.contains('collapsed');
    
    // Aplica a visibilidade
    updateTickerVisibility();
}

function updateHUD() {
    console.log("updateHUD: Atualizando interface...");
    if (!UI.money) { console.warn("updateHUD: UI.money não disponível"); return; }
    if (UI.money) {
        const isNegative = state.money < 0;
        const absVal = Math.abs(state.money).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        UI.money.innerText = (isNegative ? '-$ ' : '$ ') + absVal;
        UI.money.classList.toggle('negative-money', isNegative);

        // GATILHO DE FALÊNCIA: Negativo + Sem Bens (Inquilino)
        if (state.money < 0 && state.isRenting) {
            setTimeout(() => showGameOver(true), 500);
        }
    }

    if (UI.btnOpenInventory) {
        UI.btnOpenInventory.classList.toggle('liquidated', state.isRenting);
    }
    
    // Atualizar o texto do botão START com a QUESTÃO atual (state.pos)
    const startBtnText = UI.btnStartTurn ? UI.btnStartTurn.querySelector('[data-t="hud_start"]') : null;
    if (startBtnText) {
        startBtnText.innerText = t("hud_start", { level: state.pos.toString().padStart(2, '0') });
    }
    
    if (UI.btnOpenExpenses) {
        // Garantindo persistência: Se não houver a chave (saves antigos) ou for true
        // E checando se realmente não foi pago.
        let shouldPulse = (state.expensesOverdue === true || (!state.expensePaid && state.stats.correctAnswers > 0 && state.stats.correctAnswers % 5 === 0));
        
        // Se o débito automático estiver ok e tiver saldo, não precisa pulsar
        if (state.bank && state.bank.autoDebit && state.money >= calculateTotalExpenses()) {
            shouldPulse = false;
        }

        if (shouldPulse) {
            UI.btnOpenExpenses.classList.add('pulse-red');
        } else {
            UI.btnOpenExpenses.classList.remove('pulse-red');
        }
    }
    
    // Pulse effect for free investments (Every 5 rounds)
    if (UI.btnOpenInvest) {
        const isPromoRound = (state.pos > 0 && state.pos % 5 === 0);
        const promoAvailable = isPromoRound && (state.lastFreeInvestTurn !== state.pos);
        UI.btnOpenInvest.classList.toggle('pulse-gold', promoAvailable);
    }
    
    // Background Image
    updateBackgroundImage();
    
    // E-mail Task Notification
    if (UI.btnOpenEmail) {
        UI.btnOpenEmail.classList.toggle('pulse-gold', !!state.emailTaskActive);
    }
    
    // Limits
    if (UI.btnBuy) UI.btnBuy.disabled = state.money < 500 || state.consultants >= 2;
    
    // Novo: Limite de Empréstimo Dinâmico (70% do Inventário Total)
    const totalInv = calculateTotalInventory();
    state.bank.creditLimit = Math.floor(totalInv * 0.6);
    
    updateInventoryUI();
}

function calculateTotalInventory() {
    return (state.inventory.warehouse || 0) + 
           (state.inventory.machinery || 0) + 
           (state.inventory.packaging || 0) + 
           (state.inventory.rawMaterials || 0) + 
           (state.inventory.finishedGoods || 0) + 
           (state.inventory.fleet || 0);
}

function updateInventoryUI() {
    if (!UI.inventoryModal) return;
    
    if (UI.invWarehouse) UI.invWarehouse.innerText = state.inventory.warehouse.toLocaleString();
    if (UI.invMachinery) UI.invMachinery.innerText = state.inventory.machinery.toLocaleString();
    if (UI.invPackaging) UI.invPackaging.innerText = state.inventory.packaging.toLocaleString();
    if (UI.invRawMaterials) UI.invRawMaterials.innerText = state.inventory.rawMaterials.toLocaleString();
    if (UI.invFinishedGoods) UI.invFinishedGoods.innerText = state.inventory.finishedGoods.toLocaleString();
    if (UI.invFleet) UI.invFleet.innerText = state.inventory.fleet.toLocaleString();
    if (UI.investments) UI.investments.innerText = state.bonusPoints > 0 ? `⭐ ${state.bonusPoints}` : state.stats.investmentsMade;

    // Alerta visual de pontos de brinde no botão do menu
    const btnInvest = document.getElementById('btn-open-invest');
    if (btnInvest) {
        if (state.bonusPoints > 0) btnInvest.classList.add('blink-bonus');
        else btnInvest.classList.remove('blink-bonus');
    }
    
    const totalValue = calculateTotalInventory();
    if (UI.invTotal) UI.invTotal.innerText = totalValue.toLocaleString();

    // Toggle Acordo Patrimonial vs Penhorar
    if (UI.btnPatrimonialAgreement) {
        if (state.isRenting) {
            UI.btnPatrimonialAgreement.classList.remove('hidden');
            if (UI.btnPawnInventory) UI.btnPawnInventory.classList.add('hidden');
        } else {
            UI.btnPatrimonialAgreement.classList.add('hidden');
            if (UI.btnPawnInventory) UI.btnPawnInventory.classList.remove('hidden');
        }
    }
}

function pawnInventory() {
    const total = state.inventory.warehouse + 
                  state.inventory.machinery + 
                  state.inventory.packaging + 
                  state.inventory.rawMaterials + 
                  state.inventory.finishedGoods +
                  state.inventory.fleet;
                  
    if (total <= 0) {
        alert(t("alert_pawn_empty"));
        return;
    }
    
    const baseAssessment = 0.75;
    const consultantsBonus = (state.upgrades.consultants || 0) * 0.01;
    const assessment = baseAssessment + consultantsBonus;
    
    const liquidationValue = Math.floor(total * assessment);
    const amountStr = liquidationValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    
    if (confirm(t("pawn_confirm_msg", { amount: amountStr }))) {
        updateMoney(liquidationValue, "extrato_inventory_pawn");
        
        // Zera o inventario
        state.inventory.warehouse = 0;
        state.inventory.machinery = 0;
        state.inventory.packaging = 0;
        state.inventory.rawMaterials = 0;
        state.inventory.finishedGoods = 0;
        state.inventory.fleet = 0;
        
        // Ativa status de inquilino (ícone vermelho e ciclo de aluguel)
        state.isRenting = true;
        state.rentCounter = 0;
        state.rentType = 'manual';
        
        updateInventoryUI();
        updateHUD();
        alert(t("alert_pawn_success", { amount: liquidationValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }));
    }
}

function performPatrimonialAgreement() {
    if (!state.isRenting) return;

    if (state.money < 6000) {
        alert(t("alert_agreement_no_funds"));
        return;
    }

    if (confirm(t("msg_agreement_confirm"))) {
        updateMoney(-6000, "extrato_agreement");
        
        // Restaura a posse do Galpão
        state.inventory.warehouse = 5000;
        state.isRenting = false;
        state.rentCounter = 0;
        state.rentType = null;

        updateInventoryUI();
        updateHUD();
        alert(t("alert_agreement_success"));
    }
}

function calculateDynamicExpenses() {
    const baseLevel = state.level <= 10 ? 1 : (state.level <= 20 ? 2 : 3);
    const multiplier = baseLevel;

    const costs = {
        employees: 300 * multiplier,
        accounting: 100 * multiplier,
        electricity: 80 * multiplier,
        water: 30 * multiplier,
        internet: 30 * multiplier
    };

    // Reduções de Eficiência (Módulos Treinamento e Logística)
    const reductions = {
        accounting: state.upgrades.training * 20,
        electricity: state.upgrades.logistics * 15
    };

    // Subtotal antes do desconto de infraestrutura
    const subtotal = 
        costs.employees + 
        Math.max(10, costs.accounting - reductions.accounting) + 
        Math.max(10, costs.electricity - reductions.electricity) + 
        costs.water + 
        costs.internet;

    // Desconto de Infraestrutura (3% por nível)
    const infraDiscountPercent = (state.upgrades.infra || 0) * 0.03;
    const infraDiscountValue = Math.round(subtotal * infraDiscountPercent);
    const total = subtotal - infraDiscountValue;

    return { total, costs, reductions, infraDiscountValue, infraDiscountPercent };
}

function calculateTotalExpenses() {
    return calculateDynamicExpenses().total + state.expensePenalty;
}

function updateExpensesUI() {
    if (!UI.expensesModal) return;
    
    const dynamic = calculateDynamicExpenses();
    
    UI.expEmployees.innerText = dynamic.costs.employees.toLocaleString();
    
    const accFinal = Math.max(10, dynamic.costs.accounting - dynamic.reductions.accounting);
    UI.expAccounting.innerHTML = `${accFinal.toLocaleString()} <span style="font-size: 0.7rem; color: #2ecc71;">(-${dynamic.reductions.accounting} Tr.)</span>`;
    
    const elecFinal = Math.max(10, dynamic.costs.electricity - dynamic.reductions.electricity);
    UI.expElectricity.innerHTML = `${elecFinal.toLocaleString()} <span style="font-size: 0.7rem; color: #2ecc71;">(-${dynamic.reductions.electricity} Log.)</span>`;
    
    UI.expWater.innerText = dynamic.costs.water.toLocaleString();
    UI.expInternet.innerText = dynamic.costs.internet.toLocaleString();
    
    if (UI.expPenalty) UI.expPenalty.innerText = state.expensePenalty.toLocaleString();
    
    const total = calculateTotalExpenses();
    UI.expTotal.innerText = total.toLocaleString();

    if (UI.expInfraDiscount) {
        UI.expInfraDiscount.innerText = dynamic.infraDiscountValue.toLocaleString();
        const percentLabel = Math.round(dynamic.infraDiscountPercent * 100);
        UI.expInfraDiscount.parentElement.previousElementSibling.innerText = `Economia (Infra ${percentLabel}%)`;
    }

    // Show decision box if due (Every 4 rounds)
    if (UI.expenseDecisionBox) {
        if (state.pos >= 4 && !state.expensePaid) {
            UI.expenseDecisionBox.classList.remove('hidden');
        } else {
            UI.expenseDecisionBox.classList.add('hidden');
        }
    }
}

function updateBackgroundImage() {
    const imgUrl = GRAVITY_IMAGES[state.bgIndex];
    document.body.style.backgroundImage = `url('${imgUrl}')`;
}

window.isTurnProcessing = false;
window.startTurn = function(skipExpenseCheck = false) {
    if (window.isTurnProcessing) {
        console.warn("Bloqueio de duplo-clique: Turno já está sendo processado.");
        return;
    }

    // GATILHO DE GREVE: Se as despesas estiverem atrasadas há mais de 3 rodadas corrigidas
    if (state.expensesOverdue && state.expenseOverdueRounds >= 3) {
        state.strikePenaltyPending = true; // Marca que uma greve aconteceu para cobrar o prejuízo depois
        openModal("⚠️ PRODUÇÃO PARALISADA", "<b>Funcionários em greve por falta de pagamento.</b><br><br>Sua equipe cruzou os braços pelo atraso nas despesas operacionais. A produção só será retomada após a quitação dos débitos.<br><br>👉 Vá até <b>BANCO > DESPESAS</b> para regularizar a situação.");
        
        UI.mOptions.innerHTML = '';
        if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
        if (UI.mBtnReveal) UI.mBtnReveal.classList.add('hidden');
        UI.mFeedback.innerHTML = `❌ Operação bloqueada por inadimplência.`;
        UI.mFeedback.className = 'error';
        UI.mFeedback.classList.remove('hidden');

        UI.mAction.innerText = "ENTENDIDO";
        UI.mAction.onclick = () => { closeModal(); };
        UI.mAction.classList.remove('hidden');
        return;
    }
    window.isTurnProcessing = true;
    setTimeout(() => { window.isTurnProcessing = false; }, 1000); // Failsafe unlock após a renderização do modal

    // Tocar som agradável ao iniciar
    if (typeof playStartTurnSound === 'function') playStartTurnSound();

    // COBRANÇA DE PREJUÍZO PÓS-GREVE
    if (state.strikePenaltyPending) {
        state.strikePenaltyPending = false;
        updateMoney(-400, "extrato_strike_loss");
        updateHUD();
        openModal("📉 PREJUÍZO POR PARALIZAÇÃO", "Devido à greve dos funcionários e à paralização da fábrica, sua empresa teve custos fixos e perda de produtividade totalizando <b>R$ 400,00</b>.<br><br>Mantenha as contas em dia para evitar novas interrupções.");
        
        UI.mOptions.innerHTML = '';
        if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
        if (UI.mBtnReveal) UI.mBtnReveal.classList.add('hidden');
        UI.mFeedback.innerHTML = `💸 Prejuízo financeiro aplicado.`;
        UI.mFeedback.className = 'error';
        UI.mFeedback.classList.remove('hidden');

        UI.mAction.innerText = "CONTINUAR";
        UI.mAction.onclick = () => { closeModal(); startTurn(); }; // Reinicia o startTurn após o prejuízo
        UI.mAction.classList.remove('hidden');
        return;
    }

    console.log("startTurn: INICIANDO TURNO na casa", state.pos);
    
    // Fallback de perguntas
    if (!state.questions || state.questions.length === 0) {
        state.questions = [...questionsList];
    }

    // Mecânica de Aluguel (Pós-Liquidação)
    if (state.isRenting) {
        state.rentCounter++;
        if (state.rentCounter >= 3) {
            if (state.rentType === 'manual') {
                alert(t("alert_rent_pawn"));
                updateMoney(-700, "extrato_rent_paid_pawn");
            } else {
                alert(t("alert_rent_due"));
                updateMoney(-800, "extrato_rent_paid");
            }
            state.rentCounter = 0;
        }
    }
    
    // Bônus Especial: Fidelidade John Miller (Rodada 10/Casa 11)
    if (state.pos === 11 && state.surprise1Correct && state.surprise2Correct && !state.millerRewardGiven) {
        state.millerRewardGiven = true;
        updateMoney(3000, "extrato_miller_bonus");
        updateHUD();
        alert(t("alert_miller_reward"));
    }

    // Alerta de Rodada Promocional foi removido a pedido do utilizador
    // if (state.pos > 0 && state.pos % 5 === 0) {
    //     ...
    // }

    // Hide ticker when turn starts
    const tickerBar = document.getElementById('ticker-bar');
    const tickerBtn = document.getElementById('btn-toggle-ticker');
    if (tickerBar && !tickerBar.classList.contains('collapsed')) {
        tickerBar.classList.add('collapsed');
        if (tickerBtn) tickerBtn.classList.remove('active-toggle');
    }
    // If debt is due and NOT paid, apply penalty for the current round (Every 4 rounds)
    if (state.pos >= 4 && !state.expensePaid) {
        // NOVO: Juros Compostos de 15% em vez de +10 fixo
        const penaltyGrowth = state.expensePenalty === 0 ? 50 : Math.round(state.expensePenalty * 0.15);
        state.expensePenalty += penaltyGrowth;
        console.log(`Empresa operando com dívida (+${penaltyGrowth}): R$ ${state.expensePenalty}`);
    }

    // Disable clicks
    document.querySelectorAll('.space').forEach(s => s.onclick = null);
    
    // Process Bank logic BEFORE the turn starts (Loans and Investments maturing)
    try {
        console.log("startTurn: Processando Banco e Financeiro...");
        processBankTurn();
        processFinanceTurn();
    } catch(e) {
        console.error("startTurn ERROR no processamento financeiro:", e);
    }
    
    if (state.pos > 300) {
        showGameOver();
        return;
    }
    
    if (state.questions.length === 0) {
        state.questions = [...questionsList];
    }
    
    // TODOS OS EVENTOS CANCELADOS TEMPORARIAMENTE (Apenas perguntas)
    console.log("startTurn: Sorteando Pergunta (Eventos desativados)...");
    askQuestion();
}

function evaluateContextualEvents() {
    // 1. CASH CRISIS: Payday coming up and not enough money (Except on skip round 8)
    if (state.pos % 4 === 0 && state.pos !== 8 && state.money < calculateDynamicExpenses() && state.stats.correctAnswers >= 4) {
        return {
            title: "🚨 CRISE DE CAIXA",
            text: "O financeiro avisou que não temos saldo para as despesas! O banco providenciou um empréstimo de emergência com taxas altíssimas e peças foram liquidadas.",
            change: -400,
            tag: "CASH_CRISIS"
        };
    }
    
    // 2. SUPPLY CHAIN FAILURE: Advanced game but no logistics
    if (state.pos > 15 && state.upgrades.logistics === 0 && Math.random() < 0.5) {
        return {
            title: "🚛 COLAPSO LOGÍSTICO",
            text: "A demanda para nossos produtos aumentou exponencialmente, mas não investimos em Logística. As mercadorias não chegaram aos clientes!",
            change: -400,
            tag: "SUPPLY_CHAIN_FAILURE"
        };
    }
    
    // 3. TECH DEBT: Imbalanced tech stack (Machines >> Infra)
    if (state.upgrades.machines >= 3 && state.upgrades.infra < 2 && Math.random() < 0.6) {
        return {
            title: "💻 QUEDA NO SERVIDOR",
            text: "Compramos máquinas avançadas, mas a Infraestrutura de TI não suportou o processamento do SAP HANA e os sistemas caíram. Produção parada!",
            change: -500,
            tag: "TECH_DEBT"
        };
    }
    
    // 4. VIRAL BOOST: Good marketing paying off
    if (state.upgrades.marketing >= 2 && Math.random() < 0.3) {
        return {
            title: "📈 VIRALIZOU!",
            text: "Sua campanha de Propaganda e o engajamento online bateram recordes! Influxo massivo de novos clientes nesta rodada.",
            change: 800,
            tag: "VIRAL_BOOST"
        };
    }

    return null;
}

function triggerEvent() {
    // Try contextual event first
    let ctxEvent = evaluateContextualEvents();
    
    if (ctxEvent) {
        let finalChange = ctxEvent.change;
        if (finalChange > 0) {
            const mktBonus = (state.upgrades.marketing || 0) * 20;
            if (mktBonus > 0) {
                finalChange += mktBonus;
                ctxEvent.text += `<br><br><strong style="color: #2ecc71;">📈 Bônus Propaganda: + R$ ${mktBonus}</strong>`;
            }
        }

        updateMoney(finalChange, ctxEvent.title || "extrato_event");
        if (finalChange < 0) state.stats.totalEventsDamage += Math.abs(finalChange);
        else state.stats.totalEventsGains += finalChange;

        openModal(ctxEvent.title, ctxEvent.text);
        UI.mOptions.innerHTML = '';
        if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
        if (UI.mBtnReveal) UI.mBtnReveal.classList.add('hidden');
        UI.mFeedback.innerHTML = ctxEvent.change > 0 ? `+ R$ ${ctxEvent.change} 💰` : `- R$ ${Math.abs(ctxEvent.change)} 💸`;
        UI.mFeedback.className = ctxEvent.change > 0 ? 'success' : 'error';
        UI.mFeedback.classList.remove('hidden');
    } else {
        // Fallback to purely random generic events
        let events = [
            { change: -200, key: "event_stock_fail" },
            { change: -100, key: "event_supplier_delay" }
        ];
        
        // Evento de crise de mercado estrangeiro (Só após rodada 5)
        if (state.pos > 5) {
            events.push({ change: -300, key: "event_market_crisis" });
        }
        
        // Bonus de propaganda (limite de 3 por jogo)
        if (!state.eventMarketingCount) state.eventMarketingCount = 0;
        if (state.upgrades && state.upgrades.marketing > 0 && state.eventMarketingCount < 3) {
            events.push({ change: 500, key: "event_sap_bonus" });
        }

        // Bonus de logística só aparece se a empresa investiu em logística
        if (state.upgrades && state.upgrades.logistics > 0) {
            events.push({ change: 400, key: "event_logistics_win" });
        }
        const ev = events[Math.floor(Math.random() * events.length)];
        
        if (ev.key === "event_sap_bonus") {
            state.eventMarketingCount++;
        }
        
        let feedbackHTML = "";
        let evName = t(ev.key) || ev.key;
        if (ev.change < 0) {
            addPayable(evName, Math.abs(ev.change), 2);
            state.stats.totalEventsDamage += Math.abs(ev.change);
            feedbackHTML = `🚨 Nova fatura gerada: R$ ${Math.abs(ev.change)}<br><small>Verifique suas <b>Contas a Pagar</b> no Ficheiro (Vence em 2 rodadas).</small>`;
            UI.mFeedback.className = 'error';
        } else {
            addReceivable(evName, ev.change, 2);
            state.stats.totalEventsGains += ev.change;
            feedbackHTML = `✅ Novo recebimento futuro: R$ ${ev.change}<br><small>Verifique suas <b>Contas a Receber</b> no Ficheiro (Cai em 2 rodadas).</small>`;
            UI.mFeedback.className = 'success';
        }
        
        openModal(t("event_title") + " 📊", evName);
        UI.mOptions.innerHTML = '';
        if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
        if (UI.mBtnReveal) UI.mBtnReveal.classList.add('hidden');
        UI.mFeedback.innerHTML = feedbackHTML;
        UI.mFeedback.classList.remove('hidden');
    }

    // Processamentos de Fim de Turno
    processBankTurn();
    updateHUD();
    UI.mAction.innerText = t("btn_ok");
    UI.mAction.classList.remove('hidden');
    UI.mAction.onclick = () => {
        closeModal();
        updateHUD();
        // checkLevelUp(); -> O usuário pediu para não fazer nada no nível da empresa
        renderBoard();
    };
}

function askQuestion(skipRePick = false) {
    console.log("askQuestion: Carregando pergunta para posição", state.pos);
    // Pick question by house position (1-indexed) if not skipping
    if (!skipRePick) {
        state.currentQuestion = state.questions.find(q => q.id === state.pos) || state.questions[0];
    }
    
    if (!state.currentQuestion) {
        console.error("askQuestion ERROR: state.questions está vazio ou questão não encontrada!");
        return;
    }
    console.log("askQuestion: Questão selecionada:", state.currentQuestion.id);

    updateHUD(); // Unlocks the card buttons
    
    // Reset Modal UI
    UI.mFeedback.classList.add('hidden');
    UI.mImage.classList.add('hidden');
    UI.mImage.src = '';
    
    // Configura tratamentos à prova de falhas para a imagem
    UI.mImage.onload = () => { UI.mImage.classList.remove('hidden'); };
    UI.mImage.onerror = () => { UI.mImage.classList.add('hidden'); };
    
    if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
    if (UI.mBtnReveal) {
        UI.mBtnReveal.classList.add('hidden');
    }

    // Exibe o título e o conteúdo da questão
    const qTitle = t("question_house", { pos: state.pos });
    // Fallback para o campo .text se .intro/.question não existirem
    const qContent = state.currentQuestion.text || 
                    ((state.currentQuestion.intro || "") + "<br><br>" + (state.currentQuestion.question || ""));
                    
    openModal(qTitle, qContent);
    UI.mOptions.innerHTML = '';
    
    if (state.currentQuestion.image && UI.mImage) {
        UI.mImage.src = state.currentQuestion.image;
        UI.mImage.classList.remove('hidden');
    } else if (UI.mImage) {
        UI.mImage.classList.add('hidden');
    }

    if (state.currentQuestion.revealImage && UI.mBtnReveal) {
        UI.mBtnReveal.classList.remove('hidden');
        UI.mBtnReveal.onclick = () => {
            // Força a exibição imediata em vez de depender apenas do onload (bugs de cache)
            UI.mImage.src = state.currentQuestion.revealImage;
            UI.mImage.classList.remove('hidden'); 
            UI.mBtnReveal.classList.add('hidden');
        };
    }
    
    // Logic for English Reveal
    const UI_btnRevealEn = document.getElementById('btn-reveal-en');
    if (UI_btnRevealEn) {
        // Reset button state
        UI_btnRevealEn.classList.remove('hidden');
        UI_btnRevealEn.dataset.showing = 'pt';
        UI_btnRevealEn.innerHTML = 'REVELAR QUESTÃO EM INGLÊS';
        
        // Hide if we are already playing the game in English
        const langEnBtn = document.getElementById('btn-lang-en');
        if (langEnBtn && langEnBtn.classList.contains('active')) {
            UI_btnRevealEn.classList.add('hidden');
        }

        UI_btnRevealEn.onclick = async () => {
            if (UI_btnRevealEn.dataset.showing === 'en') {
                UI.modalText.innerHTML = state.currentQuestion.text;
                UI_btnRevealEn.dataset.showing = 'pt';
                UI_btnRevealEn.innerHTML = 'REVELAR QUESTÃO EM INGLÊS';
            } else {
                UI_btnRevealEn.innerHTML = '⏳ CARREGANDO...';
                const id = state.currentQuestion.id;
                let urls = [
                    `perguntas/en/pergunta${id}.txt`,
                    `perguntas/en/prgunta${id}.txt`,
                    `perguntas/en/pergunta0${id}.txt`,
                    `perguntas/en/prgunta0${id}.txt`
                ];
                let response = null;
                let cb = '?t=' + new Date().getTime();
                for (let url of urls) {
                    let res = await fetch(url + cb).catch(()=>null);
                    if (res && res.ok) { response = res; break; }
                }
                
                if (response) {
                    const text = await response.text();
                    const qMatch = text.match(/📌 Pergunta:\s*([\s\S]*?)🔘 Alternativas:/i);
                    if (qMatch) {
                        UI.modalText.innerHTML = `<div style="text-align: left; font-size: 1.1em; line-height: 1.5; color: #f1c40f;"><b>[ENGLISH VERSION]</b><br><br>${qMatch[1].trim().replace(/\n/g, '<br>')}</div>`;
                        UI_btnRevealEn.dataset.showing = 'en';
                        UI_btnRevealEn.innerHTML = 'VOLTAR PARA PORTUGUÊS';
                    } else {
                        UI_btnRevealEn.innerHTML = '❌ ERRO DE FORMATO';
                        setTimeout(() => UI_btnRevealEn.innerHTML = 'REVELAR QUESTÃO EM INGLÊS', 2000);
                    }
                } else {
                    UI_btnRevealEn.innerHTML = '❌ ARQUIVO NÃO ENCONTRADO';
                    setTimeout(() => UI_btnRevealEn.innerHTML = 'REVELAR QUESTÃO EM INGLÊS', 2000);
                }
            }
        };
    }
    
    state.currentQuestion.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `<span><b>${opt.id})</b> ${opt.text}</span>`;
        btn.onclick = () => handleAnswer(opt.id, btn);
        UI.mOptions.appendChild(btn);
    });
    UI.mAction.classList.add('hidden'); // Ensure action button is hidden at start of question
    
    // Força o scroll para o topo após as alternativas serem inseridas
    forceScrollToTop();
}

function handleAnswer(selectedId, btnElement) {
    // Disable interface
    Array.from(UI.mOptions.children).forEach(b => {
        b.classList.add('disabled');
        b.onclick = null;
    });

    if (!state.currentQuestion) {
        console.error("No active question found!");
        closeModal();
        return;
    }

    const selectedOpt = state.currentQuestion.options.find(o => o.id === selectedId);
    if (!selectedOpt) return;
    
    const isCorrect = selectedOpt.isCorrect;
    if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
    
    if (isCorrect) {
        state.consecutiveWrong = 0; // Reset na sequência de erros
        state.stats.correctAnswers++; // Track progress for milestones
        
        // Mudar imagem de fundo ao acertar (Nova lógica solicitada)
        if (typeof GRAVITY_IMAGES !== 'undefined' && GRAVITY_IMAGES.length > 0) {
            state.bgIndex = (state.bgIndex + 1) % GRAVITY_IMAGES.length;
        }
        
        // Trigger E-mail task notification at 3 answers (Delayed)
        if (state.stats.correctAnswers === 3 && !state.machineryInquiryUnlocked) {
            state.machineryInquiryUnlocked = true;
            state.emailNotificationPending = true; // Agendado para depois do fechamento do modal
            state.emails.push({
                id: 'unlock_' + Date.now(),
                from: "SAP Business One",
                subject: "Oportunidade: Novas Máquinas",
                content: "Parabéns pelo progresso! Sua fábrica está pronta para expandir.\n\nAgora você já pode negociar equipamentos industriais usados.\n\nVá em ESCREVER e selecione 'Máquinas industriais usadas' para começar.\n\nBoa sorte!",
                date: new Date().toLocaleDateString()
            });
        }
        
        btnElement.classList.add('correct');
        // RECOMPENSA DINÂMICA: Base 150 + Bonus Máquinas (10/nv) + Bonus Logística (5/nv)
        const baseReward = 150;
        const machinesBonus = (state.upgrades.machines || 0) * 10;
        const logisticsBonus = (state.upgrades.logistics || 0) * 5;
        const reward = baseReward + machinesBonus + logisticsBonus;
        
        updateMoney(reward, "extrato_question_win");
        if (window.triggerFloatingMoney) window.triggerFloatingMoney(reward, btnElement);
        
        state.pos++;
        
        // Resposta automática de Máquinas (Após a 5ª questão correta) - Delayed
        if (state.machineryEmailSentRound !== null && !state.machineryEmailReplied && state.stats.correctAnswers >= 5) {
            state.machineryEmailReplied = true;
            state.machineryReplySeen = false;
            state.emails.push({
                id: 'reply_' + Date.now(),
                from: "Máquinas industriais usadas",
                subject: "Re: Comprar máquinas",
                content: "Obrigado pelo seu contato.\n\nPara facilitar e agilizar o atendimento, peço que me chame diretamente no WhatsApp pelo link abaixo. Por lá consigo te enviar todas as informações e materiais de forma rápida:\n\nhttps://wa.me/5511994500277?text=Olá,%20tenho%20interesse\n\nFico à disposição.\n\nAtenciosamente,\nJoão Fernando",
                date: "31/03/2026"
            });
            state.emailNotificationPending = true; // Agendado para depois do fechamento do modal
            // Se o modal de e-mail estiver aberto, força a renderização para piscar a Inbox
            if (UI.emailModal && !UI.emailModal.classList.contains('hidden')) {
                renderEmails();
            }
            console.log("Resposta automática recebida (Notificação pendente): João Fernando / WhatsApp");
        }
        
        // INCREMENTA RODADAS DE COMUNICAÇÃO IGNORADA
        const isEmailNotificationActive = state.emailTaskActive || (state.machineryEmailReplied && !state.machineryReplySeen);
        if (isEmailNotificationActive) {
            state.emailAlertRounds++;
            console.log(`Comunicação pendente. Rodada ${state.emailAlertRounds}/1 para aviso de reputação.`);
        }

        // Ciclo de Despesas Operacionais: A cada 5 acertos (5, 10, 15, 20...)
        const expenseTrigger = (state.stats.correctAnswers > 0 && state.stats.correctAnswers % 5 === 0);
        
        if (expenseTrigger) {
            state.expensePaid = false;
            state.expensesOverdue = true; // Marca como pendente/atrasado
            state.expenseOverdueRounds = 0; // Inicia nova contagem para este ciclo específico
            console.log(`Nova rodada de faturamento! Ciclo na casa: ${state.pos}`);
            
            // Som de Alerta de Despesas
            if (typeof playExpenseAlertSound === 'function') playExpenseAlertSound();

            // AUTO-DEBIT LOGIC
            if (state.bank.autoDebit) {
                const total = calculateTotalExpenses();
                if (state.money >= total) {
                    console.log("Finance: Processando Débito Automático...");
                    updateMoney(-total, "extrato_expenses_paid");
                    state.expensePaid = true;
                    state.expensesOverdue = false; // Pago via débito automático
                    state.expenseOverdueRounds = 0; // Reset greve
                    const formattedTotal = total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    const msg = `💰 Débito Automático: R$ ${formattedTotal} pagos com sucesso!`;
                    playSuccessSound();
                    alert(msg);
                    updateHUD();
                } else {
                    console.warn("Finance: Saldo insuficiente para Débito Automático.");
                }
            }
        }
        
        let bonusParts = [];
        if (machinesBonus > 0) bonusParts.push(`Máquinas: +${machinesBonus}`);
        if (logisticsBonus > 0) bonusParts.push(`Logística: +${logisticsBonus}`);
        
        const rewardText = bonusParts.length > 0 ? `${reward} (Bônus: ${bonusParts.join(', ')})` : `${reward}`;
        UI.mFeedback.innerHTML = `${t("ans_correct", { reward: rewardText })}<br><br>${selectedOpt.justification}`;
        UI.mFeedback.className = 'success';
        
        // Visual Success Feedback
        document.body.classList.add('flash-success');
        setTimeout(() => document.body.classList.remove('flash-success'), 500);
        playSuccessSound();

        
        if (state.currentQuestion.bonusText && UI.mBtnBonus) {
            const bText = state.currentQuestion.bonusText; // CAPTURE THE TEXT HERE!
            UI.mBtnBonus.classList.remove('hidden');
            UI.mBtnBonus.onclick = () => {
                UI.mFeedback.innerHTML += `<div style="margin-top: 15px; padding: 15px; border-left: 4px solid #f1c40f; background: rgba(241, 196, 15, 0.15); text-align: left; color: #fff; font-size: 0.9em; box-shadow: inset 0 0 10px rgba(0,0,0,0.5); border-radius: 0 6px 6px 0; border: 1px solid rgba(241, 196, 15, 0.3);"><strong style="color: #f1c40f;">${t("bonus_hint_title")}</strong><br><br>${bText}</div>`;
                UI.mBtnBonus.classList.add('hidden');
                setTimeout(() => {
                    const modalInner = document.querySelector('.modal-content');
                    if (modalInner) modalInner.scrollTo({top: modalInner.scrollHeight, behavior: 'smooth'});
                }, 100);
            };
        }
        
    } else {
        btnElement.classList.add('wrong');
        
        // Mecânica de BLITZ: Apenas até a questão 20
        if (state.pos <= 20) {
            state.consecutiveWrong++;
            if (state.consecutiveWrong >= 3) {
                state.pendingBlitz = true;  // Sinaliza para exibir APÓS o feedback normal
                state.consecutiveWrong = 0;
            }
        } else {
            state.consecutiveWrong = 0; // Inativo após Q20
        }
        
        // Prevent loss using consultant
        if (state.consultants > 0) {
            state.consultants--;
            UI.mFeedback.innerHTML = `${selectedOpt.justification}<br><br>${t("ans_consultant")}`;
            UI.mFeedback.className = 'info';
        } else {
            const baseLoss = 500;
            const trainingDiscountPercent = (state.upgrades.training || 0) * 0.02;
            const lossReduction = Math.round(baseLoss * trainingDiscountPercent);
            const loss = baseLoss - lossReduction;

            updateMoney(-loss, "extrato_question_loss");
            if (window.triggerFloatingMoney) window.triggerFloatingMoney(-loss, btnElement, 'wrong');
            
            let lossText = lossReduction > 0 ? `${loss} (Desconto Treinamento -${Math.round(trainingDiscountPercent * 100)}%: R$ ${lossReduction})` : `${loss}`;
            UI.mFeedback.innerHTML = `${selectedOpt.justification}<br><br>${t("ans_wrong", { loss: lossText })}`;
            UI.mFeedback.className = 'error';
            
            // Visual Error Feedback
            document.body.classList.add('flash-error');
            setTimeout(() => document.body.classList.remove('flash-error'), 500);
        }
    }
    
    UI.mFeedback.classList.remove('hidden');
    state.currentQuestion = null;
    
    // INCREMENTA RODADAS EM ATRASO (Apenas se já estiver overdue ANTES deste acerto, ou se acabou de ficar e não pagou)
    if (state.expensesOverdue) {
        state.expenseOverdueRounds++;
        console.log(`Despesas em atraso. Rodada ${state.expenseOverdueRounds}/3 para GREVE.`);
    }

    updateHUD();
    renderBoard();
    
    UI.mAction.classList.remove('hidden');
    
    // Auto-scroll to feedback area
    setTimeout(() => {
        UI.mFeedback.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    // Ganhos estratégicos removidos conforme solicitação

    UI.mAction.onclick = () => {
        // GATILHO: Blitz pendente — exibe APÓS o feedback do erro
        if (state.pendingBlitz) {
            state.pendingBlitz = false;
            applyBlitzPenalty();
            return; // Não fecha o modal ainda; applyBlitzPenalty mostra o próprio
        }
        // GATILHO: Questão Surpresa após acertar a primeira questão
        if (isCorrect && state.pos === 2 && !state.surpriseShown1) {
            loadSurpriseQuestion(1);
            return;
        }

        // GATILHO: Evento Fixo Influenciador ao acertar a Quarta Questão
        if (isCorrect && state.pos === 4 && !state.influencerEventShown) {
            state.influencerEventShown = true;
            triggerInfluencerEvent();
            return;
        }
        
        // GATILHO: Questão Surpresa 2 após acertar a sexta questão
        if (isCorrect && state.pos === 7 && !state.surpriseShown2) {
            loadSurpriseQuestion(2);
            return;
        }

        // GATILHO: Evento Falha Elétrica na Rodada 8 (50% de chance)
        if (isCorrect && state.pos === 8 && !state.electricEventShown) {
            state.electricEventShown = true;
            triggerElectricFailEvent();
            return;
        }

        closeModal();
        checkLevelUp();
        if (state.pos > 300) showGameOver();
        else {
            if (UI.btnNext) UI.btnNext.classList.remove('hidden');
        }
    };
}

// Timer da Questão Surpresa
let surpriseTimerInterval = null;

// NOVO: Sistema de Questão Surpresa
async function loadSurpriseQuestion(num) {
    try {
        const response = await fetch(`questoessurpresa/surpresa${num}.txt?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error("Arquivo surpresa não encontrado.");
        
        const rawText = await response.text();
        
        // Parsing robusto para o formato surpresa (Intro + Questão + Opções multi-linha)
        const questionPart = rawText.split('❓ Pergunta')[1];
        const intro = rawText.split('❓ Pergunta')[0].trim();
        
        const optionsPart = questionPart.split('✅ Opções')[1];
        const questionText = questionPart.split('✅ Opções')[0].trim();
        
        const finalSplit = optionsPart.split('🏆 Resposta correta:');
        const optionsRaw = finalSplit[0].trim();
        const correctAnswer = finalSplit[1].trim();

        // Limpa o modal e prepara para a surpresa
        UI.mFeedback.classList.add('hidden');
        UI.mAction.classList.add('hidden');
        UI.mOptions.innerHTML = '';
        
        // Esconde o botão de Bônus — não aplicável à questão surpresa
        if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
        
        // Ativa a pele Retro (Windows 95/98)
        UI.modal.classList.add('retro-skin');
        
        // Formatação Retro para o corpo do e-mail
        const retroContent = `
            <div style="background: #fff; border: 2px inset #808080; padding: 15px; margin-bottom: 15px; text-align: left; font-family: 'Courier New', monospace; font-size: 11px; color: #000; overflow-y: auto; max-height: 210px;">
                ${intro.replace(/\n/g, '<br>')}
            </div>
            <p class="retro-question">
                ❓ ${questionText}
            </p>
            <!-- Timer Retro -->
            <div id="surprise-timer-bar" style="margin: 12px 0 8px; background: #808080; border: 2px inset #fff; height: 20px; position: relative; overflow: hidden;">
                <div id="surprise-timer-fill" style="height: 100%; width: 100%; background: #00cc00; transition: width 1s linear;"></div>
                <span id="surprise-timer-text" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); font-family: 'Press Start 2P', cursive; font-size: 8px; color: #000; white-space: nowrap;">⏱ 60s</span>
            </div>
        `;

        openModal("📥 MENSAGEM SURPRESA", retroContent);

        // Extrai as opções A, B, C (lidando com múltiplas linhas)
        const optA = optionsRaw.split('B)')[0].replace('A)', '').trim();
        const optB = optionsRaw.split('B)')[1]?.split('C)')[0].trim() || "";
        const optC = optionsRaw.split('C)')[1]?.trim() || "";
        
        const parsedOptions = [
            { id: 'A', text: optA },
            { id: 'B', text: optB },
            { id: 'C', text: optC }
        ];

        parsedOptions.forEach(opt => {
            if (!opt.text) return;
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.style.flexDirection = 'column';
            btn.style.alignItems = 'flex-start';
            btn.innerHTML = `<b style="color: #f1c40f; margin-bottom: 5px;">Opção ${opt.id}:</b><span style="font-size: 0.9em; line-height: 1.4;">${opt.text.replace(/\n/g, '<br>')}</span>`;
            btn.onclick = () => selectSurpriseOption(num, opt.id, correctAnswer);
            UI.mOptions.appendChild(btn);
        });

        // Iniciar Contagem Regressiva de 60 segundos + Bônus Consultores (2s/nv)
        const baseTime = 60;
        const consultBonus = (state.upgrades.consultants || 0) * 2;
        startSurpriseTimer(baseTime + consultBonus, num, correctAnswer);

        // Força o scroll para o topo após as alternativas serem inseridas
        forceScrollToTop();

    } catch (err) {
        console.error("Erro ao carregar surpresa:", err);
        closeModal();
    }
}

function startSurpriseTimer(seconds, num, correctAnswer) {
    clearInterval(surpriseTimerInterval);
    let timeLeft = seconds;
    const fill = document.getElementById('surprise-timer-fill');
    const text = document.getElementById('surprise-timer-text');

    surpriseTimerInterval = setInterval(() => {
        timeLeft--;
        const pct = (timeLeft / seconds) * 100;

        if (fill) {
            fill.style.width = pct + '%';
            // Muda cor conforme urgência
            if (timeLeft <= 10) fill.style.background = '#cc0000';
            else if (timeLeft <= 20) fill.style.background = '#cc8800';
        }
        if (text) text.textContent = `⏱ ${timeLeft}s`;

        if (timeLeft <= 0) {
            clearInterval(surpriseTimerInterval);
            // Tempo esgotado: resultado de resposta errada
            selectSurpriseOption(num, 'TIMEOUT', correctAnswer);
        }
    }, 1000);
}

function stopSurpriseTimer() {
    clearInterval(surpriseTimerInterval);
    surpriseTimerInterval = null;
}

function selectSurpriseOption(num, choice, correctLetter) {
    stopSurpriseTimer(); // Para o timer imediatamente
    const isCorrect = choice.toUpperCase() === correctLetter.toUpperCase();
    
    // Desativar botões
    document.querySelectorAll('.option-btn').forEach(b => {
        b.onclick = null;
        if (b.innerText.includes(`Opção ${choice}:`)) {
            b.classList.add(isCorrect ? 'correct' : 'wrong');
        }
    });

    // SEMPRE marcar como mostrada, independente de acerto ou erro
    if (num === 1) {
        state.surpriseShown1 = true;
        if (isCorrect) state.surprise1Correct = true;
    }
    if (num === 2) {
        state.surpriseShown2 = true;
        if (isCorrect) state.surprise2Correct = true;
    }

    if (isCorrect) {
        const bonus = 50;
        updateMoney(bonus, "extrato_surprise_win");
        updateHUD();
        
        let bonusLessonHTML = '';
        if (num === 1) {
            bonusLessonHTML = `
                <b style="font-size:12px;">🎓 BÔNUS: Aula de Inglês no Mundo dos Negócios</b><br><br>

                <b>📌 Frase principal do cliente:</b><br>
                <span style="background:#fff; border:1px inset #808080; display:block; padding:6px; margin:6px 0;">
                    "I'm interested in learning more about your products."
                </span>
                👉 <b>Significado:</b> "Estou interessado em conhecer mais sobre seus produtos."<br><br>

                <b>🧠 Expressões importantes</b><br><br>

                <b>1. "I'm interested in…"</b><br>
                ➡️ Usado para demonstrar interesse<br>
                <span style="background:#fff; border:1px inset #808080; display:block; padding:5px; margin:4px 0;">
                    I'm interested in your services.<br>
                    <i>(Estou interessado nos seus serviços)</i>
                </span><br>

                <b>2. "Could you please…"</b><br>
                ➡️ Forma educada de fazer pedidos<br>
                <span style="background:#fff; border:1px inset #808080; display:block; padding:5px; margin:4px 0;">
                    Could you please send me more details?<br>
                    <i>(Você poderia me enviar mais detalhes?)</i>
                </span>
                💡 <b>Isso é MUITO usado no mundo corporativo!</b><br><br>

                <b>3. "Looking forward to your response"</b><br>
                ➡️ Forma profissional de encerrar um e-mail<br>
                Significa: <i>"Aguardo sua resposta"</i><br><br>

                <b>✍️ Estrutura básica de resposta profissional:</b><br>
                <span style="background:#fff; border:1px inset #808080; display:block; padding:8px; margin:6px 0;">
                    📌 Greeting → <i>Hello John,</i><br>
                    📌 Agradecimento → <i>Thank you for your interest.</i><br>
                    📌 Ação → <i>I will send you the details.</i><br>
                    📌 Fechamento → <i>Best regards</i>
                </span><br>

                <div style="background:#808080; color:#fff; padding:6px 10px; font-size:10px;">
                    🚀 <b>Dica de Ouro:</b> Evite respostas curtas ou frias:<br>
                    ❌ "Check our website" &nbsp;&nbsp; ❌ "We are busy"<br>
                    ✔️ Sempre seja educado, claro e prestativo!
                </div>
            `;
        } else if (num === 2) {
            bonusLessonHTML = `
                <b style="font-size:12px;">🎓 BÔNUS: Aula de Inglês no Mundo dos Negócios</b><br><br>

                <b>📌 Frase importante:</b><br>
                <span style="background:#fff; border:1px inset #808080; display:block; padding:6px; margin:6px 0;">
                    "We can study this possibility and check viable options for your needs."
                </span>
                👉 <b>Significado:</b> "Podemos analisar essa possibilidade e verificar opções viáveis para sua necessidade."<br><br>

                <b>🧠 Expressões importantes</b><br><br>

                <b>1. "At the moment…"</b><br>
                ➡️ Indica situação atual sem fechar portas<br><br>

                <b>2. "Study this possibility"</b><br>
                ➡️ Forma profissional de não dizer “não” diretamente<br><br>

                <b>3. "Please share more details…"</b><br>
                ➡️ Mantém a conversa ativa<br><br>

                <div style="background:#808080; color:#fff; padding:6px 10px; font-size:10px;">
                    🚀 <b>Dica de Ouro do Jogo:</b> Nunca feche portas para o cliente!<br>
                    ✔️ Mesmo sem solução imediata, ofereça alternativas<br>
                    ✔️ Isso mostra profissionalismo e interesse<br><br>
                    ➡️ Empresas assim vendem mais 💰🔥
                </div>
            `;
        }

        UI.mFeedback.innerHTML = `
            <div style="text-align:left; font-family: 'Courier New', monospace; font-size: 11px; color: #000; line-height: 1.8;">
                <div style="background:#000080; border:2px solid #f1c40f; border-radius:4px; color:#f1c40f; padding:12px 10px; text-align:center; font-family:'Press Start 2P',cursive; font-size:12px; margin-bottom:12px; text-shadow: 1px 1px 0px #000; box-shadow: 0 4px 0px rgba(0,0,0,0.3);">
                    ✅ PARABÉNS! +$ ${bonus} creditado!
                </div>
                ${bonusLessonHTML}
            </div>
        `;
        UI.mFeedback.className = 'success';
        playSuccessSound();
    } else {
        const penalty = 300;
        updateMoney(-penalty, "extrato_surprise_loss");
        updateHUD();
        const timeoutMsg = choice === 'TIMEOUT'
            ? '⏰ <b>TEMPO ESGOTADO!</b><br><br>Você não respondeu a tempo. O cliente John Miller ficou esperando e desistiu do contato.<br><br>'
            : '❌ <b>RESPOSTA INADEQUADA</b><br><br>John Miller sentiu falta de profissionalismo e decidiu não seguir com a cotação. Fique atento às etiquetas de negócios internacionais!<br><br>';
        UI.mFeedback.innerHTML = `${timeoutMsg}💸 <b>PREJUÍZO: R$ ${penalty}</b>`;
        UI.mFeedback.className = 'error';
        document.body.classList.add('flash-error');
        setTimeout(() => document.body.classList.remove('flash-error'), 500);
    }

    UI.mFeedback.classList.remove('hidden');
    UI.mAction.innerText = t("btn_continue");
    UI.mAction.classList.remove('hidden');
    
    // Garantir que a mensagem de Parabéns/Erro apareça na tela (auto-scroll pro topo do feedback)
    setTimeout(() => {
        UI.mFeedback.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    UI.mAction.onclick = () => {
        closeModal();
        checkLevelUp();
    };
}


function checkLevelUp() {
    const newLevel = Math.floor((state.pos - 1) / 10) + 1;
    
    if (newLevel > state.level && newLevel <= 30) {
        state.level = newLevel;
        alert(`🎉 Crescimento! Você alcançou o Nível ${state.level}/30!`);
        updateHUD();
    }
}

function showGameOver(isBankrupt = false) {
    const title = isBankrupt ? t("game_over_bankrupt_title") : t("game_over_title");
    const text = isBankrupt ? t("game_over_bankrupt_text", { money: Math.abs(state.money), level: state.level }) : t("game_over_text", { money: state.money, level: `${state.level}/30` });
    
    openModal(title, text);
    
    UI.mOptions.innerHTML = '';
    UI.mFeedback.className = 'hidden';
    UI.mAction.innerText = t("btn_restart");
    UI.mAction.classList.remove('hidden');
    UI.mAction.onclick = () => location.reload();
}

// Função global e hiper-robusta para garantir o scroll
function forceScrollToTop() {
    try {
        const mc = document.querySelector('#modal .modal-content');
        if (mc) {
            mc.scrollTop = 0;
            // Tenta forçar de novo no próximo frame do navegador
            requestAnimationFrame(() => {
                mc.scrollTop = 0;
                setTimeout(() => { mc.scrollTop = 0; }, 50);
            });
        }
    } catch(e) {}
}

function openModal(title, text) {
    console.log("HUD: ABRINDO MODAL ->", title);
    if (UI.mTitle) UI.mTitle.innerHTML = title;
    if (UI.mText) UI.mText.innerHTML = text;
    
    const modalImage = document.getElementById('modal-image');
    if (modalImage) {
        modalImage.classList.add('hidden');
        modalImage.src = "";
    }
    
    // FORÇA VISIBILIDADE EXTREMA
    UI.modal.classList.remove('hidden');
    UI.modal.style.display = 'flex';
    UI.modal.style.zIndex = '999999';
    UI.modal.style.opacity = '1';
    UI.modal.style.pointerEvents = 'auto';
    
    forceScrollToTop();

    // Auto-hide ticker when ANY modal opens
    updateTickerVisibility(true);
    document.body.classList.add('modal-active');
}
window.openModal = openModal;

function closeModal() {
    stopSurpriseTimer(); 
    UI.modal.classList.add('hidden');
    UI.mFeedback.classList.add('hidden');
    UI.mBtnNo.classList.add('hidden');
    document.body.classList.remove('modal-active');

    // Restore ticker visibility based on preferences
    updateTickerVisibility();

    // Notificação de E-mail Retardada (2 segundos após fechar modal)
    if (state.emailNotificationPending) {
        state.emailNotificationPending = false;
        setTimeout(() => {
            state.emailTaskActive = true;
            if (typeof playEmailNotificationSound === 'function') playEmailNotificationSound();
            updateHUD();
            console.log("Notificação de e-mail disparada (2s após fechar modal)");
        }, 2000);
    }
    
    UI.modal.classList.remove('retro-skin');
    UI.mAction.innerText = t("btn_continue");
    UI.mAction.style.display = ''; // GUARANTEES BUTTON CAN BE SHOWN AGAIN AVOIDING SOFT-LOCKS

    // Limpa a rolagem (scroll) de forma oculta após a animação (400ms)
    setTimeout(forceScrollToTop, 400);
}

function triggerInfluencerEvent() {
    openModal("📱 EVENTO FIXO", "<b>Influenciador Divulgou sua Marca!</b><br><br>Um grande criador de conteúdo mostrou seus produtos nos stories organicamente. O engajamento com seus produtos disparou!");
    
    UI.mOptions.innerHTML = '';
    if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
    if (UI.mBtnReveal) UI.mBtnReveal.classList.add('hidden');
    
    updateMoney(650, "extrato_event");
    updateHUD();
    playSuccessSound();
    
    UI.mFeedback.innerHTML = `✅ + R$ 650,00 💰 (Lucro Imediato)`;
    UI.mFeedback.className = 'success';
    UI.mFeedback.classList.remove('hidden');
    
    UI.mAction.innerText = t("btn_continue");
    UI.mAction.classList.remove('hidden');
    UI.mAction.onclick = () => {
        closeModal();
        if (typeof checkLevelUp === 'function') checkLevelUp();
        if (state.pos > 300 && typeof showGameOver === 'function') showGameOver();
        else {
            if (UI.btnNext) UI.btnNext.classList.remove('hidden');
        }
    };
}

function triggerElectricFailEvent() {
    const happened = Math.random() < 0.5;

    if (!happened) {
        openModal("⚡ EVENTO DO TURNO", "<b>Falha Elétrica no Galpão</b><br><br>A equipe de manutenção inspecionou o sistema elétrico esta semana, mas desta vez tudo estava em ordem. Você teve sorte!");
        UI.mOptions.innerHTML = '';
        if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
        if (UI.mBtnReveal) UI.mBtnReveal.classList.add('hidden');
        UI.mFeedback.innerHTML = `✅ Nenhum problema elétrico detectado desta vez!`;
        UI.mFeedback.className = 'success';
        UI.mFeedback.classList.remove('hidden');
    } else {
        updateMoney(-100, "extrato_event");
        updateHUD();
        openModal("⚡ EVENTO DO TURNO", "<b>Falha Elétrica no Galpão!</b><br><br>Um curto-circuito danificou parte do sistema elétrico do seu galpão. A equipe de manutenção precisou ser acionada de emergência.");
        UI.mOptions.innerHTML = '';
        if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
        if (UI.mBtnReveal) UI.mBtnReveal.classList.add('hidden');
        UI.mFeedback.innerHTML = `❌ - R$ 100,00 🔧 (Custo de Manutenção Elétrica)`;
        UI.mFeedback.className = 'error';
        UI.mFeedback.classList.remove('hidden');
    }

    UI.mAction.innerText = t("btn_continue");
    UI.mAction.classList.remove('hidden');
    UI.mAction.onclick = () => {
        closeModal();
        if (typeof checkLevelUp === 'function') checkLevelUp();
        if (state.pos > 300 && typeof showGameOver === 'function') showGameOver();
        else {
            if (UI.btnNext) UI.btnNext.classList.remove('hidden');
        }
    };
}

/* --- Expense Decision Logic (Moved to Modal) --- */
window.payExpensesNow = function() {
    console.log("Finance: Iniciando payExpensesNow...");
    if (state.expensePaid) {
        console.warn("Despesas já foram pagas neste ciclo!");
        closeExpenses();
        return;
    }
    const total = calculateTotalExpenses();
    if (state.money >= total) {
        updateMoney(-total, "extrato_expenses_paid");
        state.expensePaid = true;
        state.expensesOverdue = false; // Pago agora
        state.expenseOverdueRounds = 0; // Reset contagem de greve
        alert(t("alert_expenses_paid", { amount: total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }));
        updateHUD();
        closeExpenses(); // Fecha a tela de despesas para evitar duplo clique
        if (UI.btnOpenExpenses) UI.btnOpenExpenses.classList.remove('pulse-red');
    } else {
        alert(t("alert_no_funds"));
    }
}

window.postponeExpenses = function() {
    const penaltyGrowth = state.expensePenalty === 0 ? 50 : Math.round(state.expensePenalty * 0.15);
    state.expensePenalty += penaltyGrowth;
    alert(`Pagamento adiado! Multa de R$ ${penaltyGrowth} (Juros sobre dívida) aplicada.`);
    updateHUD();
    state.expensePaid = true; // Marca como resolvido (pago ou adiado) para parar o alerta
    state.expensesOverdue = false; // Resolvido
    state.expenseOverdueRounds = 0; // Reset contagem de greve (adiamento também cancela greve)
    closeExpenses();
}

// Powerups Actions
function buyConsultant() {
    if (state.money >= 500 && state.consultants < 2) {
        updateMoney(-500, "extrato_hire_consultant");
        state.consultants++;
        updateHUD();
    }
}

function closeAllModals() {
    if (UI.bankModal) UI.bankModal.classList.add('hidden');
    if (UI.investModal) UI.investModal.classList.add('hidden');
    if (UI.inventoryModal) UI.inventoryModal.classList.add('hidden');
    if (UI.expensesModal) UI.expensesModal.classList.add('hidden');
    if (UI.extratoModal) UI.extratoModal.classList.add('hidden');
    if (UI.financeModal) UI.financeModal.classList.add('hidden');
    if (UI.emailModal) UI.emailModal.classList.add('hidden');

    // Auto-collapse ticker bar when ANY modal is opened (since open calls closeAll first)
    updateTickerVisibility(true);
    document.body.classList.remove('modal-active');
}

window.closeInventory = function() {
    if (UI.inventoryModal) UI.inventoryModal.classList.add('hidden');
    updateTickerVisibility(); // Restaura conforme preferência se sem modais (idealmente)
    document.body.classList.remove('modal-active');
}

// --- Extrato Logic ---

window.openExtrato = function() {
    const isHidden = UI.extratoModal.classList.contains('hidden');
    closeAllModals();
    if (isHidden) {
        renderExtrato();
        UI.extratoModal.classList.remove('hidden');
        document.body.classList.add('modal-active');
    }
}

window.closeExtrato = function() {
    UI.extratoModal.classList.add('hidden');
    updateTickerVisibility();
    document.body.classList.remove('modal-active');
}

function renderExtrato() {
    if (!UI.extratoList) return;
    UI.extratoList.innerHTML = '';
    
    if (state.statement.length === 0) {
        UI.extratoList.innerHTML = `<p style="text-align:center; color:#8b949e; margin-top: 20px;">Nenhuma transação financeira registrada.</p>`;
        return;
    }
    
    state.statement.forEach((t_record) => {
        const isIncome = t_record.type === 'income';
        const color = isIncome ? '#2ecc71' : '#e74c3c';
        const sign = isIncome ? '+' : '-';
        
        UI.extratoList.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 12px 0; font-size: 0.9rem;">
                <div>
                    <strong style="color: #fff;">${t_record.reason}</strong>
                    <div style="font-size: 0.75rem; color: #8b949e; margin-top: 4px;">Rodada ${t_record.turn}</div>
                </div>
                <div style="text-align: right;">
                    <div style="color: ${color}; font-weight: bold;">${sign} R$ ${Math.abs(t_record.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <div style="font-size: 0.75rem; color: #8b949e; margin-top: 4px;">Saldo: R$ ${t_record.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                </div>
            </div>
        `;
    });
}

// --- Bank Logic ---

window.openBank = function() {
    const isHidden = UI.bankModal.classList.contains('hidden');
    closeAllModals();
    if (isHidden) {
        updateBankUI();
        UI.bankModal.classList.remove('hidden');
        document.body.classList.add('modal-active');
    }
}

window.closeBank = function() {
    UI.bankModal.classList.add('hidden');
    updateTickerVisibility();
    document.body.classList.remove('modal-active');
}

function switchBankTab(tabId) {
    UI.bankTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    UI.bankPanels.forEach(p => p.classList.toggle('hidden', p.id !== `bank-${tabId}-panel`));
}

window.pixFocus = function(currentInput, nextId) {
    // Only accept numeric digits
    currentInput.value = currentInput.value.replace(/[^0-9]/g, '');
    if (currentInput.value.length === 1 && nextId) {
        document.getElementById(nextId).focus();
    }
}

window.confirmPix = function() {
    const digits = [1, 2, 3, 4, 5].map(i => {
        const el = document.getElementById(`pix-digit-${i}`);
        return el ? el.value : '';
    });
    
    if (digits.some(d => d === '' || !/^\d$/.test(d))) {
        document.getElementById('pix-status').style.color = '#e74c3c';
        document.getElementById('pix-status').innerText = '⚠️ Preencha todos os 5 dígitos!';
        return;
    }
    
    const pixCode = digits.join('');
    
    if (pixCode === '22037') {
        if (!state.machineryReplySeen) {
            document.getElementById('pix-status').style.color = '#e74c3c';
            document.getElementById('pix-status').innerText = '⚠️ Esse pix ainda não está valido!';
            return;
        }

        if (state.money < 300) {
            document.getElementById('pix-status').style.color = '#e74c3c';
            document.getElementById('pix-status').innerText = '❌ Saldo insuficiente para o PIX inicial (R$ 300)!';
            return;
        }
        
        // Debita a primeira parcela imediatamente
        updateMoney(-300, 'extrato_pix_maquinas');
        
        // Premia com 3000 em maquinário e 1 ponto de brinde
        state.inventory.machinery += 3000;
        state.bonusPoints += 1;
        
        // Registra as 9 parcelas restantes como boletos no sistema de empréstimos
        state.bank.loans.push({
            amount: 2700,
            totalToPay: 2700,
            remainingInstallments: 9,
            installmentVal: 300,
            label: 'Boleto', // tipo boleto
            owner: 'Máquinas industriais usadas ltda'
        });
        
        updateHUD();
        updateBankUI();
        
        document.getElementById('pix-status').style.color = '#2ecc71';
        document.getElementById('pix-status').innerText = '✅ PIX enviado! R$ 300 debitado • +3.000 Maquinário • +1 Brinde';
        
        // Limpa os campos
        [1,2,3,4,5].forEach(i => {
            const el = document.getElementById(`pix-digit-${i}`);
            if (el) el.value = '';
        });
        
        alert('💸 PIX de R$ 300 enviado para Máquinas industriais usadas ltda!\n\n🏭 +R$ 3.000 adicionados ao Maquinário do Inventário\n🎁 +1 Ponto de Brinde desbloqueado\n\n9 boletos de R$ 300 foram registrados nas suas obrigações.\nVerifique o Inventário e o Resumo bancário.');
        return;
    }

    if (pixCode === '22036') {
        if (!state.machineryReplySeen) {
            document.getElementById('pix-status').style.color = '#e74c3c';
            document.getElementById('pix-status').innerText = '⚠️ Esse pix ainda não está valido!';
            return;
        }

        if (state.money < 2700) {
            document.getElementById('pix-status').style.color = '#e74c3c';
            document.getElementById('pix-status').innerText = '❌ Saldo insuficiente para o PIX de Melhoria (R$ 2.700)!';
            return;
        }

        // Debita o valor total
        updateMoney(-2700, 'extrato_pix_melhoria_direta');
        
        // Premia com 3000 em maquinário e 1 ponto de brinde
        state.inventory.machinery += 3000;
        state.bonusPoints += 1;
        
        updateHUD();
        updateBankUI();
        updateInventoryUI();
        
        document.getElementById('pix-status').style.color = '#2ecc71';
        document.getElementById('pix-status').innerText = '✅ PIX enviado! R$ 2.700 debitado • +3.000 Maquinário • +1 Brinde';
        
        // Limpa os campos
        [1,2,3,4,5].forEach(i => {
            const el = document.getElementById(`pix-digit-${i}`);
            if (el) el.value = '';
        });
        
        alert('🎁 Ponto de Melhoria e Maquinário adquiridos!\n\n💸 R$ 2.700 descontados do seu caixa.\n🏭 +R$ 3.000 adicionados ao Maquinário do Inventário.\n⭐ Você agora possui um novo Ponto de Brinde para usar em qualquer Melhoria Estratégica.');
        return;
    }
    
    // Código genérico
    state.pixCode = pixCode;
    document.getElementById('pix-status').style.color = '#2ecc71';
    document.getElementById('pix-status').innerText = `✅ Chave PIX ${pixCode} confirmada!`;
}

window.toggleAutoDebit = function() {
    state.bank.autoDebit = !state.bank.autoDebit;
    updateBankUI();
}

window.confirmConsortium = function() {
    const amount = parseFloat(document.getElementById('consortium-amount').value) || 0;
    const radioBtn = document.querySelector('input[name="consortium-installments"]:checked');
    if (!radioBtn) return;
    const installments = parseInt(radioBtn.value);
    
    if (amount < 1000) {
        alert("O valor mínimo do consórcio é R$ 1.000,00");
        return;
    }
    
    const adminFee = amount * 0.005;
    if (state.money < adminFee) {
        alert("Saldo insuficiente para pagar a taxa de administração!");
        return;
    }
    
    if (confirm(`Confirma a contratação deste consórcio?\n\nValor: R$ ${amount.toLocaleString()}\nParcelas: ${installments}x R$ ${(amount/installments).toLocaleString()}\nTaxa de Adm (0,5%): R$ ${adminFee.toLocaleString()}`)) {
        updateMoney(-adminFee, "Taxa Adm Consórcio");
        
        state.bank.consortiums.push({
            id: 'cons_' + Date.now(),
            totalValue: amount,
            installmentValue: amount / installments,
            totalInstallments: installments,
            installmentsLeft: installments,
            isDrawn: false
        });
        
        alert("Consórcio contratado com sucesso!");
        updateBankUI();
    }
}

window.bidConsortium = function(id) {
    const consortium = state.bank.consortiums.find(c => c.id === id);
    if (!consortium || consortium.isDrawn) return;
    
    const count = parseInt(prompt(`🔨 LANCE NO CONSÓRCIO\n\nQuantas parcelas deseja ofertar como lance? (Máx: ${consortium.installmentsLeft})\nVALOR POR PARCELA: R$ ${consortium.installmentValue.toLocaleString()}`));
    
    if (isNaN(count) || count <= 0) return;
    if (count > consortium.installmentsLeft) {
        alert("Você não pode ofertar mais parcelas do que o restante!");
        return;
    }
    
    const totalCost = count * consortium.installmentValue;
    if (state.money < totalCost) {
        alert("Saldo insuficiente para cobrir o lance!");
        return;
    }
    
    if (confirm(`Confirma o lance de R$ ${totalCost.toLocaleString()} (${count} parcelas)?`)) {
        updateMoney(-totalCost, "Lance no Consórcio");
        consortium.installmentsLeft -= count;
        
        // Threshold para contemplação imediata: Aumentado para 50% (mais difícil)
        const threshold = Math.ceil(consortium.totalInstallments * 0.5);
        const totalPaid = consortium.totalInstallments - consortium.installmentsLeft;
        
        // Regra do Lance: Se o lance for >= 50% do total, tem 70% de chance de contemplar agora
        if (count >= threshold) {
            if (Math.random() < 0.7) { // 70% de chance para lances altos
                consortium.isDrawn = true;
                updateMoney(consortium.totalValue, "Contemplação por Lance");
                alert(`🎊 LANCE VENCEDOR! Seu consórcio foi contemplado imediatamente!\nRecebido: R$ ${consortium.totalValue.toLocaleString()}`);
            } else {
                alert(`Lance aceito! Apesar da oferta generosa, você não foi sorteado nesta rodada. Suas parcelas restantes foram reduzidas para ${consortium.installmentsLeft}.`);
            }
        } else if (consortium.installmentsLeft === 0) {
            // Garantia de recebimento no final
            consortium.isDrawn = true;
            updateMoney(consortium.totalValue, "Quitação Consórcio");
            alert(`✅ CONCLUÍDO! Com o pagamento da última parcela, seu consórcio foi liberado.\nRecebido: R$ ${consortium.totalValue.toLocaleString()}`);
        } else {
            alert(`Lance aceito! Seu saldo devedor foi reduzido. Faltam agora ${consortium.installmentsLeft} parcelas.`);
        }
        
        updateBankUI();
    }
}

function updateConsortiumPreview() {
    const amountInput = document.getElementById('consortium-amount');
    const feeEl = document.getElementById('consortium-fee');
    const instEl = document.getElementById('consortium-installment-val');
    
    if (!amountInput || !feeEl || !instEl) return;
    
    const amount = parseFloat(amountInput.value) || 0;
    const radioBtn = document.querySelector('input[name="consortium-installments"]:checked');
    const installments = radioBtn ? parseInt(radioBtn.value) : 1;
    
    feeEl.innerText = `R$ ${(amount * 0.005).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    instEl.innerText = `R$ ${(amount / installments).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function updateLoanPreview() {
    const amount = parseFloat(UI.loanAmount.value) || 0;
    const installments = parseInt(document.querySelector('input[name="loan-installments"]:checked').value);
    
    // NOVO: Escudo de Confiança (Redução de 50% na taxa se tiver investimentos)
    let rate = 0.05 + (installments / 100);
    const hasConfidenceShield = state.bank.investments.length > 0;
    if (hasConfidenceShield) rate *= 0.5;
    
    const total = amount * (1 + rate);
    const perMonth = total / installments;
    
    const shieldText = hasConfidenceShield ? ' <span style="color: #2ecc71; font-size: 0.7rem;">(Escudo de Confiança Ativo -50%)</span>' : '';
    document.getElementById('loan-rate').innerHTML = `${(rate * 100).toFixed(1)}%${shieldText}`;
    document.getElementById('loan-total').innerText = `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('loan-installment-val').innerText = `R$ ${perMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function updateInvestPreview() {
    const amount = parseFloat(UI.investAmount.value) || 0;
    const duration = parseInt(UI.investDuration.value) || 0;
    const rate = 0.03 + (duration * 0.005);
    
    const final = amount * (1 + rate);
    
    document.getElementById('invest-rate').innerText = `${(rate * 100).toFixed(1)}%`;
    document.getElementById('invest-total').innerText = `R$ ${final.toFixed(2)}`;
}

function confirmLoan() {
    const amount = parseFloat(UI.loanAmount.value);
    const installments = parseInt(document.querySelector('input[name="loan-installments"]:checked').value);
    
    if (state.bank.isDefaulting) {
        alert("❌ CRÉDITO BLOQUEADO! O banco não libera novos valores para empresas com parcelas em atraso.");
        return;
    }
    
    if (isNaN(amount) || amount < 100) {
        alert(t("loan_min_amount"));
        return;
    }
    
    if (amount > state.bank.creditLimit) {
        alert(t("loan_limit_exceeded", { limit: state.bank.creditLimit }));
        return;
    }
    
    // Aplicar Escudo de Confiança no cálculo final também
    let rate = 0.05 + (installments / 100);
    if (state.bank.investments.length > 0) rate *= 0.5;
    
    const total = amount * (1 + rate);
    
    updateMoney(amount, "extrato_loan_received");
    state.bank.loans.push({
        amount: amount,
        totalToPay: total,
        remainingInstallments: installments,
        installmentVal: total / installments
    });
    
    alert(t("alert_loan_success", { amount, installments }));
    UI.loanAmount.value = '';
    updateHUD();
    updateBankUI();
}

function confirmInvest() {
    const amount = parseFloat(UI.investAmount.value);
    const duration = parseInt(UI.investDuration.value);
    
    if (isNaN(amount) || amount < 50) {
        alert(t("invest_min_amount"));
        return;
    }
    
    if (amount > state.money) {
        alert(t("alert_no_funds"));
        return;
    }
    
    if (isNaN(duration) || duration < 1 || duration > 50) {
        alert(t("invest_rounds_limit") || "O prazo de investimento deve ser entre 1 e 50 rodadas.");
        return;
    }
    
    const rate = 0.03 + (duration * 0.005);
    const finalVal = amount * (1 + rate);
    
    updateMoney(-amount, "extrato_invest_made");
    state.bank.investments.push({
        amount: amount,
        finalVal: finalVal,
        remainingRounds: duration
    });
    
    alert(t("alert_invest_success", { amount, rounds: duration }));
    UI.investAmount.value = '';
    UI.investDuration.value = '';
    updateHUD();
    updateBankUI();
}

function updateBankUI() {
    const bankBalanceEl = document.getElementById('bank-balance-val');
    const isNegative = state.money < 0;
    const absVal = Math.abs(state.money).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    bankBalanceEl.innerText = (isNegative ? '-R$ ' : 'R$ ') + absVal;
    bankBalanceEl.classList.toggle('negative-money', isNegative);
    
    const totalDebt = state.bank.loans.reduce((acc, l) => acc + (l.installmentVal * l.remainingInstallments), 0);
    document.getElementById('bank-debt-val').innerText = `R$ ${totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    
    const totalYield = state.bank.investments.reduce((acc, i) => acc + (i.finalVal - i.amount), 0);
    document.getElementById('bank-yield-val').innerText = `R$ ${totalYield.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    
    const limitEl = document.getElementById('loan-available-limit');
    if (limitEl) {
        limitEl.innerText = `R$ ${(state.bank.creditLimit || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }
    
    // Pontos de Brinde no painel de Investimentos
    const investBonusPtsEl = document.getElementById('invest-bonus-points');
    if (investBonusPtsEl) investBonusPtsEl.innerText = state.bonusPoints || 0;

    const list = document.getElementById('bank-active-items');
    list.innerHTML = `<h4>${t("active_items_title")}</h4>`;
    
    if (state.bank.loans.length === 0 && state.bank.investments.length === 0) {
        list.innerHTML += `<p style="color: grey; font-style: italic;">${t("no_active_items")}</p>`;
    }
    
    state.bank.loans.forEach((l, index) => {
        const isBoleto = l.owner ? true : false;
        const displayLabel = isBoleto
            ? `📜 Boleto - ${l.owner}`
            : `${t("loan_label")} #${index + 1}`;

        list.innerHTML += `
            <div class="bank-item">
                <div class="bank-item-info">
                    <h4>${displayLabel}</h4>
                    <p>${t("loan_installment_val")}: R$ ${l.installmentVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div class="bank-item-status">
                    <span class="amount">R$ ${(l.installmentVal * l.remainingInstallments).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span class="rounds">${l.remainingInstallments} ${t("loan_installments_label")}</span>
                </div>
            </div>
        `;
    });
    
    state.bank.investments.forEach((inv, index) => {
        list.innerHTML += `
            <div class="bank-item">
                <div class="bank-item-info">
                    <h4>${t("invest_label")} #${index + 1}</h4>
                    <p>${t("invest_amount_label")}: R$ ${inv.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div class="bank-item-status" style="color: #2ecc71;">
                    <span class="amount">R$ ${inv.finalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span class="rounds">${t("receives_in", { rounds: inv.remainingRounds })}</span>
                </div>
            </div>
        `;
    });
    
    state.bank.consortiums.forEach(c => {
        const statusText = c.isDrawn ? '<span style="color: #2ecc71;">CONTEMPLADO ✅</span>' : '<span style="color: #f1c40f;">Aguardando Sorteio ⏳</span>';
        const bidBtn = !c.isDrawn ? `<button class="action-btn" style="font-size: 0.65rem; padding: 4px 8px; margin-top: 8px; background: linear-gradient(135deg, #f39c12, #d35400); border:none; box-shadow: 0 2px 5px rgba(243,156,18,0.3);" onclick="window.bidConsortium('${c.id}')">🔨 DAR UM LANCE</button>` : '';

        list.innerHTML += `
            <div class="active-item-card consortium">
                <div class="item-header">
                    <span><b>Consórcio Corporativo</b></span>
                    ${statusText}
                </div>
                <div class="item-details">
                    <span>Total: R$ ${c.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span>Parcela: R$ ${c.installmentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span>Progresso: ${c.totalInstallments - c.installmentsLeft}/${c.totalInstallments}</span>
                    ${bidBtn}
                </div>
            </div>
        `;
    });
    
    // Update credit limit based on 60% of Total Inventory + Auto-Debit Bonus (30%)
    const invTotal = (state.inventory.warehouse || 0) + 
                     (state.inventory.machinery || 0) + 
                     (state.inventory.packaging || 0) + 
                     (state.inventory.rawMaterials || 0) + 
                     (state.inventory.finishedGoods || 0) + 
                     (state.inventory.fleet || 0);

    const baseLimit = Math.round(invTotal * 0.6);
    state.bank.creditLimit = state.bank.autoDebit ? Math.round(baseLimit * 1.3) : baseLimit;

    // Update Auto-Debit Status Button
    const btnToggle = document.getElementById('btn-toggle-autodebit');
    if (btnToggle) {
        if (state.bank.autoDebit) {
            btnToggle.innerText = 'ATIVADO ✅';
            btnToggle.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
            btnToggle.style.borderColor = '#2ecc71';
            btnToggle.style.color = '#fff';
            btnToggle.style.boxShadow = '0 0 10px rgba(46, 204, 113, 0.3)';
        } else {
            btnToggle.innerText = 'DESATIVADO ❌';
            btnToggle.style.background = 'rgba(0,0,0,0.1)';
            btnToggle.style.borderColor = 'rgba(255,255,255,0.2)';
            btnToggle.style.color = '#8b949e';
            btnToggle.style.boxShadow = 'none';
        }
    }
}

function processBankTurn() {
    // Process Loans
    let debtToPay = 0;
    state.bank.isDefaulting = false; // Reset temporary para checagem
    state.bank.loans = state.bank.loans.filter(loan => {
        if (state.money >= loan.installmentVal) {
            updateMoney(-loan.installmentVal, "extrato_loan_payment");
            loan.remainingInstallments--;
            console.log(`Paga parcela de R$ ${loan.installmentVal}`);
            return loan.remainingInstallments > 0;
        } else {
            // CALOTE: Aplica penalidade de 20% no montante total daquele empréstimo
            const penalty = loan.installmentVal * 1.2;
            loan.installmentVal = penalty; // Aumenta valor da parcela pela mora
            state.bank.isDefaulting = true; // Bloqueia novos créditos
            alert(`⚠️ INADIMPLÊNCIA NO BANCO! Saldo insuficiente para pagar a parcela. Multa de 20% aplicada e crédito bloqueado.`);
            return true; 
        }
    });

    // Process Investments
    state.bank.investments = state.bank.investments.filter(inv => {
        inv.remainingRounds--;
        if (inv.remainingRounds <= 0) {
            updateMoney(inv.finalVal, "extrato_invest_return");
            alert(t("alert_invest_matured", { amount: inv.amount, total: inv.finalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }));
            return false;
        }
        return true;
    });

    // Process Consortiums
    for (let i = state.bank.consortiums.length - 1; i >= 0; i--) {
        const c = state.bank.consortiums[i];
        
        // Pagamento da Parcela
        if (state.money >= c.installmentValue) {
            updateMoney(-c.installmentValue, "Parcela Consórcio");
            c.installmentsLeft--;
            
            // Lógica de Sorteio (Contemplação)
            if (!c.isDrawn) {
                // Chance proporcional: 1 chance em installments totais por rodada
                const drawChance = 1 / c.totalInstallments;
                if (Math.random() < drawChance || c.installmentsLeft === 0) {
                    c.isDrawn = true;
                    updateMoney(c.totalValue, "Contemplação Consórcio");
                    alert(`🎊 PARABÉNS! Seu consórcio de R$ ${c.totalValue.toLocaleString()} foi CONTEMPLADO! O valor integral foi creditado em sua conta.`);
                }
            }
            
            if (c.installmentsLeft <= 0) {
                state.bank.consortiums.splice(i, 1);
            }
        } else {
            console.warn("Saldo insuficiente para parcela do consórcio.");
        }
    }

    updateHUD();
    updateBankUI();
}

/* --- E-mail System Logic --- */

window.openEmail = function() {
    const isHidden = UI.emailModal.classList.contains('hidden');
    closeAllModals();
    if (isHidden) {
        state.emailTaskActive = false; // Clear notification
        updateHUD(); 
        window.switchEmailFolder('inbox'); // Start at inbox
        
        UI.emailModal.classList.remove('hidden');
        UI.emailModal.classList.add('restoring');
        document.body.classList.add('modal-active');
        
        setTimeout(() => {
            UI.emailModal.classList.remove('restoring');
        }, 400);
    }
}

window.closeEmail = function() {
    if (UI.emailModal.classList.contains('hidden')) return;

    // Adiciona classe de animação
    UI.emailModal.classList.add('minimizing');
    
    // Aguarda animação de 350ms antes de esconder de fato
    setTimeout(() => {
        UI.emailModal.classList.add('hidden');
        UI.emailModal.classList.remove('minimizing');
        updateTickerVisibility();
        document.body.classList.remove('modal-active');
    }, 350);
}

window.switchEmailFolder = function(folder) {
    state.currentEmailFolder = folder;
    
    // Update sidebar buttons
    document.querySelectorAll('.retro-folder-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText.toLowerCase().includes(folder === 'inbox' ? 'entrada' : folder === 'outbox' ? 'saída' : folder === 'compose' ? 'escrever' : 'lixeira')) {
            btn.classList.add('active');
        }
    });

    if (folder === 'inbox' && (state.emailTaskActive || state.emailAlertRounds > 0)) {
        state.emailTaskActive = false; // Limpa o alerta da HUD assim que entra na Entrada
        state.emailAlertRounds = 0; // Limpa contagem de negligência
        updateHUD();
    }

    renderEmails();
}

function renderEmails() {
    const list = document.getElementById('email-list');
    const header = document.getElementById('email-list-header');
    if (!list || !header) return;
    
    list.innerHTML = '';
    header.style.display = 'flex';

    const composeBtn = document.getElementById('btn-compose-email');
    const inboxBtn = document.getElementById('btn-inbox-email');

    if (composeBtn) {
        if (state.stats.correctAnswers >= 3 && state.currentEmailFolder !== 'compose' && !state.machineryTaskSeen) {
            composeBtn.classList.add('retro-flash');
        } else {
            composeBtn.classList.remove('retro-flash');
        }
    }

    if (inboxBtn) {
        // Pisca amarelo de forma épica se tiver resposta de máquinas não lida
        if (state.machineryEmailReplied && !state.machineryReplySeen) {
            inboxBtn.classList.add('retro-flash-yellow');
        } else {
            inboxBtn.classList.remove('retro-flash-yellow');
            inboxBtn.classList.remove('retro-flash');
        }
    }

    if (state.currentEmailFolder === 'compose') {
        renderCompose();
        return;
    }

    let source = [];
    if (state.currentEmailFolder === 'inbox') {
        if (state.emails.length === 0) {
            state.emails.push({
                id: 'welcome',
                from: 'CEO SAP Game',
                subject: 'Bem-vindo ao Sistema!',
                content: 'Olá! Sou o CEO. Parabéns por iniciar sua fábrica! Use este sistema para receber comunicados oficiais.',
                date: new Date().toLocaleDateString()
            });
        }
        source = state.emails;
    } else if (state.currentEmailFolder === 'outbox') {
        source = state.emailOutbox;
    } else if (state.currentEmailFolder === 'trash') {
        source = state.emailTrash;
    }

    if (source.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 40px; color: #808080; font-family: 'Press Start 2P'; font-size: 8px;">Pasta vazia.</div>`;
        return;
    }

    source.forEach(email => {
        const displayName = (state.currentEmailFolder === 'outbox' || (state.currentEmailFolder === 'trash' && email.to)) 
            ? `PARA: ${email.to}` 
            : email.from;

        const isUnreadReply = (email.subject === "Re: Comprar máquinas" && !state.machineryReplySeen);
        const blinkClass = isUnreadReply ? 'retro-item-blink' : '';

        list.innerHTML += `
            <div class="retro-email-item ${blinkClass}" onclick="viewEmail('${email.id}')">
                <div style="flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-right: 10px;">
                    <b>${displayName}</b> - ${email.subject}
                </div>
                <div style="width: 80px; text-align: right; color: #666;">
                    ${email.date}
                </div>
            </div>
        `;
    });
}

function renderCompose() {
    const list = document.getElementById('email-list');
    const header = document.getElementById('email-list-header');
    header.style.display = 'none';
    list.style.textAlign = 'left'; // Garante alinhamento à esquerda no compose

    const contacts = [
        "Suporte Técnico",
        "Tião Cascudo Eletricista",
        "Máquinas industriais usadas",
        "Leilão do Wagner",
        "RF Transportes",
        "Zeti Pedreiro",
        "Forró do Luizão",
        "Dra. Aline advogada",
        "Banco Corporativo",
        "Consultoria RH",
        "Diretor Comercial",
        "Marketing Digital"
    ];

    let contactOptions = contacts.map(c => {
        let style = "";
        let prefix = "";
        let classes = "";
        if (c === "Máquinas industriais usadas" && state.stats.correctAnswers >= 3 && !state.machineryTaskSeen) {
            style = 'style="font-weight: bold; color: #000080;"';
            prefix = "⭐ ";
            classes = 'data-blink="true"';
        } else if (c === "Máquinas industriais usadas") {
            style = 'style="font-weight: bold; color: #000080;"';
            prefix = "⭐ ";
        }
        return `<option value="${c}" ${style} ${classes}>${prefix}${c}</option>`;
    }).join('');
    
    list.innerHTML = `
        <div style="padding: 10px; font-family: 'Press Start 2P';">
            <label class="retro-label">PARA:</label>
            <select id="mail-to" class="retro-input-inset" style="height: 35px; padding: 2px;" onchange="window.updateMailSubject()">
                ${contactOptions}
            </select>
            
            <label class="retro-label">ASSUNTO:</label>
            <div id="mail-subject-container">
                <input type="text" id="mail-subject" class="retro-input-inset" placeholder="Assunto da mensagem...">
            </div>
            
            <label class="retro-label">MENSAGEM:</label>
            <textarea id="mail-content" class="retro-input-inset" style="height: 120px; resize: none;" placeholder="Escreva aqui..."></textarea>
            
            <div style="text-align: right;">
                <button class="action-btn" onclick="window.sendEmail()" style="font-size: 10px; border-radius: 0;">💾 ENVIAR AGORA</button>
            </div>
        </div>
    `;
    window.initBlinkingOptions();
}

window.initBlinkingOptions = function() {
    const optTo = document.querySelector('option[data-blink="true"]');
    if (optTo && !optTo.dataset.blinkStarted) {
        optTo.dataset.blinkStarted = "true";
        let state = true;
        const interval = setInterval(() => {
            if (!document.body.contains(optTo)) { clearInterval(interval); return; }
            optTo.style.color = state ? "#cccccc" : "#444444"; // Toggle light/dark grey
            state = !state;
        }, 400);
    }

    const optSub = document.querySelector('option[data-blink-subject="true"]');
    if (optSub && !optSub.dataset.blinkStarted) {
        optSub.dataset.blinkStarted = "true";
        let state = true;
        const interval = setInterval(() => {
            if (!document.body.contains(optSub)) { clearInterval(interval); return; }
            optSub.style.color = state ? "#cccccc" : "#444444"; // Toggle light/dark grey
            state = !state;
        }, 400);
    }
}

window.updateMailSubject = function() {
    const to = document.getElementById('mail-to').value;
    const container = document.getElementById('mail-subject-container');
    const content = document.getElementById('mail-content');
    
    if (to === "Máquinas industriais usadas") {
        if (state.stats.correctAnswers < 3) {
            container.innerHTML = `<input type="text" id="mail-subject" class="retro-input-inset" value="🔒 BLOQUEADO: Acerte 3 questões" disabled style="color: #ff3860;">`;
            if (content) {
                content.value = "⚠️ Você precisa de mais conhecimento (3 acertos) para negociar máquinas industriais.";
                content.disabled = true;
            }
            return;
        }

        if (content) content.disabled = false;
        container.innerHTML = `
            <select id="mail-subject" class="retro-input-inset" style="height: 35px; padding: 2px;" onchange="window.handleSubjectChange()">
                <option value="">Escolha o assunto...</option>
                <option value="Comprar máquinas" style="font-weight: bold; color: #000080;" ${!state.machineryTaskSeen ? 'data-blink-subject="true"': ''}>⭐ Comprar máquinas</option>
                <option value="Vender máquinas">Vender máquinas</option>
            </select>
        `;
        window.initBlinkingOptions();
    } else {
        if (content) {
            content.disabled = false;
            content.value = "";
        }
        container.innerHTML = `<input type="text" id="mail-subject" class="retro-input-inset" placeholder="Assunto da mensagem...">`;
    }
}

window.handleSubjectChange = function() {
    const subject = document.getElementById('mail-subject').value;
    const content = document.getElementById('mail-content');
    
    if (subject === "Comprar máquinas") {
        content.value = `Olá,\n\nEstou à procura de equipamentos para fabricação de calçados, especificamente uma prensa e duas máquinas de costura industrial.\n\nCaso tenha disponíveis, poderia me enviar informações sobre o estado, valores e condições de pagamento?\n\nFico no aguardo.\n\nAtenciosamente,\nVinícius`;
        content.disabled = true; // Lock the automated message
        
        // Mark as seen and clear notifications
        state.machineryTaskSeen = true;
        state.emailTaskActive = false;
        updateHUD();
        // Delay a bit or just re-render sidebar in renderEmails
        const composeBtn = document.getElementById('btn-compose-email');
        if (composeBtn) composeBtn.classList.remove('retro-flash');

    } else if (subject === "Vender máquinas") {
        content.value = "";
        content.disabled = false; // Allow manual entry for selling
    } else {
        content.value = "";
        content.disabled = false; // Allow manual entry
    }
}

window.sendEmail = function() {
    const to = document.getElementById('mail-to').value;
    const subject = document.getElementById('mail-subject').value;
    const content = document.getElementById('mail-content').value;

    if (!subject || !content) {
        alert("Por favor, preencha o assunto e a mensagem!");
        return;
    }

    if (to === "Máquinas industriais usadas" && subject === "Comprar máquinas") {
        state.machineryEmailSentRound = state.pos;
        console.log("Início do timer de resposta de máquinas: ", state.machineryEmailSentRound);
    }

    state.emailOutbox.push({
        id: 'sent_' + Date.now(),
        to: to,
        subject: subject,
        content: content,
        date: new Date().toLocaleDateString()
    });

    alert("MENSAGEM ENVIADA !");
    window.switchEmailFolder('outbox');
}

window.viewEmail = function(id) {
    let email = state.emails.find(e => e.id === id) || 
                state.emailOutbox.find(e => e.id === id) || 
                state.emailTrash.find(e => e.id === id);
    
    if (!email) return;

    if (email.subject === "Re: Comprar máquinas") {
        state.machineryReplySeen = true;
        state.emailTaskActive = false;
        updateHUD();
        // Não chamamos renderEmails aqui pois o conteúdo do e-mail já está sendo renderizado abaixo
    }

    const list = document.getElementById('email-list');
    const header = document.getElementById('email-list-header');
    header.style.display = 'none';

    list.innerHTML = `
        <div style="padding: 15px; font-family: 'Press Start 2P'; color: #000; text-align: left;">
            <div style="border-bottom: 2px solid #808080; padding-bottom: 10px; margin-bottom: 15px;">
                <div style="font-size: 10px; margin-bottom: 5px;"><b>DE/PARA:</b> ${email.from || email.to}</div>
                <div style="font-size: 10px; margin-bottom: 5px;"><b>ASSUNTO:</b> ${email.subject}</div>
                <div style="font-size: 8px; color: #666;">DATA: ${email.date}</div>
            </div>
            <div style="font-size: 10px; line-height: 1.6; white-space: pre-wrap; background: #f0f0f0; padding: 10px; border: 1px inset #fff;">
                ${email.content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color: blue; text-decoration: underline;">$1</a>')}
            </div>
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                ${state.currentEmailFolder !== 'trash' ? `<button class="retro-folder-btn" style="width: auto; background: #ffcccc;" onclick="window.trashEmail('${email.id}')">🗑️ EXCLUIR</button>` : ''}
                <button class="retro-folder-btn" style="width: auto;" onclick="window.switchEmailFolder('${state.currentEmailFolder}')">🔙 VOLTAR</button>
            </div>
        </div>
    `;
}

window.trashEmail = function(id) {
    let folder = state.emails.find(e => e.id === id) ? 'emails' : 'emailOutbox';
    let idx = state[folder].findIndex(e => e.id === id);
    
    if (idx !== -1) {
        let email = state[folder].splice(idx, 1)[0];
        state.emailTrash.push(email);
        alert("E-mail movido para a lixeira.");
        renderEmails();
    }
}

// Removed invalid export aliases

// --- Strategic Investments Logic ---

window.openInvestments = function() {
    const isHidden = UI.investModal.classList.contains('hidden');
    closeAllModals();
    if (isHidden) {
        updateInvestUI();
        UI.investModal.classList.remove('hidden');
        document.body.classList.add('modal-active');
    }
}

window.closeInvest = function() {
    UI.investModal.classList.add('hidden');
    updateTickerVisibility();
    document.body.classList.remove('modal-active');
}

/* --- Expenses Logic --- */
window.openExpenses = function() {
    const isHidden = UI.expensesModal.classList.contains('hidden');
    closeAllModals();
    if (isHidden) {
        updateExpensesUI();
        UI.expensesModal.classList.remove('hidden');
        forceScrollToTop(); // Adicionado para garantir visibilidade do topo
        document.body.classList.add('modal-active');
    }
}

window.closeExpenses = function() {
    if (UI.expensesModal) UI.expensesModal.classList.add('hidden');
    updateTickerVisibility();
    document.body.classList.remove('modal-active');
}

/* --- Inventory Logic --- */
window.openInventory = function() {
    const isHidden = UI.inventoryModal.classList.contains('hidden');
    closeAllModals();
    if (isHidden) {
        updateInventoryUI();
        UI.inventoryModal.classList.remove('hidden');
        document.body.classList.add('modal-active');
    }
}

function getUpgradeCost(area, level) {
    const config = GAME_CONFIG[state.difficulty] || GAME_CONFIG.NORMAL;
    const costs = config.upgradeCosts[area];
    const actualLevel = Math.min(level, costs.length - 1);
    return costs[actualLevel];
}

function calculatePassiveRevenue(upgrades) {
    const config = GAME_CONFIG[state.difficulty] || GAME_CONFIG.NORMAL;
    
    const baseRevenues = {
        infra: upgrades.infra * config.passiveRevenue.infra,
        machines: upgrades.machines * config.passiveRevenue.machines,
        training: upgrades.training * config.passiveRevenue.training,
        marketing: upgrades.marketing * config.passiveRevenue.marketing,
        logistics: upgrades.logistics * config.passiveRevenue.logistics
    };
    
    let totalRevenue = Object.values(baseRevenues).reduce((a, b) => a + b, 0);
    
    // SINERGIA 1: Infra + Machines = 15% bonus
    if (upgrades.infra > 0 && upgrades.machines > 0) {
        totalRevenue += (baseRevenues.infra + baseRevenues.machines) * 0.15;
    }
    // SINERGIA 2: Marketing + Training = 12% bonus
    if (upgrades.marketing > 0 && upgrades.training > 0) {
        totalRevenue += (baseRevenues.marketing + baseRevenues.training) * 0.12;
    }
    // SINERGIA 3: Logistics aplica 8% a TUDO
    if (upgrades.logistics > 0) {
        totalRevenue += totalRevenue * 0.08;
    }
    
    return Math.round(totalRevenue);
}

function updateInvestUI() {
    let totalRevenue = calculatePassiveRevenue(state.upgrades);
    const config = GAME_CONFIG[state.difficulty] || GAME_CONFIG.NORMAL;
    const isPromoRound = (state.pos > 0 && state.pos % 5 === 0);
    const promoAvailable = isPromoRound && (state.lastFreeInvestTurn !== state.pos);

    Object.keys(STRATEGIC_DATA).forEach(area => {
        const level = state.upgrades[area];
        const card = document.querySelector(`.invest-card[data-area="${area}"]`);
        if (!card) return;

        let nextCost = getUpgradeCost(area, level);
        const currentRevenue = level * config.passiveRevenue[area];

        card.querySelector('.invest-level').innerText = `${t('level')} ${level}`;
        
        // Especial para todos os pilares estratégicos (30 níveis)
        const isThirtyLevel = (area === 'infra' || area === 'machines' || area === 'marketing' || area === 'training' || area === 'logistics' || area === 'consultants');
        if (isThirtyLevel) {
            const grid = card.querySelector('.progress-bar-grid');
            if (grid) {
                grid.innerHTML = '';
                for (let i = 0; i < 30; i++) {
                    const bar = document.createElement('div');
                    bar.className = 'bar-segment';
                    if (i < level) {
                        bar.classList.add('filled');
                        // Cor diferente para cada barra usando HSL (Arco-íris)
                        const hue = (i * 12) % 360;
                        bar.style.setProperty('--bar-color', `hsl(${hue}, 80%, 55%)`);
                    }
                    grid.appendChild(bar);
                }
            }
        } else {
            const benefitTag = card.querySelector('.benefit-tag');
            if (benefitTag) {
                benefitTag.innerHTML = `+ R$ ${currentRevenue} <span data-t="per_round">${t('per_round')}</span>`;
            }
        }
        
        const btn = card.querySelector('.upgrade-btn');
        if (btn) {
            const maxLevel = isThirtyLevel ? 30 : 6;
            const hasBonus = state.bonusPoints > 0;

            if (hasBonus) {
                btn.innerText = t('btn_upgrade_bonus');
                btn.disabled = level >= maxLevel;
                btn.style.boxShadow = "0 0 15px #f1c40f";
                btn.style.border = "1px solid #f1c40f";
            } else if (promoAvailable) {
                btn.innerText = t('btn_upgrade_free');
                btn.disabled = level >= maxLevel;
                btn.style.boxShadow = "0 0 15px #f1c40f";
                btn.style.border = "none";
            } else {
                btn.innerText = `${t('btn_upgrade')} (R$ ${nextCost})`;
                btn.disabled = state.money < nextCost || level >= maxLevel;
                btn.style.boxShadow = "none";
                btn.style.border = "none";
            }
        }
    });

    // Atualiza Pontos de Brinde no painel de Melhorias
    const investBonusPtsEl = document.getElementById('invest-bonus-points');
    if (investBonusPtsEl) investBonusPtsEl.innerText = state.bonusPoints || 0;
}


window.upgradeArea = function(area) {
    const level = state.upgrades[area];
    let cost = getUpgradeCost(area, level);
    
    // Prioridade 1: Pontos de Brinde
    const usingBonus = state.bonusPoints > 0;
    
    // Lógica de Promoção Grátis (1 por rodada a cada 5 rodadas)
    const isPromoRound = (state.pos > 0 && state.pos % 5 === 0);
    const usingPromo = !usingBonus && isPromoRound && (state.lastFreeInvestTurn !== state.pos);

    if (usingBonus) {
        if (!confirm(`Deseja usar 1 Ponto de Brinde para melhorar ${STRATEGIC_DATA[area].name} gratuitamente?`)) return;
        cost = 0;
        state.bonusPoints--;
    } else if (usingPromo) {
        cost = 0;
        state.lastFreeInvestTurn = state.pos;
        console.log(`Promoção utilizada na rodada ${state.pos} para ${area}`);
    }

    if (state.money >= cost) {
        // Captura o custo original para fins de valorização de inventário (mesmo se usar brinde/promo)
        const nominalCost = getUpgradeCost(area, level);
        
        const reason = usingBonus ? "extrato_upgrade_bonus" : (cost === 0 ? "extrato_upgrade_free" : "extrato_upgrade_" + area);
        updateMoney(-cost, reason);
        state.upgrades[area]++;
        state.stats.investmentsMade++;
        
        // NOVO: Valorização do Galpão (2x o investimento em Infraestrutura)
        if (area === 'infra') {
            state.inventory.warehouse += (nominalCost * 2);
            console.log(`Infraestrutura Nível ${state.upgrades[area]}: Galpão valorizado em R$ ${nominalCost * 2}`);
        }

        // NOVO: Valorização das Máquinas (Reflexo de 1:1 do investimento)
        if (area === 'machines') {
            state.inventory.machinery += nominalCost;
            console.log(`Máquinas Nível ${state.upgrades[area]}: Maquinário valorizado em R$ ${nominalCost}`);
        }

        // NOVO: Valorização da Propaganda (Reflexo de 1:1 do investimento em Produtos Acabados)
        if (area === 'marketing') {
            state.inventory.finishedGoods += nominalCost;
            console.log(`Propaganda Nível ${state.upgrades[area]}: Produtos Acabados valorizados em R$ ${nominalCost}`);
        }

        // NOVO: Valorização do Treinamento (Reflexo de 1:1 do investimento em Matéria-Prima)
        if (area === 'training') {
            state.inventory.rawMaterials += nominalCost;
            console.log(`Treinamento Nível ${state.upgrades[area]}: Matéria-Prima valorizada em R$ ${nominalCost}`);
        }

        // NOVO: Valorização da Logística (Reflexo de 1:1 do investimento em Frota)
        if (area === 'logistics') {
            state.inventory.fleet += nominalCost;
            console.log(`Logística Nível ${state.upgrades[area]}: Frota valorizada em R$ ${nominalCost}`);
        }
        
        alert(t('alert_upgrade_success', { name: t(area + '_name'), level: state.upgrades[area] }));
        updateHUD();
        updateInvestUI();
        updateInventoryUI(); // Garante atualização do modal de inventário
    } else {
        alert(t('alert_no_funds'));
    }
};

// Função Removida: processStrategicTurn() para não gerar receita passiva

/* --- Ticker Tips System --- */
const TICKER_TIPS = [
    "DICA SAP: Sempre verifique seu saldo no Banco antes de fazer novos investimentos.",
    "DICA SAP: O Módulo de Compras (Purchasing) gerencia toda a entrada de fornecedores.",
    "BÔNUS: Responder corretamente aos quizzes no primeiro turno te dá recompensas altas!",
    "DICA SAP: Você pode pegar empréstimos caso fique sem caixa, mas cuidado com os juros!",
    "ESTRATÉGIA: Infraestrutura avançada aumenta massivamente seu lucro por rodada.",
    "DICA SAP: O SAP HANA processa dados em memória para gerar relatórios em segundos.",
    "ESTRATÉGIA: A aba de Investimentos ajuda a escalar seus negócios passivamente.",
    "DICA SAP: O SAP B1 integra todos os departamentos da sua empresa em tempo real."
];
let currentTipIndex = 0;

function initTicker() {
    const tickerEl = document.getElementById('ticker-text');
    if (!tickerEl) return;
    
    tickerEl.textContent = TICKER_TIPS[0];
    
    // Mudar a dica a cada vez que a animação (16s) terminar e recomeçar
    tickerEl.addEventListener('animationiteration', () => {
        // GATILHO: Aviso de Negligência de E-mail (Prioridade 1.5)
        if (state.emailAlertRounds >= 1) {
            tickerEl.textContent = "Manter uma comunicação ágil é essencial — atrasos podem comprometer oportunidades e sua reputação.";
            tickerEl.style.color = "#f39c12"; // Laranja/Amarelo Atenção
            tickerEl.style.textShadow = "0 0 10px rgba(243, 156, 18, 0.4)";
            return;
        }

        // Se houver despesas atrasadas, mostra a mensagem crítica fixamente em vermelho
        if (state.expensesOverdue) {
            tickerEl.textContent = "DICA : Mantenha as despesas sempre em dia para evitar a paralisação da fábrica.";
            tickerEl.style.color = "#ff3860"; // Vermelho Neon
            tickerEl.style.textShadow = "0 0 10px rgba(255, 56, 96, 0.6)";
            return;
        }

        // Restaura cor original (Verde Neon) para dicas normais
        tickerEl.style.color = "#38D31A";
        tickerEl.style.textShadow = "0 0 10px rgba(56, 211, 26, 0.4)";
        
        currentTipIndex = (currentTipIndex + 1) % TICKER_TIPS.length;
        tickerEl.textContent = TICKER_TIPS[currentTipIndex];
    });
}

// Audio System (Synthesizer to avoid external file dependencies)
let audioCtx;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSuccessSound() {
    initAudio();
    audioCtx.resume().then(() => {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine'; // Som suave e limpo
        osc.frequency.setValueAtTime(880, now); // Nota Lá (A5) - Tom de acerto agradável
        
        gain.gain.setValueAtTime(0, now);
        // Ataque e decaimento suaves para um "bip" amigável
        gain.gain.linearRampToValueAtTime(0.2, now + 0.02); 
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3); 
        
        osc.start(now);
        osc.stop(now + 0.4);
    });
}

function playExpenseAlertSound() {
    initAudio();
    audioCtx.resume().then(() => {
        const now = audioCtx.currentTime;
        
        // Som bips duplos de alerta (tipo Windows antigo / Industrial)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1); gain1.connect(audioCtx.destination);
        osc1.type = 'square'; // Som mais áspero para alerta
        osc1.frequency.setValueAtTime(440, now); // Lá 4
        osc1.frequency.setValueAtTime(330, now + 0.15); // Mi 4
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gain1.gain.linearRampToValueAtTime(0, now + 0.3);
        
        osc1.start(now);
        osc1.stop(now + 0.3);
    });
}

function playStartTurnSound() {
    initAudio();
    audioCtx.resume().then(() => {
        const now = audioCtx.currentTime;
        
        // Nota 1 (Dó 5 - C5) - Suave
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now); 
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.15, now + 0.05); // Ataque suave
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.8); // Decaimento longo
        osc1.start(now);
        osc1.stop(now + 0.8);
        
        // Nota 2 (Mi 5 - E5) - Logo em seguida para criar um intervalo harmonioso
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, now + 0.15); 
        gain2.gain.setValueAtTime(0, now + 0.15);
        gain2.gain.linearRampToValueAtTime(0.12, now + 0.2);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.9);
    });
}

/**
 * Novo: Som de introdução cinemático (Action Starters Reveal)
 * Um acorde suave com ondas senoidais e decaimento longo para criar uma 
 * atmosfera profissional e agradável.
 */
function playIntroChime() {
    initAudio();
    audioCtx.resume().then(() => {
        const now = audioCtx.currentTime;
        
        // Nota única, minimalista e extremamente suave
        const notes = [
            440.00  // Lá 4 (A4) - Uma nota "pura" e calma
        ];

        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now); 
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.015, now + 0.2); // Pico de volume ultra-suave
            gain.gain.exponentialRampToValueAtTime(0.005, now + 1.5); // Começa o fade-out (1.5s)
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5); // Desaparece gradualmente (4.5s)
            
            osc.start(now);
            osc.stop(now + 5.0); // Garante que não haja corte brusco
        });
    });
}

/**
 * Novo: Som de notificação de E-mail / Missão
 * Um "ping" duplo suave e cristalino para alertar sobre novas mensagens.
 */
function playEmailNotificationSound() {
    initAudio();
    audioCtx.resume().then(() => {
        const now = audioCtx.currentTime;
        
        // Duas notas rápidas e agudas (Mi 6 e Lá 6) - Estilo sininho
        const notes = [1318.51, 1760.00]; 

        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + (idx * 0.1)); 
            
            gain.gain.setValueAtTime(0, now + (idx * 0.1));
            gain.gain.linearRampToValueAtTime(0.04, now + (idx * 0.1) + 0.05); // Volume suave (0.04)
            gain.gain.exponentialRampToValueAtTime(0.001, now + (idx * 0.1) + 0.4); // Decaimento rápido
            
            osc.start(now + (idx * 0.1));
            osc.stop(now + (idx * 0.1) + 0.4);
        });
    });
}

// End of file
// Finance Modal Functions
window.openFinance = function() {
    const isHidden = UI.financeModal.classList.contains('hidden');
    closeAllModals();
    if (isHidden) {
        renderFinanceiro();
        UI.financeModal.classList.remove('hidden');
        // Pre-select first tab
        switchFicheiroTab('pagar');
        forceScrollToTop();
        document.body.classList.add('modal-active');
    }
}

window.closeFinance = function() {
    UI.financeModal.classList.add('hidden');
    updateTickerVisibility();
    document.body.classList.remove('modal-active');
}

function switchFicheiroTab(fichaName) {
    if (!UI.ficheiroTabs || !UI.ficheiroPanels || !UI.ficheiroContent) return;

    // Remove active da tab anterior e adiciona na nova
    UI.ficheiroTabs.forEach(tab => {
        if (tab.dataset.ficha === fichaName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Esconde os painéis antigos e mostra o novo
    UI.ficheiroPanels.forEach(panel => {
        if (panel.id === `panel-${fichaName}`) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });

    // Troca a borda geral do contêiner baseado na tab ativa
    UI.ficheiroContent.setAttribute('data-active-ficha', fichaName);
}

// Lógica para Contas a Pagar: Pagamento Adiantado com 3% de Desconto
function payAdvance(elementId, amount, name, financeId) {
    const discountPercent = 0.03;
    const discountValue = amount * discountPercent;
    const finalAmount = amount - discountValue;

    if (state.money < finalAmount) {
        alert(t("alert_no_funds"));
        return;
    }

    let confirmMsg = `Deseja pagar ${name} adiantado com 3% de desconto?\n\nValor original: R$ ${amount.toFixed(2)}\nDesconto: - R$ ${discountValue.toFixed(2)}\nTotal a pagar: R$ ${finalAmount.toFixed(2)}`;
    if (translations[state.language] && translations[state.language]["confirm_pay_advance"]) {
        confirmMsg = t("confirm_pay_advance", { 
            name: name,
            amount: amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            discount: discountValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            finalAmount: finalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        });
    }

    if (confirm(confirmMsg)) {
        updateMoney(-finalAmount, t("extrato_pay_advance", { name: name }) || `Pgto Adiantado: ${name} (-3%)`);
        
        // Remove from state
        if (state.finance && state.finance.payables) {
            state.finance.payables = state.finance.payables.filter(p => p.id !== financeId);
        }
        
        renderFinanceiro();
        updateHUD();
    }
}
window.payAdvance = payAdvance;

// Lógica para Contas Vencidas: Pagamento com 5% de Multa
function payLate(elementId, amount, name, financeId) {
    const penaltyPercent = 0.05;
    const penaltyValue = amount * penaltyPercent;
    const finalAmount = amount + penaltyValue;

    if (state.money < finalAmount) {
        alert(t("alert_no_funds"));
        return;
    }

    let confirmMsg = `Deseja quitar ${name} atrasado?\n\nValor original: R$ ${amount.toFixed(2)}\nMulta (+5%): + R$ ${penaltyValue.toFixed(2)}\nTotal a pagar: R$ ${finalAmount.toFixed(2)}`;
    if (translations[state.language] && translations[state.language]["confirm_pay_late"]) {
        confirmMsg = t("confirm_pay_late", { 
            name: name,
            amount: amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            penalty: penaltyValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            finalAmount: finalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        });
    }

    if (confirm(confirmMsg)) {
        updateMoney(-finalAmount, t("extrato_pay_late", { name: name }) || `Pgto em Atraso: ${name} (+5%)`);
        
        // Remove from state
        if (state.finance && state.finance.payables) {
            state.finance.payables = state.finance.payables.filter(p => p.id !== financeId);
        }

        renderFinanceiro();
        updateHUD();
    }
}
window.payLate = payLate;

// Lógica para Contas a Receber: Antecipação com 3% de Taxa
function anticipateReceivable(elementId, amount, name, financeId) {
    const feePercent = 0.03;
    const feeValue = amount * feePercent;
    const finalAmount = amount - feeValue;

    let confirmMsg = `Deseja antecipar o recebimento de ${name}?\n\nValor original: R$ ${amount.toFixed(2)}\nTaxa de Antecipação (-3%): - R$ ${feeValue.toFixed(2)}\nTotal líquido a receber: R$ ${finalAmount.toFixed(2)}`;
    if (translations[state.language] && translations[state.language]["confirm_anticipate"]) {
        confirmMsg = t("confirm_anticipate", { 
            name: name,
            amount: amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            fee: feeValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            finalAmount: finalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        });
    }

    if (confirm(confirmMsg)) {
        updateMoney(finalAmount, t("extrato_anticipate", { name: name }) || `Antecipação: ${name} (-3% taxa)`);
        
        if (state.finance && state.finance.receivables) {
            state.finance.receivables = state.finance.receivables.filter(r => r.id !== financeId);
        }

        renderFinanceiro();
        updateHUD();
    }
}
window.anticipateReceivable = anticipateReceivable;

function protestReceivable(elementId, amount, name, financeId) {
    const feePercent = 0.10;
    const feeValue = amount * feePercent;
    const successChance = 0.60;

    if (state.money < feeValue) {
        alert(t("alert_no_funds"));
        return;
    }

    let confirmMsg = `Deseja protestar o título de ${name}?\n\nCusto de Cartório (10%): R$ ${feeValue.toFixed(2)}\nChance de Recuperação: 60%`;
    if (translations[state.language] && translations[state.language]["confirm_protest"]) {
        confirmMsg = t("confirm_protest", { 
            name: name,
            fee: feeValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        });
    }

    if (confirm(confirmMsg)) {
        updateMoney(-feeValue, t("extrato_protest", { name: name }) || `Protesto de Título: ${name}`);
        
        if (Math.random() < successChance) {
            const netAmount = amount; // O cliente paga o valor total do título (os 10% foram taxa de cartório paga pelo jogador)
            updateMoney(netAmount, `Recebimento após Protesto: ${name}`);
            
            // Remove from state
            if (state.finance && state.finance.receivables) {
                state.finance.receivables = state.finance.receivables.filter(r => r.id !== financeId);
            }
            alert(t("alert_protest_success", { amount: netAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }));
        } else {
            alert(t("alert_protest_fail"));
        }

        renderFinanceiro();
        updateHUD();
    }
}
window.protestReceivable = protestReceivable;

// --- Dynamic Finance Core Engine ---

function generateFinanceId() {
    if (!state.finance) state.finance = { payables: [], receivables: [], nextId: 1 };
    state.finance.nextId = state.finance.nextId || 1;
    return 'fin_' + state.finance.nextId++;
}

function addPayable(name, amount, turns) {
    if (!state.finance) state.finance = { payables: [], receivables: [], nextId: 1 };
    state.finance.payables.push({
        id: generateFinanceId(),
        name: name,
        amount: amount,
        turnsLeft: turns,
        late: false
    });
}

function addReceivable(name, amount, turns) {
    if (!state.finance) state.finance = { payables: [], receivables: [], nextId: 1 };
    state.finance.receivables.push({
        id: generateFinanceId(),
        name: name,
        amount: amount,
        turnsLeft: turns,
        late: false
    });
}

function processFinanceTurn() {
    console.log("processFinanceTurn: Verificando faturas...");
    if (!state.finance || !state.finance.receivables || !state.finance.payables) {
        console.warn("processFinanceTurn: Sistema financeiro não inicializado.");
        return;
    }

    let alertMsgs = [];

    // Processar Recebimentos
    try {
        for (let i = state.finance.receivables.length - 1; i >= 0; i--) {
            let rec = state.finance.receivables[i];
            if (rec.late) continue;
            
            rec.turnsLeft--;
            if (rec.turnsLeft <= 0) {
                // Cliente pagou normalmente ou atrasou? (5% chance default)
                if (Math.random() < 0.05) {
                    rec.late = true;
                    alertMsgs.push(`⚠️ O cliente "${rec.name}" não pagou no prazo. Fatura movida para Recebimentos em Atraso!`);
                } else {
                    updateMoney(rec.amount, `Recebimento: ${rec.name}`);
                    state.finance.receivables.splice(i, 1);
                }
            }
        }
    } catch (e) { console.error("Error processing receivables:", e); }

    // Processar Pagamentos
    try {
        for (let i = state.finance.payables.length - 1; i >= 0; i--) {
            let pay = state.finance.payables[i];
            if (pay.late) {
                pay.amount += (pay.amount * 0.05); // Penalidade contínua
                continue;
            }

            pay.turnsLeft--;
            if (pay.turnsLeft <= 0) {
                pay.late = true;
                alertMsgs.push(`🚨 A conta "${pay.name}" venceu! Movida para Contas Vencidas.`);
            }
        }
    } catch (e) { console.error("Error processing payables:", e); }

    if (alertMsgs.length > 0) {
        alert("Avisos Financeiros (Fecho de Mês):\n\n" + alertMsgs.join("\n"));
    }

    if (UI.financeModal && !UI.financeModal.classList.contains('hidden')) {
        renderFinanceiro();
    }
}

function renderFinanceiro() {
    const listPagar = document.getElementById('list-pagar');
    const listVencidas = document.getElementById('list-vencidas');
    const listReceber = document.getElementById('list-receber');
    const listFaturasVencidas = document.getElementById('list-faturas_vencidas');

    if (!listPagar || !listVencidas || !listReceber || !listFaturasVencidas) return;
    if (!state.finance) return;

    listPagar.innerHTML = '';
    listVencidas.innerHTML = '';
    listReceber.innerHTML = '';
    listFaturasVencidas.innerHTML = '';

    let hasPagar = false;
    let hasVencidas = false;
    let hasReceber = false;
    let hasRecAtraso = false;

    // Render Previsão de Despesas (Fixed game expenses - Ciclo de 5 acertos)
    let isCurrentlyDue = (state.stats.correctAnswers > 0 && state.stats.correctAnswers % 5 === 0);
    let roundsUntilDue;

    if (isCurrentlyDue) {
        if (!state.expensePaid) {
            roundsUntilDue = 0; // Vence agora
        } else {
            roundsUntilDue = 5; // Pago neste ciclo, próximo em 5 acertos
        }
    } else {
        // Calcula quanto falta para o próximo múltiplo de 5 (acertos)
        roundsUntilDue = 5 - (state.stats.correctAnswers % 5);
    }
    
    // Total expense projection based on current state
    const totalExp = calculateTotalExpenses();
    hasPagar = true;
    
    let dueText = roundsUntilDue === 0 ? '<small style="color: #e74c3c;">Vence nesta rodada!</small>' : `<small style="color: #8b949e;">Vence em ${roundsUntilDue} rodada(s) (Previsão)</small>`;
    let btnHtml = roundsUntilDue === 0 
        ? `<button class="action-btn" style="font-size: 0.7rem; padding: 0.4rem 0.8rem; margin: 0; min-width: auto; background: linear-gradient(135deg, #e74c3c, #c0392b); box-shadow: 0 4px 10px rgba(231, 76, 60, 0.3);" onclick="openExpenses()">Pagar Agora</button>`
        : `<button class="action-btn" style="font-size: 0.7rem; padding: 0.4rem 0.8rem; margin: 0; min-width: auto; background: linear-gradient(135deg, #9b59b6, #8e44ad); box-shadow: 0 4px 10px rgba(155, 89, 182, 0.3);" onclick="openExpenses()">Ver Detalhes</button>`;
    
    listPagar.innerHTML += `
        <div class="finance-item pagar" style="border-left-color: ${roundsUntilDue === 0 ? '#e74c3c' : '#9b59b6'};">
            <div>
                <strong style="color: #fff;">Despesas Operacionais</strong><br>
                ${dueText}
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                <div style="color: ${roundsUntilDue === 0 ? '#e74c3c' : '#9b59b6'}; font-weight: bold;">R$ ${totalExp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                ${btnHtml}
            </div>
        </div>`;

    // Render Payables (Dynamic invoices)
    state.finance.payables.forEach(p => {
        if (!p.late) {
            hasPagar = true;
            listPagar.innerHTML += `
                <div class="finance-item pagar" id="${p.id}">
                    <div>
                        <strong style="color: #fff;">${p.name}</strong><br>
                        <small style="color: #8b949e;">Vence em ${p.turnsLeft} rodada(s)</small>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                        <div style="color: #f39c12; font-weight: bold;">R$ ${p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <button class="action-btn" style="font-size: 0.7rem; padding: 0.4rem 0.8rem; margin: 0; min-width: auto; background: linear-gradient(135deg, #f39c12, #d35400); box-shadow: 0 4px 10px rgba(243, 156, 18, 0.3);" onclick="payAdvance('${p.id}', ${p.amount}, '${p.name.replace(/'/g, "\\'")}', '${p.id}')">${t("btn_pay_advance")}</button>
                    </div>
                </div>`;
        } else {
            hasVencidas = true;
            listVencidas.innerHTML += `
                <div class="finance-item vencidas" id="${p.id}">
                    <div>
                        <strong style="color: #fff;">${p.name}</strong><br>
                        <small style="color: #e74c3c;">Vencida!</small>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                        <div style="color: #e74c3c; font-weight: bold;">R$ ${p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <button class="action-btn" style="font-size: 0.7rem; padding: 0.4rem 0.8rem; margin: 0; min-width: auto; background: linear-gradient(135deg, #e74c3c, #c0392b); box-shadow: 0 4px 10px rgba(231, 76, 60, 0.3);" onclick="payLate('${p.id}', ${p.amount}, '${p.name.replace(/'/g, "\\'")}', '${p.id}')">${t("btn_pay_late")}</button>
                    </div>
                </div>`;
        }
    });

    // Render Receivables
    state.finance.receivables.forEach(r => {
        if (!r.late) {
            hasReceber = true;
            listReceber.innerHTML += `
                <div class="finance-item receber" id="${r.id}">
                    <div>
                        <strong style="color: #fff;">${r.name}</strong><br>
                        <small style="color: #8b949e;">Recebimento em ${r.turnsLeft} rodada(s)</small>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                        <div style="color: #2ecc71; font-weight: bold;">R$ ${r.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <button class="action-btn" style="font-size: 0.7rem; padding: 0.4rem 0.8rem; margin: 0; min-width: auto; background: linear-gradient(135deg, #2ecc71, #27ae60); box-shadow: 0 4px 10px rgba(46, 204, 113, 0.3);" onclick="anticipateReceivable('${r.id}', ${r.amount}, '${r.name.replace(/'/g, "\\'")}', '${r.id}')">${t("btn_anticipate")}</button>
                    </div>
                </div>`;
        } else {
            hasRecAtraso = true;
            listFaturasVencidas.innerHTML += `
                <div class="finance-item faturas_vencidas" id="${r.id}">
                    <div>
                        <strong style="color: #fff;">${r.name}</strong><br>
                        <small style="color: #f1c40f;">Pagamento Atrasado pelo Cliente</small>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                        <div style="color: #f1c40f; font-weight: bold;">R$ ${r.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <button class="action-btn" style="font-size: 0.7rem; padding: 0.4rem 0.8rem; margin: 0; min-width: auto; background: linear-gradient(135deg, #f1c40f, #d4ac0d); box-shadow: 0 4px 10px rgba(241, 196, 15, 0.3); color: #000;" onclick="protestReceivable('${r.id}', ${r.amount}, '${r.name.replace(/'/g, "\\'")}', '${r.id}')">${t("btn_protest")}</button>
                    </div>
                </div>`;
        }
    });

    if (!hasPagar) listPagar.innerHTML = `<div style="color:#8b949e; text-align:center; width:100%; font-size: 0.9rem; padding: 10px;">Nenhuma conta a pagar no momento.</div>`;
    if (!hasVencidas) listVencidas.innerHTML = `<div style="color:#8b949e; text-align:center; width:100%; font-size: 0.9rem; padding: 10px;">Nenhuma conta vencida.</div>`;
    if (!hasReceber) listReceber.innerHTML = `<div style="color:#8b949e; text-align:center; width:100%; font-size: 0.9rem; padding: 10px;">Nenhum recebimento provisionado.</div>`;
    if (!hasRecAtraso) {
        listFaturasVencidas.innerHTML = `<div style="color:#8b949e; text-align:center; width:100%; font-size: 0.9rem; padding: 10px;">${t("empty_list_msg")}</div>`;
    }
}

