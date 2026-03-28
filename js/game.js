import { questionsList, loadQuestions } from './questions.js';
import { translations } from './translations.js';

const GRAVITY_IMAGES = [
    "cenario1/01.png",
    "cenario1/02.png",
    "cenario1/03.png",
    "cenario1/04.png",
    "cenario1/05.png",
    "cenario1/06.png",
    "cenario1/07.png"
];

const state = {
    language: localStorage.getItem('sap-game-lang') || 'pt',
    pos: 1,
    money: 500, // Capital inicial
    level: 1, // 1: Pequena, 2: Média, 3: Grande
    consultants: 0,
    questions: [],
    currentQuestion: null,
    bank: {
        loans: [],
        investments: [],
        creditLimit: 2000
    },
    upgrades: {
        infra: 0,
        machines: 0,
        training: 0,
        marketing: 0,
        logistics: 0
    },
    bgIndex: 0
};

const STRATEGIC_DATA = {
    infra: { name: "Infraestrutura", baseCost: 500, costMult: 1.5, revenue: 100 },
    machines: { name: "Máquinas", baseCost: 800, costMult: 1.6, revenue: 180 },
    training: { name: "Treinamento", baseCost: 400, costMult: 1.4, revenue: 70 },
    marketing: { name: "Propaganda", baseCost: 600, costMult: 1.5, revenue: 120 },
    logistics: { name: "Logística", baseCost: 700, costMult: 1.5, revenue: 140 }
};

const UI = {
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
    totalRevenue: document.getElementById('total-revenue-val'),

    // Lang Switcher
    btnLangPt: document.getElementById('btn-lang-pt'),
    btnLangEn: document.getElementById('btn-lang-en')
};

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

    // Language buttons
    UI.btnLangPt.classList.toggle('active', state.language === 'pt');
    UI.btnLangEn.classList.toggle('active', state.language === 'en');

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

async function initGame() {
    await loadQuestions(state.language);
    state.questions = [...questionsList];

    
    renderBoard();
    updateHUD();
    
    // Binding events
    UI.mAction.addEventListener('click', closeModal);
    UI.btnBuy.addEventListener('click', buyConsultant);
    
    // Bank events
    UI.btnOpenBank.addEventListener('click', openBank);
    UI.btnCloseBank.addEventListener('click', closeBank);
    UI.bankTabs.forEach(tab => tab.addEventListener('click', () => switchBankTab(tab.dataset.tab)));
    
    UI.loanAmount.addEventListener('input', updateLoanPreview);
    document.querySelectorAll('input[name="loan-installments"]').forEach(i => i.addEventListener('change', updateLoanPreview));
    
    UI.investAmount.addEventListener('input', updateInvestPreview);
    UI.investDuration.addEventListener('input', updateInvestPreview);
    
    UI.btnConfirmLoan.addEventListener('click', confirmLoan);
    UI.btnConfirmInvest.addEventListener('click', confirmInvest);
    
    // Strategic Invest events
    UI.btnOpenInvest.addEventListener('click', openInvestments);
    UI.btnCloseInvest.addEventListener('click', closeInvestments);

    UI.btnLangPt.addEventListener('click', () => changeLanguage('pt'));
    UI.btnLangEn.addEventListener('click', () => changeLanguage('en'));

    // Apply translation on load
    updateLanguageUI();

    // Start background slideshow (30s)
    setInterval(() => {
        state.bgIndex = (state.bgIndex + 1) % GRAVITY_IMAGES.length;
        updateBackgroundImage();
    }, 30000);
}

function renderBoard() {
    UI.board.innerHTML = '';
    
    const div = document.createElement('div');
    div.className = 'space start clickable';
    
    if (state.pos === 1) {
        div.innerHTML = `<span>Questão 1</span>`;
    } else if (state.pos < 10) {
        div.innerHTML = `<span>Questão ${state.pos}</span>`;
    } else {
        div.innerHTML = `<span>🏁 Questão Final (10)</span>`;
    }
    
    div.onclick = startTurn;
    UI.board.appendChild(div);
}

