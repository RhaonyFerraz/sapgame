import { questionsList } from './questions.js';

const state = {
    pos: 1,
    money: 500, // Capital inicial
    level: 1, // 1: Pequena, 2: Média, 3: Grande
    consultants: 0,
    cards: { elimina: 1, pula: 1, dica: 1 },
    questions: [],
    currentQuestion: null
};

const UI = {
    money: document.getElementById('money'),
    level: document.getElementById('level'),
    consultants: document.getElementById('consultants'),
    btnElimina: document.getElementById('btn-elimina'),
    btnPula: document.getElementById('btn-pula'),
    btnDica: document.getElementById('btn-dica'),
    btnBuy: document.getElementById('btn-buy-consultant'),
    board: document.getElementById('board-container'),
    companyVisual: document.getElementById('company-visual'),
    companyName: document.getElementById('company-name'),
    btnNext: document.getElementById('btn-roll-dice'),
    modal: document.getElementById('modal'),
    mTitle: document.getElementById('modal-title'),
    mText: document.getElementById('modal-text'),
    mOptions: document.getElementById('modal-options'),
    mFeedback: document.getElementById('modal-feedback'),
    mAction: document.getElementById('modal-action-btn'),
    mBtnBonus: document.getElementById('mBtnBonus'),
    mBtnReveal: document.getElementById('btn-reveal'),
    mImage: document.getElementById('modal-image')
};

function initGame() {
    UI.btnNext.innerHTML = "Próximo Turno 📄";
    // Shuffle the questions array
    state.questions = [...questionsList].sort(() => Math.random() - 0.5);
    
    renderBoard();
    updateHUD();
    
    // Binding events
    UI.btnNext.addEventListener('click', startTurn);
    UI.mAction.addEventListener('click', closeModal);
    UI.btnBuy.addEventListener('click', buyConsultant);
    
    UI.btnElimina.addEventListener('click', useEliminate);
    UI.btnPula.addEventListener('click', useJump);
    UI.btnDica.addEventListener('click', useHint);
}

function renderBoard() {
    UI.board.innerHTML = '';
    for (let idx = 1; idx <= 10; idx++) {
        const div = document.createElement('div');
        div.className = 'space';
        if (idx === 1) div.classList.add('start');
        if (idx === state.pos) div.classList.add('active');
        
        if (idx === 10) {
            div.classList.add('finish');
            div.innerHTML = '🏁';
        } else {
            div.innerHTML = idx;
        }
        
        UI.board.appendChild(div);
    }
}

function updateHUD() {
    UI.money.innerText = state.money;
    UI.level.innerText = state.level === 1 ? "Pequena" : (state.level === 2 ? "Média" : "Grande");
    UI.consultants.innerText = state.consultants;
    
    UI.companyVisual.className = `level-${state.level}`;
    const companyVideo = document.getElementById('company-video');
    // If you ever want different videos per level, you can update companyVideo.src here
    
    // Cards visibility state
    UI.btnElimina.disabled = state.cards.elimina <= 0 || !state.currentQuestion;
    UI.btnPula.disabled = state.cards.pula <= 0 || !state.currentQuestion;
    UI.btnDica.disabled = state.cards.dica <= 0 || !state.currentQuestion;
    
    UI.btnElimina.innerText = `Eliminar (${state.cards.elimina})`;
    UI.btnPula.innerText = `Pular (${state.cards.pula})`;
    UI.btnDica.innerText = `Dica (${state.cards.dica})`;
    
    // Limits
    UI.btnBuy.disabled = state.money < 500 || state.consultants >= 2;
}

function startTurn() {
    UI.btnNext.style.display = 'none';
    
    if (state.pos >= 10) {
        showGameOver();
        return;
    }
    
    if (state.questions.length === 0) {
        state.questions = [...questionsList].sort(() => Math.random() - 0.5);
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
        { text: "Falta de estoque! Você perdeu vendas. Retenha R$ 200.", change: -200 },
        { text: "Atraso de fornecedor! Pague a multa de R$ 100.", change: -100 },
        { text: "Problemas financeiros no mercado extrangeiro! Perca R$ 300.", change: -300 },
        { text: "Venda enorme fechada via SAP B1! Bônus de R$ 500.", change: 500 },
        { text: "Otimização de rotas com sucesso no sistema! Ganhe R$ 400.", change: 400 }
    ];
    const ev = events[Math.floor(Math.random() * events.length)];
    
    state.money += ev.change;
    
    openModal("Imprevisto Corporativo 📊", ev.text);
    UI.mOptions.innerHTML = ''; // no options
    
    UI.mFeedback.innerHTML = ev.change > 0 ? `Ganhou R$ ${ev.change}` : `Perdeu R$ ${Math.abs(ev.change)}`;
    UI.mFeedback.className = ev.change > 0 ? 'success' : 'error';
    UI.mFeedback.classList.remove('hidden');
    
    UI.mAction.classList.remove('hidden');
    UI.mAction.onclick = () => {
        closeModal();
        updateHUD();
        checkLevelUp();
        UI.btnNext.classList.remove('hidden');
    };
}

