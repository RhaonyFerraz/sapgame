export let questionsList = [];

async function loadQuestions() {
    // Array para suportar a carga dinâmica de vários arquivos TXT na pasta 'perguntas'
    for (let i = 1; i <= 30; i++) {
        try {
            // Tenta buscar o arquivo (considera variações comuns de nome, ex: prgunta1.txt ou pergunta1.txt)
            let urls = [
                `perguntas/prgunta${i}.txt`,
                `perguntas/pergunta${i}.txt`,
                `perguntas/prgunta0${i}.txt`,
                `perguntas/pergunta0${i}.txt`
            ];
            
            let response = null;
            for (let url of urls) {
                let res = await fetch(url);
                if (res.ok) {
                    response = res;
                    break;
                }
            }

            if (!response) break; // Para quando um numero não existir (chegou no fim das perguntas)

            const rawText = await response.text();
            
            // Recorta o texto principal da Pergunta e Alternativas
            const questionMatch = rawText.match(/📌 Pergunta:\s*([\s\S]*?)🔘 Alternativas:/i);
            const optionsMatch = rawText.match(/🔘 Alternativas:\s*([\s\S]*?)(?:⚙️ REGRAS DE RESPOSTA|✅ SE O USUÁRIO ACERTAR|✔ Justificativa|❌ Justificativas|$)/i);
            
            // Extrai a resposta correta se estiver declarada no novo modelo
            const correctMatch = rawText.match(/A resposta correta(?:.*?)?:\s*([A-Za-z])/i);
            const correctLetter = correctMatch ? correctMatch[1].toUpperCase() : null;
            
            // Extrai a justificativa correta exatamente como escrita no txt
            const correctJustMatch = rawText.match(/(Justificativa(?:[:\sA-Z]+)?\s*[\s\S]*?)(?:❌ SE O USUÁRIO ERRAR|❌ Justificativas|👉 Se responder|🎁 BÔNUS|$)/i);
            const correctJustification = correctJustMatch ? correctJustMatch[1].trim() : "";
            
            // Extrai a seção de bônus, se existir
            const bonusMatch = rawText.match(/🎁 BÔNUS:\s*([\s\S]*?)$/i);
            const bonusText = bonusMatch ? bonusMatch[1].trim().replace(/\n/g, '<br>') : null;
            
            // Para o modelo antigo: guarda o bloco de justificativas incorretas
            let justifSplit = rawText.split(/❌ Justificativas das alternativas incorretas:/i);
            let incorrectJustificationsText = justifSplit.length > 1 ? justifSplit[1].split(/🎁 BÔNUS/i)[0].trim() : "";

            if (questionMatch && optionsMatch) {
                let questionText = questionMatch[1].trim().replace(/\n/g, '<br>');
                let optionsRaw = optionsMatch[1].trim().split('\n');
                
                let optionsData = [];
                for (let line of optionsRaw) {
                    line = line.trim();
                    if (!line) continue;
                    
                    let hasCheckmark = line.includes('✅');
                    line = line.replace('✅', '').trim();
                    
                    let match = line.match(/^([A-Z])\)\s*(.+)/i);
                    if (match) {
                        let optLetter = match[1].toUpperCase();
                        optionsData.push({
                            id: optLetter,
                            text: match[2].trim(),
                            isCorrect: hasCheckmark || (optLetter === correctLetter),
                            justification: ''
                        });
                    }
                }
                
                for (let opt of optionsData) {
                    if (opt.isCorrect) {
                        opt.justification = correctJustification.replace(/\n/g, '<br>');
                    } else {
                        // Tenta buscar no NOVO modelo ("👉 Se responder B:")
                        let explanationText = "";
                        let newRegex = new RegExp(`👉 Se responder ${opt.id}:\\s*([\\s\\S]*?)(?=👉 Se responder|🎁 BÔNUS|$)`, 'im');
                        let newMatch = rawText.match(newRegex);
                        
                        if (newMatch && newMatch[1].trim()) {
                            explanationText = newMatch[1].trim();
                        } else {
                            // Retorna para o modelo ANTIGO ("B) Incorreta") se não achar o novo
                            let oldRegex = new RegExp(`^${opt.id}\\)[\\s\\S]*?(?=^[A-Z]\\)|🎁 BÔNUS|$)`, 'im');
                            let oldMatch = incorrectJustificationsText.match(oldRegex);
                            if (oldMatch && oldMatch[0].trim()) {
                                explanationText = oldMatch[0].trim();
                            }
                        }
                        
                        let combinedJustification = explanationText ? explanationText.replace(/\n/g, '<br>') : "";
                        
                        opt.justification = combinedJustification;
                    }
                }
                
                questionsList.push({
                    id: i,
                    text: `<div style="text-align: left; font-size: 1.1em; line-height: 1.5; color: #e6edf3;">
                                ${questionText}
                           </div>`,
                    image: `perguntas/image${i}.png`, // Procura imagem na mesma pasta (se houver)
                    revealImage: `imagem_pergunta/imagempergunta${i}.png`, // Imagem para o botão Revelar Tela
                    options: optionsData,
                    hint: correctJustification ? correctJustification.replace(/<br>/g, " ").substring(0, 100) + "..." : "Consulte seus resumos.",
                    fullJustification: correctJustification,
                    bonusText: bonusText
                });
            }
        } catch (e) {
            console.error("Fim do carregamento de arquivos na pasta perguntas.", e);
            break;
        }
    }
    console.log(`Perguntas carregadas com sucesso: ${questionsList.length}`);
}

// O top-level await pausa as importações do game.js até que todos os arquivos txt sejam processados!
await loadQuestions();

// Fallback caso não seja encontrado o arquivo na pasta correta ou ocorra erro de digitação no formato
if (questionsList.length === 0) {
    questionsList = [
        {
            id: 1,
            text: "Não foi possível carregar as perguntas da pasta 'perguntas'. Verifique os nomes dos arquivos (ex: prgunta1.txt) e a formatação interna do TXT.",
            image: "",
            options: [{id: 'A', text: "Ok", isCorrect: true}],
            hint: ""
        }
    ];
}
