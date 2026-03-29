// SAP Game - Logic Core

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
    difficulty: 'NORMAL',
    level: 1, // 1: Pequena, 2: Média, 3: Grande
    consultants: 0,
    questions: [],
    currentQuestion: null,
    surpriseShown1: false, // Flag para a questão surpresa 1
    
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
        creditLimit: 2000,
        isDefaulting: false // Bloqueio de novos créditos
    },
    upgrades: {
        infra: 0,
        machines: 0,
        training: 0,
        marketing: 0,
        logistics: 0
    },
    inventory: {
        warehouse: 10000,
        machinery: 0,
        packaging: 800,
        rawMaterials: 0,
        finishedGoods: 780
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
    bgIndex: 0
};

// --- Start Screen Logic (Promoted for priority) ---
let hasStarted = false;
const startJourney = (e) => {
    console.log("startJourney acionado!", e ? e.type : 'manual');
    if (hasStarted) return;
    hasStarted = true;
    if (e && e.type === 'touchstart') e.preventDefault();
    
    try {
        initAudio();
    } catch(err) {
        console.warn('Audio unlock blocked', err);
    }
    
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.style.display = 'none';
            console.log("Splash removido, chamando initGame...");
            initGame();
            initTicker();
        }, 500);
    } else {
        console.warn("Splash screen not found, starting game anyway...");
        initGame();
        initTicker();
    }
};
// Bind to window for onclick fallback
window.startJourney = startJourney;

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
            infra: 150,
            machines: 220,
            training: 100,
            marketing: 160,
            logistics: 180
        },
        upgradeCosts: {
            infra: [500, 625, 781, 976, 1220, 1525],
            machines: [800, 1000, 1280, 1638, 2097, 2684],
            training: [400, 500, 640, 819, 1048, 1342],
            marketing: [600, 750, 960, 1229, 1573, 2016],
            logistics: [700, 875, 1120, 1434, 1835, 2348]
        },
        eventProbabilityBase: 0.15
    }
};

const STRATEGIC_DATA = {
    infra: { name: "Infraestrutura", baseCost: 500, costMult: 1.5, revenue: 100 },
    machines: { name: "Máquinas", baseCost: 800, costMult: 1.6, revenue: 180 },
    training: { name: "Treinamento", baseCost: 400, costMult: 1.4, revenue: 70 },
    marketing: { name: "Propaganda", baseCost: 600, costMult: 1.5, revenue: 120 },
    logistics: { name: "Logística", baseCost: 700, costMult: 1.5, revenue: 140 }
};

let UI = {};

