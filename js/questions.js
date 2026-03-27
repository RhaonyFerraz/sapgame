export let questionsList = [];

export async function loadQuestions(lang = 'pt') {
    questionsList.length = 0; // Clear existing
    const folder = lang === 'pt' ? 'perguntas' : `perguntas/${lang}`;
    
    // Array para suportar a carga dinâmica de vários arquivos TXT na pasta 'perguntas'
    for (let i = 1; i <= 30; i++) {
        try {
            // Tenta buscar o arquivo
            let urls = [
                `${folder}/pergunta${i}.txt`,
                `${folder}/prgunta${i}.txt`,
                `${folder}/pergunta0${i}.txt`,
                `${folder}/prgunta0${i}.txt`
            ];
            
            let response = null;
            for (let url of urls) {
                try {
                    let res = await fetch(url);
                    if (res.ok) {
                        console.log(`Successfully loaded: ${url}`);
                        response = res;
                        break;
                    } else {
                        console.warn(`Failed to load (Status ${res.status}): ${url}`);
                    }
                } catch (e) {
                    console.error(`Fetch error for ${url}:`, e);
                }
            }

            if (!response) {
                console.warn(`No variations found for question ${i}. Stopping load.`);
                break; // Para quando um numero não existir
            }

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

    if (questionsList.length === 0) {
        console.warn(`No questions loaded for ${lang}. Using fallback.`);
        questionsList.push({
            id: 1,
            text: `Selected language: ${lang}. No question files found in ${folder}. Please check file names (pergunta1.txt, etc.).`,
            image: "",
            options: [{id: 'A', text: "Ok", isCorrect: true}],
            hint: ""
        });
    }

    console.log(`Perguntas carregadas com sucesso: ${questionsList.length}`);
}

// Initialization moved to game.js explicitly or handled here
// await loadQuestions('pt'); 