function askQuestion() {
    state.currentQuestion = state.questions.pop();
    updateHUD(); // Unlocks the card buttons
    
    // Reset Modal UI
    UI.mFeedback.classList.add('hidden');
    UI.mImage.classList.add('hidden');
    if (UI.mBtnBonus) UI.mBtnBonus.classList.add('hidden');
    if (UI.mBtnReveal) {
        UI.mBtnReveal.classList.add('hidden');
    }

    openModal(`Treinamento SAP (Casa ${state.pos})`, state.currentQuestion.text);
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
        
        UI.mFeedback.innerHTML = `✅ Correto! Você avançou 1 casa e ganhou R$ ${reward}.<br><br>${selectedOpt.justification}`;
        UI.mFeedback.className = 'success';
        
        if (state.currentQuestion.bonusText && UI.mBtnBonus) {
            const bText = state.currentQuestion.bonusText; // CAPTURE THE TEXT HERE!
            UI.mBtnBonus.classList.remove('hidden');
            UI.mBtnBonus.onclick = () => {
                UI.mFeedback.innerHTML += `<div style="margin-top: 15px; padding: 15px; border-left: 4px solid #f1c40f; background: rgba(241, 196, 15, 0.15); text-align: left; color: #fff; font-size: 0.9em; box-shadow: inset 0 0 10px rgba(0,0,0,0.5); border-radius: 0 6px 6px 0; border: 1px solid rgba(241, 196, 15, 0.3);"><strong style="color: #f1c40f;">🎁 Dica Bônus Especial:</strong><br><br>${bText}</div>`;
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
            UI.mFeedback.innerHTML = `${selectedOpt.justification}<br><br>🛡️ Um Consultor blindou o fluxo e evitou perdas financeiras!`;
            UI.mFeedback.className = 'info';
        } else {
            const loss = 200;
            state.money -= loss;
            UI.mFeedback.innerHTML = `${selectedOpt.justification}<br><br>❌ Você não avançou e perdeu R$ ${loss}.`;
            UI.mFeedback.className = 'error';
        }
    }
    
    UI.mFeedback.classList.remove('hidden');
    state.currentQuestion = null;
    updateHUD();
    renderBoard();
    
    UI.mAction.classList.remove('hidden');
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
        alert("🎉 Crescimento! Sua Empresa evoluiu para Média!");
        UI.companyName.innerText = "Sua Empresa (Média)";
        updateHUD();
    }
    if (state.pos >= 8 && state.level === 2) {
        state.level = 3;
        alert("🎉 Sucesso! Sua Empresa evoluiu para Grande!");
        UI.companyName.innerText = "Sua Empresa (Grande)";
        updateHUD();
    }
}

function showGameOver() {
    openModal("🎉 Simulação Concluída!", `Parabéns! Você alcançou o topo do mercado.
    
    Caixa final: R$ ${state.money}
    Nível atingido: ${state.level === 3 ? 'Grande Empresa' : 'Média Empresa'}`);
    
    UI.mOptions.innerHTML = '';
    UI.mFeedback.className = 'hidden';
    UI.mAction.innerText = "Reiniciar Simulação";
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

function useEliminate() {
    if (state.cards.elimina > 0 && state.currentQuestion) {
        state.cards.elimina--;
        const wrongs = state.currentQuestion.options.filter(o => !o.isCorrect);
        const toEliminate = wrongs[Math.floor(Math.random() * wrongs.length)];
        
        Array.from(UI.mOptions.children).forEach(b => {
            if(b.innerHTML.includes(`${toEliminate.id})`)) {
                b.style.opacity = '0.2';
                b.classList.add('disabled');
                b.onclick = null;
            }
        });
        updateHUD();
    }
}

function useJump() {
    if (state.cards.pula > 0 && state.currentQuestion) {
        state.cards.pula--;
        state.currentQuestion = null; // Consume
        state.pos++;
        
        UI.mFeedback.innerHTML = `⏭️ Carta Pular Usada! Você pulou a pergunta e avançou 1 casa.`;
        UI.mFeedback.className = 'info';
        UI.mFeedback.classList.remove('hidden');
        
        Array.from(UI.mOptions.children).forEach(b => {
             b.classList.add('disabled');
             b.onclick = null;
        });

        updateHUD();
        renderBoard();
        
        UI.mAction.classList.remove('hidden');
        UI.mAction.onclick = () => {
            closeModal();
            checkLevelUp();
            if(state.pos >= 10) showGameOver();
            else UI.btnNext.classList.remove('hidden');
        };
    }
}

function useHint() {
    if (state.cards.dica > 0 && state.currentQuestion) {
        state.cards.dica--;
        UI.mFeedback.innerHTML = `💡 Dica Consultiva: ${state.currentQuestion.hint}`;
        UI.mFeedback.className = 'info';
        UI.mFeedback.classList.remove('hidden');
        updateHUD();
    }
}

// Ensure the game builds up visually
initGame();