function updateHUD() {
    UI.money.innerText = state.money;
    const levelKeys = ["level_small", "level_medium", "level_large"];
    UI.level.innerText = t(levelKeys[state.level - 1]);
    UI.consultants.innerText = state.consultants;
    if (UI.consultantsModal) UI.consultantsModal.innerText = state.consultants;
    
    // Background Image (Consistent with slideshow)
    updateBackgroundImage();
    
    // Limits
    UI.btnBuy.disabled = state.money < 500 || state.consultants >= 2;
}

function updateBackgroundImage() {
    const imgUrl = GRAVITY_IMAGES[state.bgIndex];
    document.body.style.backgroundImage = `url('${imgUrl}')`;
}

function startTurn() {
    // Disable clicks during the animation/modal to prevent triple-clicks
    document.querySelectorAll('.space').forEach(s => s.onclick = null);
    
    // Process Bank logic BEFORE the turn starts
    processBankTurn();
    processStrategicTurn();
    
    if (state.pos >= 10) {
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

function triggerEvent() {
    const events = [
        { change: -200 },
        { change: -100 },
        { change: -300 },
        { change: 500 },
        { change: 400 }
    ];
    const ev = events[Math.floor(Math.random() * events.length)];
    
    state.money += ev.change;
    
    const eventKeys = [
        "event_stock_fail",
        "event_supplier_delay",
        "event_market_crisis",
        "event_sap_bonus",
        "event_logistics_win"
    ];
    const eventText = t(eventKeys[events.indexOf(ev)]);

    openModal(t("event_title") + " 📊", eventText);
    UI.mOptions.innerHTML = ''; // no options
    
    UI.mFeedback.innerHTML = ev.change > 0 ? t("event_gain", { amount: ev.change }) : t("event_loss", { amount: Math.abs(ev.change) });
    UI.mFeedback.className = ev.change > 0 ? 'success' : 'error';
    UI.mFeedback.classList.remove('hidden');
    
    UI.mAction.classList.remove('hidden');
    UI.mAction.onclick = () => {
        closeModal();
        updateHUD();
        checkLevelUp();
        renderBoard(); // Refresh board so next house is clickable
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
    if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
    if (UI.mBtnReveal) {
        UI.mBtnReveal.classList.add('hidden');
    }

    openModal(t("question_house", { pos: state.pos }), state.currentQuestion.text);
    UI.mOptions.innerHTML = '';
    
    if (state.currentQuestion.image && UI.mImage) {
        UI.mImage.src = state.currentQuestion.image;
        UI.mImage.classList.remove('hidden');
    }

    if (state.currentQuestion.revealImage && UI.mBtnReveal) {
        UI.mBtnReveal.classList.remove('hidden');
        UI.mBtnReveal.onclick = () => {
            UI.mImage.src = state.currentQuestion.revealImage;
            UI.mImage.classList.remove('hidden');
            UI.mBtnReveal.classList.add('hidden');
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
        const reward = 300;
        state.money += reward;
        state.pos++;
        
        UI.mFeedback.innerHTML = `${t("ans_correct", { reward })}<br><br>${selectedOpt.justification}`;
        UI.mFeedback.className = 'success';
        
        // Visual Success Feedback
        document.body.classList.add('flash-success');
        setTimeout(() => document.body.classList.remove('flash-success'), 500);

        
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
            const loss = 200;
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
    
    // Auto-scroll to feedback/action area
    setTimeout(() => {
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) {
            modalContent.scrollTo({
                top: modalContent.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, 100);

    UI.mAction.onclick = () => {
        closeModal();
        checkLevelUp();
        if (state.pos >= 10) showGameOver();
        else UI.btnNext.classList.remove('hidden');
    };
}

function checkLevelUp() {
    if (state.pos >= 4 && state.level === 1) {
        state.level = 2;
        alert(t("level_up_medium"));
        UI.companyName.innerText = `${t("company_name_base")} ${t("company_suffix_medium")}`;
        updateHUD();
    }
    if (state.pos >= 8 && state.level === 2) {
        state.level = 3;
        alert(t("level_up_large"));
        UI.companyName.innerText = `${t("company_name_base")} ${t("company_suffix_large")}`;
        updateHUD();
    }
}

function showGameOver() {
    const levelText = state.level === 3 ? t("level_large") : t("level_medium");
    openModal(t("game_over_title"), t("game_over_text", { money: state.money, level: levelText }));
    
    UI.mOptions.innerHTML = '';
    UI.mFeedback.className = 'hidden';
    UI.mAction.innerText = t("btn_restart");
    UI.mAction.classList.remove('hidden');
    UI.mAction.onclick = () => location.reload();
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
}

function closeModal() {
    UI.modal.classList.add('hidden');
    UI.mFeedback.classList.add('hidden');
}

// Powerups Actions
function buyConsultant() {
    if (state.money >= 500 && state.consultants < 2) {
        state.money -= 500;
        state.consultants++;
        updateHUD();
    }
}

// --- Bank Logic ---

function openBank() {
    updateBankUI();
    UI.bankModal.classList.remove('hidden');
}

function closeBank() {
    UI.bankModal.classList.add('hidden');
}

function switchBankTab(tabId) {
    UI.bankTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    UI.bankPanels.forEach(p => p.classList.toggle('hidden', p.id !== `bank-${tabId}-panel`));
}

function updateLoanPreview() {
    const amount = parseFloat(UI.loanAmount.value) || 0;
    const installments = parseInt(document.querySelector('input[name="loan-installments"]:checked').value);
    const rate = 0.05 + (installments / 100); // Dynamic rate based on time
    
    const total = amount * (1 + rate);
    const perMonth = total / installments;
    
    document.getElementById('loan-rate').innerText = `${(rate * 100).toFixed(1)}%`;
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
    
    if (isNaN(amount) || amount < 100) {
        alert(t("loan_min_amount"));
        return;
    }
    
    if (amount > state.bank.creditLimit) {
        alert(t("loan_limit_exceeded", { limit: state.bank.creditLimit }));
        return;
    }
    
    const rate = 0.05 + (installments / 100);
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
    state.bank.loans = state.bank.loans.filter(loan => {
        if (state.money >= loan.installmentVal) {
            state.money -= loan.installmentVal;
            loan.remainingInstallments--;
            console.log(`Paga parcela de R$ ${loan.installmentVal}`);
            return loan.remainingInstallments > 0;
        } else {
            alert(`⚠️ ${t("alert_no_funds")} (${t("loan_label")})`);
            // Note: In a real game we might add penalties here
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
    updateInvestUI();
    UI.investModal.classList.remove('hidden');
}

function closeInvestments() {
    UI.investModal.classList.add('hidden');
}

function updateInvestUI() {
    document.getElementById('invest-balance-val').innerText = `R$ ${state.money}`;
    let totalRevenue = 0;

    Object.keys(STRATEGIC_DATA).forEach(area => {
        const level = state.upgrades[area];
        const data = STRATEGIC_DATA[area];
        const card = document.querySelector(`.invest-card[data-area="${area}"]`);
        
        const nextCost = Math.floor(data.baseCost * Math.pow(data.costMult, level));
        const currentRevenue = level * data.revenue;
        totalRevenue += currentRevenue;

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
    const data = STRATEGIC_DATA[area];
    const cost = Math.floor(data.baseCost * Math.pow(data.costMult, level));

    if (state.money >= cost) {
        state.money -= cost;
        state.upgrades[area]++;
        alert(t('alert_upgrade_success', { name: t(area + '_name'), level: state.upgrades[area] }));
        updateHUD();
        updateInvestUI();
    } else {
        alert(t('alert_no_funds'));
    }
};

function processStrategicTurn() {
    let turnGain = 0;
    Object.keys(STRATEGIC_DATA).forEach(area => {
        const level = state.upgrades[area];
        const data = STRATEGIC_DATA[area];
        turnGain += level * data.revenue;
    });

    if (turnGain > 0) {
        state.money += turnGain;
        console.log(`Bônus estratégico: +R$ ${turnGain}`);
        updateHUD();
    }
}

// Ensure the game builds up visually
initGame();