function updateUIReferences() {
    UI = {
        money: document.getElementById('money'),
        level: document.getElementById('level'),
        consultants: document.getElementById('consultants'),
        consultantsModal: document.getElementById('consultants-modal'),
        btnBuy: document.getElementById('btn-buy-consultant'),
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
        loanAmount: document.getElementById('loan-amount'),
        investAmount: document.getElementById('invest-amount'),
        investDuration: document.getElementById('invest-duration'),
        btnConfirmLoan: document.getElementById('btn-confirm-loan'),
        btnConfirmInvest: document.getElementById('btn-confirm-invest'),
        
        // Strategic Investments UI
        investModal: document.getElementById('invest-modal'),
        btnOpenInvest: document.getElementById('btn-open-invest'),
        btnCloseInvest: document.getElementById('btn-close-invest'),
        
        // Inventory UI
        inventoryModal: document.getElementById('inventory-modal'),
        btnOpenInventory: document.getElementById('btn-open-inventory'),
        btnCloseInventory: document.getElementById('btn-close-inventory'),
        
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

        expEmployees: document.getElementById('exp-employees'),
        expAccounting: document.getElementById('exp-accounting'),
        expElectricity: document.getElementById('exp-electricity'),
        expWater: document.getElementById('exp-water'),
        expInternet: document.getElementById('exp-internet'),
        expLoans: document.getElementById('exp-loans'),
        expPenalty: document.getElementById('exp-penalty'),
        expTotal: document.getElementById('exp-total'),
        expenseDecisionBox: document.getElementById('expense-decision-box'),
        btnPayNow: document.getElementById('btn-pay-now'),
        btnPayLater: document.getElementById('btn-pay-later'),
        
        totalRevenue: document.getElementById('total-revenue-val'),

        // New Pill HUD elements
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
    updateUIReferences();
    console.log("Iniciando Jogo... Verificando referências UI:");
    Object.keys(UI).forEach(k => {
        if (!UI[k] && !['bankTabs','bankPanels'].includes(k)) console.warn(`Elemento não encontrado: ${k}`);
    });

    try {
        await loadQuestions(state.language);
        state.questions = [...questionsList];
    } catch(e) {
        console.error("Erro ao carregar perguntas:", e);
    }

    try {
        renderBoard();
        updateHUD();
    } catch(e) {
        console.error("Erro ao renderizar tabuleiro/HUD:", e);
    }
    
    // Binding events safely
    if (UI.mAction) UI.mAction.addEventListener('click', closeModal);
    if (UI.btnBuy) UI.btnBuy.addEventListener('click', buyConsultant);
    
    // Bank events
    if (UI.btnOpenBank) UI.btnOpenBank.addEventListener('click', openBank);
    if (UI.btnCloseBank) UI.btnCloseBank.addEventListener('click', closeBank);
    UI.bankTabs.forEach(tab => tab.addEventListener('click', () => switchBankTab(tab.dataset.tab)));
    
    if (UI.loanAmount) UI.loanAmount.addEventListener('input', updateLoanPreview);
    document.querySelectorAll('input[name="loan-installments"]').forEach(i => i.addEventListener('change', updateLoanPreview));
    
    if (UI.investAmount) UI.investAmount.addEventListener('input', updateInvestPreview);
    if (UI.investDuration) UI.investDuration.addEventListener('input', updateInvestPreview);
    
    if (UI.btnConfirmLoan) UI.btnConfirmLoan.addEventListener('click', confirmLoan);
    if (UI.btnConfirmInvest) UI.btnConfirmInvest.addEventListener('click', confirmInvest);
    
    // Strategic Invest events
    if (UI.btnOpenInvest) UI.btnOpenInvest.addEventListener('click', openInvestments);
    if (UI.btnCloseInvest) UI.btnCloseInvest.addEventListener('click', closeInvest);
    
    // Inventory events
    if (UI.btnOpenInventory) UI.btnOpenInventory.addEventListener('click', openInventory);
    if (UI.btnCloseInventory) UI.btnCloseInventory.addEventListener('click', closeInventory);
    
    // Expenses events
    if (UI.btnOpenExpenses) UI.btnOpenExpenses.addEventListener('click', openExpenses);
    if (UI.btnCloseExpenses) UI.btnCloseExpenses.addEventListener('click', closeExpenses);
    
    if (UI.btnPayNow) UI.btnPayNow.addEventListener('click', payExpensesNow);
    if (UI.btnPayLater) UI.btnPayLater.addEventListener('click', postponeExpenses);

    if (UI.btnLangToggle) UI.btnLangToggle.addEventListener('click', toggleLanguage);
    if (UI.btnStartTurn) UI.btnStartTurn.addEventListener('click', () => startTurn());

    // Apply translation on load
    updateLanguageUI();

    // Start background slideshow (15s)
    setInterval(() => {
        state.bgIndex = (state.bgIndex + 1) % GRAVITY_IMAGES.length;
        updateBackgroundImage();
    }, 15000);
}

function renderBoard() {
    // A interação agora é centralizada exclusivamente no botão START do HUD.
    // O tabuleiro circular/linear foi removido conforme solicitado.
    if (UI.board) UI.board.innerHTML = '';
}

function updateHUD() {
    if (UI.money) UI.money.innerText = `$ ${state.money.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    
    // Atualizar o texto do botão START com a QUESTÃO atual (state.pos)
    const startBtnText = UI.btnStartTurn ? UI.btnStartTurn.querySelector('[data-t="hud_start"]') : null;
    if (startBtnText) {
        startBtnText.innerText = t("hud_start", { level: state.pos.toString().padStart(2, '0') });
    }
    
    
    // Pulse effect for expenses if due (Every 4 rounds)
    if (UI.btnOpenExpenses) {
        if (state.pos >= 4 && !state.expensePaid) {
            UI.btnOpenExpenses.classList.add('pulse-warning');
        } else {
            UI.btnOpenExpenses.classList.remove('pulse-warning');
        }
    }
    
    // Background Image
    updateBackgroundImage();
    
    // Limits
    if (UI.btnBuy) UI.btnBuy.disabled = state.money < 500 || state.consultants >= 2;
    updateInventoryUI();
    updateExpensesUI();
}

function updateInventoryUI() {
    if (!UI.inventoryModal) return;
    UI.invWarehouse.innerText = state.inventory.warehouse.toLocaleString();
    UI.invMachinery.innerText = state.inventory.machinery.toLocaleString();
    UI.invPackaging.innerText = state.inventory.packaging.toLocaleString();
    UI.invRawMaterials.innerText = state.inventory.rawMaterials.toLocaleString();
    UI.invFinishedGoods.innerText = state.inventory.finishedGoods.toLocaleString();
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

    const reductions = {
        accounting: state.upgrades.training * 20,
        electricity: state.upgrades.logistics * 15
    };

    const loanPenalty = state.bank.loans.length > 0 ? 100 : 0;

    const total = 
        costs.employees + 
        Math.max(10, costs.accounting - reductions.accounting) + 
        Math.max(10, costs.electricity - reductions.electricity) + 
        costs.water + 
        costs.internet + 
        loanPenalty;

    return { total, costs, reductions, loanPenalty };
}

function calculateTotalExpenses() {
    let loanCosts = 0;
    state.bank.loans.forEach(loan => {
        loanCosts += loan.installmentVal;
    });
    
    return calculateDynamicExpenses().total + loanCosts + state.expensePenalty;
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
    
    let loanCosts = 0;
    state.bank.loans.forEach(loan => {
        loanCosts += loan.installmentVal;
    });
    
    const loanDisplay = loanCosts + dynamic.loanPenalty;
    UI.expLoans.innerHTML = dynamic.loanPenalty > 0 
        ? `${loanDisplay.toLocaleString()} <span style="font-size: 0.7rem; color: #e74c3c;">(+${dynamic.loanPenalty} Mora)</span>`
        : loanDisplay.toLocaleString();
    
    if (UI.expPenalty) UI.expPenalty.innerText = state.expensePenalty.toLocaleString();
    
    const total = calculateTotalExpenses();
    UI.expTotal.innerText = total.toLocaleString();

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

function startTurn(skipExpenseCheck = false) {
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
    processBankTurn();
    
    if (state.pos > 300) {
        showGameOver();
        return;
    }
    
    if (state.questions.length === 0) {
        state.questions = [...questionsList];
    }
    
    // 20% imprevisto, otherwise normal question
    if (Math.random() < 0.2) {
        triggerEvent();
    } else {
        askQuestion();
    }
}

function evaluateContextualEvents() {
    // 1. CASH CRISIS: Payday coming up and not enough money
    if (state.pos % 4 === 0 && state.money < calculateDynamicExpenses()) {
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
        state.money += ctxEvent.change;
        if (ctxEvent.change < 0) state.stats.totalEventsDamage += Math.abs(ctxEvent.change);
        else state.stats.totalEventsGains += ctxEvent.change;

        openModal(ctxEvent.title, ctxEvent.text);
        UI.mOptions.innerHTML = '';
        if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
        if (UI.mBtnReveal) UI.mBtnReveal.classList.add('hidden');
        UI.mFeedback.innerHTML = ctxEvent.change > 0 ? `+ R$ ${ctxEvent.change} 💰` : `- R$ ${Math.abs(ctxEvent.change)} 💸`;
        UI.mFeedback.className = ctxEvent.change > 0 ? 'success' : 'error';
        UI.mFeedback.classList.remove('hidden');
    } else {
        // Fallback to purely random generic events
        const events = [
            { change: -200, key: "event_stock_fail" },
            { change: -100, key: "event_supplier_delay" },
            { change: -300, key: "event_market_crisis" },
            { change: 500, key: "event_sap_bonus" },
            { change: 400, key: "event_logistics_win" }
        ];
        const ev = events[Math.floor(Math.random() * events.length)];
        
        state.money += ev.change;
        if (ev.change < 0) state.stats.totalEventsDamage += Math.abs(ev.change);
        else state.stats.totalEventsGains += ev.change;
        
        openModal(t("event_title") + " 📊", t(ev.key));
        UI.mOptions.innerHTML = '';
        if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
        if (UI.mBtnReveal) UI.mBtnReveal.classList.add('hidden');
        UI.mFeedback.innerHTML = ev.change > 0 ? t("event_gain", { amount: ev.change }) : t("event_loss", { amount: Math.abs(ev.change) });
        UI.mFeedback.className = ev.change > 0 ? 'success' : 'error';
        UI.mFeedback.classList.remove('hidden');
    }

    // Processar ganhos estratégicos (Upgrades) no evento surpresa também
    processStrategicTurn();
    
    UI.mAction.classList.remove('hidden');
    UI.mAction.onclick = () => {
        closeModal();
        updateHUD();
        // checkLevelUp(); -> O usuário pediu para não fazer nada no nível da empresa
        renderBoard();
    };
}

function askQuestion(skipRePick = false) {
    // Pick question by house position (1-indexed) if not skipping
    if (!skipRePick) {
        state.currentQuestion = state.questions.find(q => q.id === state.pos) || state.questions[0];
    }

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

    openModal(t("question_house", { pos: state.pos }), state.currentQuestion.text);
    UI.mOptions.innerHTML = '';
    
    if (state.currentQuestion.image && UI.mImage) {
        UI.mImage.src = state.currentQuestion.image;
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

    const selectedOpt = state.currentQuestion.options.find(o => o.id === selectedId);
    const isCorrect = selectedOpt.isCorrect;
    if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
    
    if (isCorrect) {
        btnElement.classList.add('correct');
        const reward = 150;
        state.money += reward;
        state.pos++;
        // Reset expense payment for the new cycle (Every 4 rounds)
        if (state.pos % 4 === 0) {
            state.expensePaid = false;
            console.log(`Nova rodada de faturamento! Iniciando ciclo: ${state.pos}`);
        }
        
        UI.mFeedback.innerHTML = `${t("ans_correct", { reward })}<br><br>${selectedOpt.justification}`;
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
        // Prevent loss using consultant
        if (state.consultants > 0) {
            state.consultants--;
            UI.mFeedback.innerHTML = `${selectedOpt.justification}<br><br>${t("ans_consultant")}`;
            UI.mFeedback.className = 'info';
        } else {
            const loss = 100;
            state.money -= loss;
            UI.mFeedback.innerHTML = `${selectedOpt.justification}<br><br>${t("ans_wrong", { loss })}`;
            UI.mFeedback.className = 'error';
            
            // Visual Error Feedback
            document.body.classList.add('flash-error');
            setTimeout(() => document.body.classList.remove('flash-error'), 500);
        }
    }
    
    UI.mFeedback.classList.remove('hidden');
    state.currentQuestion = null;
    updateHUD();
    renderBoard();
    
    UI.mAction.classList.remove('hidden');
    
    // Auto-scroll to feedback area
    setTimeout(() => {
        UI.mFeedback.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    // Processar ganhos estratégicos (Upgrades) APÓS a ação para evitar "ganho no start"
    processStrategicTurn();

    UI.mAction.onclick = () => {
        // GATILHO: Questão Surpresa após acertar a primeira questão
        if (isCorrect && state.pos === 2 && !state.surpriseShown1) {
            loadSurpriseQuestion(1);
            return;
        }
        
        // GATILHO: Questão Surpresa 2 após acertar a sexta questão
        if (isCorrect && state.pos === 7 && !state.surpriseShown2) {
            loadSurpriseQuestion(2);
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

        // Iniciar Contagem Regressiva de 60 segundos
        startSurpriseTimer(60, num, correctAnswer);

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
    if (num === 1) state.surpriseShown1 = true;
    if (num === 2) state.surpriseShown2 = true;

    if (isCorrect) {
        const bonus = 50;
        state.money = Number(state.money) + bonus;
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
        state.money = Number(state.money) - penalty;
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

function showGameOver() {
    openModal(t("game_over_title"), t("game_over_text", { money: state.money, level: `${state.level}/30` }));
    
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
    UI.mTitle.innerText = title;
    UI.mText.innerHTML = text;
    
    const modalImage = document.getElementById('modal-image');
    if (modalImage) {
        modalImage.classList.add('hidden');
        modalImage.src = "";
    }
    
    UI.modal.classList.remove('hidden');
    forceScrollToTop();
}

function closeModal() {
    stopSurpriseTimer(); 
    UI.modal.classList.add('hidden');
    UI.mFeedback.classList.add('hidden');
    UI.mBtnNo.classList.add('hidden');
    
    UI.modal.classList.remove('retro-skin');
    UI.mAction.innerText = t("btn_continue");

    // Limpa a rolagem (scroll) de forma oculta após a animação (400ms)
    setTimeout(forceScrollToTop, 400);
}

/* --- Expense Decision Logic (Moved to Modal) --- */
function payExpensesNow() {
    const total = calculateTotalExpenses();
    if (state.money >= total) {
        state.money -= total;
        state.expensePaid = true;
        alert(t("alert_expenses_paid", { amount: total.toLocaleString() }));
        updateHUD();
        // Feedback visual no botão
        if (UI.btnOpenExpenses) UI.btnOpenExpenses.classList.remove('pulse-warning');
    } else {
        alert(t("alert_no_funds"));
    }
}

function postponeExpenses() {
    const penaltyGrowth = state.expensePenalty === 0 ? 50 : Math.round(state.expensePenalty * 0.15);
    state.expensePenalty += penaltyGrowth;
    alert(`Pagamento adiado! Multa de R$ ${penaltyGrowth} (Juros sobre dívida) aplicada.`);
    updateHUD();
    closeExpenses();
}

// Powerups Actions
function buyConsultant() {
    if (state.money >= 500 && state.consultants < 2) {
        state.money -= 500;
        state.consultants++;
        updateHUD();
    }
}

function closeAllModals() {
    if (UI.bankModal) UI.bankModal.classList.add('hidden');
    if (UI.investModal) UI.investModal.classList.add('hidden');
    if (UI.inventoryModal) UI.inventoryModal.classList.add('hidden');
    if (UI.expensesModal) UI.expensesModal.classList.add('hidden');
}

// --- Bank Logic ---

function openBank() {
    closeAllModals();
    updateBankUI();
    UI.bankModal.classList.remove('hidden');
}

function closeBank() {
    UI.bankModal.classList.remove('hidden');
    UI.bankModal.classList.add('hidden');
}

function switchBankTab(tabId) {
    UI.bankTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    UI.bankPanels.forEach(p => p.classList.toggle('hidden', p.id !== `bank-${tabId}-panel`));
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
    document.getElementById('loan-total').innerText = `R$ ${total.toFixed(2)}`;
    document.getElementById('loan-installment-val').innerText = `R$ ${perMonth.toFixed(2)}`;
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
    
    state.money += amount;
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
    
    if (isNaN(duration) || duration < 1 || duration > 10) {
        alert(t("invest_rounds_limit"));
        return;
    }
    
    const rate = 0.03 + (duration * 0.005);
    const finalVal = amount * (1 + rate);
    
    state.money -= amount;
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
    document.getElementById('bank-balance-val').innerText = `R$ ${state.money}`;
    
    const totalDebt = state.bank.loans.reduce((acc, l) => acc + (l.installmentVal * l.remainingInstallments), 0);
    document.getElementById('bank-debt-val').innerText = `R$ ${totalDebt.toFixed(2)}`;
    
    const totalYield = state.bank.investments.reduce((acc, i) => acc + (i.finalVal - i.amount), 0);
    document.getElementById('bank-yield-val').innerText = `R$ ${totalYield.toFixed(2)}`;
    
    const list = document.getElementById('bank-active-items');
    list.innerHTML = `<h4>${t("active_items_title")}</h4>`;
    
    if (state.bank.loans.length === 0 && state.bank.investments.length === 0) {
        list.innerHTML += `<p style="color: grey; font-style: italic;">${t("no_active_items")}</p>`;
    }
    
    state.bank.loans.forEach((l, index) => {
        list.innerHTML += `
            <div class="bank-item">
                <div class="bank-item-info">
                    <h4>${t("loan_label")} #${index + 1}</h4>
                    <p>${t("loan_installment_val")}: R$ ${l.installmentVal.toFixed(2)}</p>
                </div>
                <div class="bank-item-status">
                    <span class="amount">R$ ${(l.installmentVal * l.remainingInstallments).toFixed(2)}</span>
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
                    <p>${t("invest_amount_label")}: R$ ${inv.amount.toFixed(2)}</p>
                </div>
                <div class="bank-item-status" style="color: #2ecc71;">
                    <span class="amount">R$ ${inv.finalVal.toFixed(2)}</span>
                    <span class="rounds">${t("receives_in", { rounds: inv.remainingRounds })}</span>
                </div>
            </div>
        `;
    });
    
    // Update credit limit based on level
    state.bank.creditLimit = state.level * 2000;
}

function processBankTurn() {
    // Process Loans
    let debtToPay = 0;
    state.bank.isDefaulting = false; // Reset temporary para checagem
    state.bank.loans = state.bank.loans.filter(loan => {
        if (state.money >= loan.installmentVal) {
            state.money -= loan.installmentVal;
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
            state.money += inv.finalVal;
            alert(t("alert_invest_matured", { amount: inv.amount, total: inv.finalVal.toFixed(2) }));
            return false;
        }
        return true;
    });

    updateHUD();
    updateBankUI();
}

// --- Strategic Investments Logic ---

function openInvestments() {
    closeAllModals();
    updateInvestUI();
    UI.investModal.classList.remove('hidden');
}

function closeInvest() {
    UI.investModal.classList.add('hidden');
}

/* --- Inventory Logic --- */
function openInventory() {
    closeAllModals();
    updateInventoryUI();
    UI.inventoryModal.classList.remove('hidden');
}

function closeInventory() {
    UI.inventoryModal.classList.add('hidden');
}

/* --- Expenses Logic --- */
function openExpenses() {
    closeAllModals();
    updateExpensesUI();
    UI.expensesModal.classList.remove('hidden');
}

function closeExpenses() {
    UI.expensesModal.classList.add('hidden');
}

/* --- Inventory Logic --- */
function openInventory() {
    updateInventoryUI();
    UI.inventoryModal.classList.remove('hidden');
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
    document.getElementById('invest-balance-val').innerText = `R$ ${state.money}`;
    let totalRevenue = calculatePassiveRevenue(state.upgrades);
    const config = GAME_CONFIG[state.difficulty] || GAME_CONFIG.NORMAL;

    Object.keys(STRATEGIC_DATA).forEach(area => {
        const level = state.upgrades[area];
        const card = document.querySelector(`.invest-card[data-area="${area}"]`);
        
        const nextCost = getUpgradeCost(area, level);
        const currentRevenue = level * config.passiveRevenue[area];

        card.querySelector('.invest-level').innerText = `${t('level')} ${level}`;
        card.querySelector('.benefit-tag').innerHTML = `+ R$ ${currentRevenue} <span data-t="per_round">${t('per_round')}</span>`;
        
        const btn = card.querySelector('.upgrade-btn');
        btn.innerText = `${t('btn_upgrade')} (R$ ${nextCost})`;
        btn.disabled = state.money < nextCost;
    });

    UI.totalRevenue.innerText = `R$ ${totalRevenue}`;
}

window.upgradeArea = function(area) {
    const level = state.upgrades[area];
    const cost = getUpgradeCost(area, level);

    if (state.money >= cost) {
        state.money -= cost;
        state.upgrades[area]++;
        state.stats.investmentsMade++;
        
        alert(t('alert_upgrade_success', { name: t(area + '_name'), level: state.upgrades[area] }));
        updateHUD();
        updateInvestUI();
    } else {
        alert(t('alert_no_funds'));
    }
};

function processStrategicTurn() {
    const turnGain = calculatePassiveRevenue(state.upgrades);

    if (turnGain > 0) {
        state.money += turnGain;
        console.log(`💹 Ganho estratégico: +R$ ${turnGain}`);
        updateHUD();
    }
}

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

// End of file
