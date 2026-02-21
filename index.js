// ============================
// Configuração da API Gemini
// ============================
// GEMINI_API_KEY vem do arquivo config.js (não versionado)
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// Histórico de conversa para contexto
let conversationHistory = [];

const SYSTEM_INSTRUCTION = `Você é o SENAI GPT, um assistente virtual inteligente do SENAI (Serviço Nacional de Aprendizagem Industrial). 
Responda sempre em português brasileiro. Seja educado, claro e útil. 
Você pode ajudar com dúvidas sobre tecnologia, programação, cursos do SENAI, e assuntos gerais.
Quando receber arquivos, analise-os e descreva seu conteúdo da melhor forma possível.`;

// ============================
// Elementos
// ============================
const toggleBtn = document.getElementById('toggle-mode');
const toggleIcon = toggleBtn.querySelector('i');
const promptInput = document.getElementById('prompt');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');
const welcome = document.getElementById('welcome');
const suggestionCards = document.querySelectorAll('.suggestion-card');
const fileInput = document.getElementById('file-input');
const attachBtn = document.getElementById('attach-btn');
const previewStrip = document.getElementById('file-preview-strip');
const scrollBottomBtn = document.getElementById('scroll-bottom');

let pendingFiles = [];
let isSending = false; // evita envios duplos

// ============================
// Scroll-to-Bottom Button
// ============================
chatMessages.addEventListener('scroll', () => {
    const distanceFromBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
    scrollBottomBtn.classList.toggle('visible', distanceFromBottom > 150);
});

scrollBottomBtn.addEventListener('click', () => {
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
});

// ============================
// Sistema de Temas (5 temas)
// ============================
const themeDropdown = document.getElementById('theme-dropdown');
const themeSelectorBtn = document.getElementById('theme-selector-btn');
let rateLimitCooldown = 0; // em ms, 0 = desativado
let lastSendTime = 0;

function applyTheme(theme) {
    // Remove todas as classes de tema
    document.body.classList.remove('dark-mode', 'theme-midnight', 'theme-ocean', 'theme-senai');

    if (theme === 'light') {
        toggleIcon.classList.replace('fa-moon', 'fa-sun');
    } else {
        document.body.classList.add('dark-mode');
        toggleIcon.classList.replace('fa-sun', 'fa-moon');
        if (theme === 'midnight') document.body.classList.add('theme-midnight');
        if (theme === 'ocean') document.body.classList.add('theme-ocean');
        if (theme === 'senai') document.body.classList.add('theme-senai');
    }

    // Marca tema ativo no dropdown
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.theme === theme);
    });

    localStorage.setItem('theme', theme);
}

const savedTheme = localStorage.getItem('theme') || 'dark';
applyTheme(savedTheme);

toggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark-mode');
    applyTheme(isDark ? 'light' : 'dark');
});

// Theme dropdown
themeSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    themeDropdown.classList.toggle('open');
});

document.querySelectorAll('.theme-option').forEach(opt => {
    opt.addEventListener('click', () => {
        applyTheme(opt.dataset.theme);
        themeDropdown.classList.remove('open');
    });
});

document.addEventListener('click', () => themeDropdown.classList.remove('open'));

// ============================
// Utilitários de arquivo
// ============================
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function getFileIcon(type) {
    if (type.startsWith('image/')) return 'fa-image';
    if (type.startsWith('video/')) return 'fa-video';
    if (type.startsWith('audio/')) return 'fa-music';
    if (type.includes('pdf')) return 'fa-file-pdf';
    if (type.includes('word') || type.includes('document')) return 'fa-file-word';
    if (type.includes('sheet') || type.includes('excel')) return 'fa-file-excel';
    if (type.includes('presentation') || type.includes('powerpoint')) return 'fa-file-powerpoint';
    if (type.includes('zip') || type.includes('rar') || type.includes('7z') || type.includes('tar')) return 'fa-file-archive';
    if (type.includes('text') || type.includes('json') || type.includes('xml') || type.includes('csv')) return 'fa-file-alt';
    return 'fa-file';
}

function isImageFile(file) {
    return file.type.startsWith('image/');
}

// Converte File para base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1]; // remove "data:...;base64,"
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ============================
// Preview Strip
// ============================
function renderPreviewStrip() {
    previewStrip.innerHTML = '';

    if (pendingFiles.length === 0) {
        previewStrip.classList.remove('active');
        return;
    }

    previewStrip.classList.add('active');

    pendingFiles.forEach((file, index) => {
        const card = document.createElement('div');
        card.classList.add('file-preview-card');

        if (isImageFile(file)) {
            const thumb = document.createElement('img');
            thumb.classList.add('file-thumb');
            thumb.src = URL.createObjectURL(file);
            thumb.alt = file.name;
            card.appendChild(thumb);
        } else {
            const icon = document.createElement('div');
            icon.classList.add('file-icon');
            icon.innerHTML = `<i class="fas ${getFileIcon(file.type)}"></i>`;
            card.appendChild(icon);
        }

        const info = document.createElement('div');
        info.classList.add('file-info');
        info.innerHTML = `
            <div class="file-name" title="${file.name}">${file.name}</div>
            <div class="file-size">${formatFileSize(file.size)}</div>
        `;
        card.appendChild(info);

        const removeBtn = document.createElement('button');
        removeBtn.classList.add('file-remove');
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.addEventListener('click', () => {
            pendingFiles.splice(index, 1);
            renderPreviewStrip();
        });
        card.appendChild(removeBtn);

        previewStrip.appendChild(card);
    });
}

// ============================
// Botão Anexar
// ============================
attachBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    pendingFiles.push(...files);
    renderPreviewStrip();
    fileInput.value = '';
});

// ============================
// Drag & Drop
// ============================
const mainContent = document.querySelector('.main-content');

mainContent.addEventListener('dragover', (e) => {
    e.preventDefault();
    mainContent.style.outline = '2px dashed var(--accent)';
    mainContent.style.outlineOffset = '-8px';
});

mainContent.addEventListener('dragleave', () => {
    mainContent.style.outline = 'none';
});

mainContent.addEventListener('drop', (e) => {
    e.preventDefault();
    mainContent.style.outline = 'none';
    const files = Array.from(e.dataTransfer.files);
    if (files.length) {
        pendingFiles.push(...files);
        renderPreviewStrip();
    }
});

// ============================
// Chat helpers
// ============================
function hideWelcome() {
    if (welcome) {
        welcome.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => { welcome.style.display = 'none'; }, 300);
    }
}

function createMessage(text, sender, files = []) {
    const msg = document.createElement('div');
    msg.classList.add('message');

    const avatar = document.createElement('div');
    avatar.classList.add('message-avatar', sender);
    avatar.textContent = sender === 'user' ? 'U' : 'S';

    const content = document.createElement('div');
    content.classList.add('message-content');

    // Anexos
    if (files.length > 0) {
        const attachments = document.createElement('div');
        attachments.classList.add('message-attachments');

        files.forEach(file => {
            if (isImageFile(file)) {
                const imgWrap = document.createElement('div');
                imgWrap.classList.add('message-file-image');
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.alt = file.name;
                imgWrap.appendChild(img);
                attachments.appendChild(imgWrap);
            } else {
                const fileCard = document.createElement('div');
                fileCard.classList.add('message-file');
                fileCard.innerHTML = `
                    <div class="file-icon"><i class="fas ${getFileIcon(file.type)}"></i></div>
                    <div class="file-info">
                        <div class="file-name" title="${file.name}">${file.name}</div>
                        <div class="file-size">${formatFileSize(file.size)}</div>
                    </div>
                `;
                attachments.appendChild(fileCard);
            }
        });

        content.appendChild(attachments);
    }

    // Texto (suporta markdown simples)
    if (text) {
        const textDiv = document.createElement('div');
        textDiv.classList.add('msg-text');
        textDiv.innerHTML = formatMarkdown(text);
        content.appendChild(textDiv);
    }

    // Feedback buttons (só nas mensagens do bot)
    if (sender === 'bot' && text && !text.startsWith('⚠️')) {
        const feedbackWrap = document.createElement('div');
        feedbackWrap.classList.add('msg-feedback');
        feedbackWrap.innerHTML = `
            <button class="feedback-btn" onclick="handleFeedback(this, 'up')" title="Boa resposta"><i class="fas fa-thumbs-up"></i></button>
            <button class="feedback-btn" onclick="handleFeedback(this, 'down')" title="Resposta ruim"><i class="fas fa-thumbs-down"></i></button>
        `;
        content.appendChild(feedbackWrap);
    }

    msg.appendChild(avatar);
    msg.appendChild(content);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return content; // retorna content para streaming
}

// ============================
// Syntax Highlighting
// ============================
function getLangIcon(lang) {
    const icons = {
        'python': '<i class="fab fa-python"></i>',
        'javascript': '<i class="fab fa-js-square"></i>',
        'js': '<i class="fab fa-js-square"></i>',
        'html': '<i class="fab fa-html5"></i>',
        'css': '<i class="fab fa-css3-alt"></i>',
        'java': '<i class="fab fa-java"></i>',
        'php': '<i class="fab fa-php"></i>',
        'node': '<i class="fab fa-node-js"></i>',
        'react': '<i class="fab fa-react"></i>',
        'sql': '<i class="fas fa-database"></i>',
        'bash': '<i class="fas fa-terminal"></i>',
        'shell': '<i class="fas fa-terminal"></i>',
        'json': '<i class="fas fa-brackets-curly"></i>',
        'git': '<i class="fab fa-git-alt"></i>',
    };
    return icons[lang.toLowerCase()] || '<i class="fas fa-code"></i>';
}

function highlightSyntax(code, lang) {
    const l = lang.toLowerCase();

    // Tokens protegidos (substituídos por placeholders para não interferir entre si)
    const tokens = [];
    function protect(match, className) {
        const idx = tokens.length;
        tokens.push(`<span class="hl-${className}">${match}</span>`);
        return `%%TOKEN_${idx}%%`;
    }

    // 1. Comentários multilinha
    code = code.replace(/(\/\*[\s\S]*?\*\/)/g, m => protect(m, 'comment'));
    // Comentários de linha (# ou //)
    code = code.replace(/((?:\/\/|#).*)$/gm, m => protect(m, 'comment'));

    // 2. Strings (aspas triplas python, depois aspas simples/duplas)
    code = code.replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, m => protect(m, 'string'));
    code = code.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, m => protect(m, 'string'));
    // Template strings JS
    code = code.replace(/(`(?:[^`\\]|\\.)*`)/g, m => protect(m, 'string'));

    // 3. Decorators (Python)
    code = code.replace(/(@\w+)/g, m => protect(m, 'decorator'));

    // 4. Números
    code = code.replace(/\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi, m => protect(m, 'number'));

    // 5. Keywords por linguagem
    let keywords;
    if (['python', 'py'].includes(l)) {
        keywords = 'False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|not|or|pass|raise|return|try|while|with|yield';
    } else if (['javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx'].includes(l)) {
        keywords = 'abstract|arguments|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield|async|true|false';
    } else if (['java', 'c', 'cpp', 'csharp', 'cs'].includes(l)) {
        keywords = 'abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|null|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|true|false|string|var|using|namespace';
    } else if (['php'].includes(l)) {
        keywords = 'abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|die|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|eval|exit|extends|final|finally|fn|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|match|namespace|new|null|or|print|private|protected|public|require|require_once|return|static|switch|throw|trait|try|unset|use|var|while|xor|yield|true|false';
    } else if (['sql'].includes(l)) {
        keywords = 'SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|ADD|INDEX|JOIN|INNER|LEFT|RIGHT|OUTER|ON|AND|OR|NOT|NULL|IS|IN|BETWEEN|LIKE|ORDER|BY|GROUP|HAVING|LIMIT|DISTINCT|AS|COUNT|SUM|AVG|MAX|MIN|PRIMARY|KEY|FOREIGN|REFERENCES|INT|VARCHAR|TEXT|DATE|BOOLEAN';
    } else {
        keywords = 'if|else|for|while|do|switch|case|break|continue|return|function|class|const|let|var|new|try|catch|throw|import|export|from|default|null|true|false|void|int|string|float|double|boolean';
    }
    code = code.replace(new RegExp(`\\b(${keywords})\\b`, 'g'), m => protect(m, 'keyword'));

    // 6. Built-in functions
    let builtins;
    if (['python', 'py'].includes(l)) {
        builtins = 'print|len|range|input|int|str|float|list|dict|set|tuple|type|isinstance|enumerate|zip|map|filter|sorted|reversed|open|format|abs|max|min|sum|round|any|all|hasattr|getattr|setattr|super|property|classmethod|staticmethod';
    } else if (['javascript', 'js', 'typescript', 'ts'].includes(l)) {
        builtins = 'console|log|warn|error|info|parseInt|parseFloat|isNaN|isFinite|decodeURI|encodeURI|setTimeout|setInterval|clearTimeout|clearInterval|fetch|alert|prompt|confirm|Math|JSON|Array|Object|String|Number|Boolean|Date|Promise|Map|Set|RegExp|Error|document|window|require|module|process';
    } else {
        builtins = 'print|println|printf|scanf|cout|cin|System|Math|String|Arrays|Collections|ArrayList|HashMap|IOException';
    }
    code = code.replace(new RegExp(`\\b(${builtins})\\b`, 'g'), m => protect(m, 'builtin'));

    // 7. Operadores
    code = code.replace(/(===|!==|==|!=|&lt;=|&gt;=|=&gt;|&lt;|&gt;|\+\+|--|\|\||&amp;&amp;)/g, m => protect(m, 'operator'));

    // 8. HTML tags (para html/xml)
    if (['html', 'xml', 'svg', 'jsx', 'tsx'].includes(l)) {
        code = code.replace(/(&lt;\/?)([\w-]+)/g, (match, bracket, tag) => {
            return protect(bracket, 'operator') + protect(tag, 'tag');
        });
    }

    // Restaura tokens
    let result = code;
    tokens.forEach((token, i) => {
        result = result.replace(`%%TOKEN_${i}%%`, token);
    });

    return result;
}

// Formata markdown para HTML com code blocks estilizados
function formatMarkdown(text) {
    // Primeiro: protege code blocks ```
    const codeBlocks = [];
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        const index = codeBlocks.length;
        const language = lang || 'code';
        const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;').trimEnd();

        // Aplica syntax highlighting
        const highlightedCode = highlightSyntax(escapedCode, language);

        // Gera linhas numeradas com highlight
        const lines = highlightedCode.split('\n');
        const numberedLines = lines.map((line, i) =>
            `<span class="code-line"><span class="line-number">${i + 1}</span><span class="line-content">${line}</span></span>`
        ).join('\n');

        // Ícone baseado na linguagem
        const langIcon = getLangIcon(language);

        codeBlocks.push(
            `<div class="code-canvas">` +
            `<div class="code-header">` +
            `<span class="code-lang">${langIcon} ${language}</span>` +
            `<button class="code-copy-btn" onclick="copyCode(this)" title="Copiar código">` +
            `<i class="fas fa-copy"></i> Copiar` +
            `</button>` +
            `</div>` +
            `<pre class="code-body"><code>${numberedLines}</code></pre>` +
            `</div>`
        );
        return `%%CODEBLOCK_${index}%%`;
    });

    // Inline code `
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Tables (markdown)
    text = text.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock) => {
        const rows = tableBlock.trim().split('\n').filter(r => r.trim());
        if (rows.length < 2) return tableBlock;
        let html = '<div class="md-table-wrap"><table class="md-table">';
        rows.forEach((row, i) => {
            if (row.replace(/[|\-\s:]/g, '') === '') return; // separador
            const cells = row.split('|').filter(c => c !== '').map(c => c.trim());
            const tag = i === 0 ? 'th' : 'td';
            html += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
        });
        html += '</table></div>';
        return html;
    });

    // Headings ### ## #
    text = text.replace(/^### (.+)$/gm, '<h4 class="md-h">$1</h4>');
    text = text.replace(/^## (.+)$/gm, '<h3 class="md-h">$1</h3>');
    text = text.replace(/^# (.+)$/gm, '<h2 class="md-h">$1</h2>');

    // Bold **text**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Unordered lists (- item)
    text = text.replace(/((?:^- .+$\n?)+)/gm, (listBlock) => {
        const items = listBlock.trim().split('\n').map(l => l.replace(/^- /, '').trim());
        return '<ul class="md-list">' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';
    });

    // Ordered lists (1. item)
    text = text.replace(/((?:^\d+\. .+$\n?)+)/gm, (listBlock) => {
        const items = listBlock.trim().split('\n').map(l => l.replace(/^\d+\. /, '').trim());
        return '<ol class="md-list">' + items.map(i => `<li>${i}</li>`).join('') + '</ol>';
    });

    // Links [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="md-link">$1</a>');

    // Horizontal rule ---
    text = text.replace(/^---$/gm, '<hr class="md-hr">');

    // Line breaks
    text = text.replace(/\n/g, '<br>');

    // Restaura code blocks
    codeBlocks.forEach((block, i) => {
        text = text.replace(`%%CODEBLOCK_${i}%%`, block);
    });

    return text;
}

// Função global para copiar código
window.copyCode = function (btn) {
    const codeBody = btn.closest('.code-canvas').querySelector('code');
    // Pega só o texto, sem os números de linha
    const lines = codeBody.querySelectorAll('.code-line');
    let codeText = '';
    lines.forEach(line => {
        // Pega o texto sem o número de linha
        const clone = line.cloneNode(true);
        const lineNum = clone.querySelector('.line-number');
        if (lineNum) lineNum.remove();
        codeText += clone.textContent + '\n';
    });

    navigator.clipboard.writeText(codeText.trimEnd()).then(() => {
        const icon = btn.querySelector('i');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.classList.remove('copied');
        }, 2000);
    });
};

function showTyping() {
    const msg = document.createElement('div');
    msg.classList.add('message');
    msg.id = 'typing-msg';

    const avatar = document.createElement('div');
    avatar.classList.add('message-avatar', 'bot');
    avatar.textContent = 'S';

    const content = document.createElement('div');
    content.classList.add('message-content');

    // Skeleton loading
    const skeleton = document.createElement('div');
    skeleton.classList.add('skeleton-loader');
    skeleton.innerHTML = `
        <div class="skeleton-line" style="width: 85%"></div>
        <div class="skeleton-line" style="width: 65%"></div>
        <div class="skeleton-line short" style="width: 45%"></div>
    `;
    content.appendChild(skeleton);

    msg.appendChild(avatar);
    msg.appendChild(content);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
    const el = document.getElementById('typing-msg');
    if (el) el.remove();
}

// ============================
// Chamada à API Gemini
// ============================
async function callGeminiAPI(text, files = []) {
    // Monta as parts da mensagem do usuário
    const userParts = [];

    // Adiciona arquivos como inlineData
    for (const file of files) {
        try {
            const base64Data = await fileToBase64(file);
            userParts.push({
                inlineData: {
                    mimeType: file.type || 'application/octet-stream',
                    data: base64Data
                }
            });
        } catch (err) {
            console.warn('Erro ao converter arquivo:', file.name, err);
        }
    }

    // Adiciona o texto
    if (text) {
        userParts.push({ text: text });
    } else if (files.length > 0) {
        userParts.push({ text: 'Analise o(s) arquivo(s) enviado(s) e descreva seu conteúdo.' });
    }

    // Adiciona ao histórico
    conversationHistory.push({
        role: 'user',
        parts: userParts.filter(p => p.text) // histórico só guarda texto
    });

    // Monta o body da requisição
    const requestBody = {
        system_instruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        contents: [
            // Histórico anterior (só texto)
            ...conversationHistory.slice(0, -1),
            // Mensagem atual (com arquivos)
            {
                role: 'user',
                parts: userParts
            }
        ],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096
        }
    };

    const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData?.error?.message || `Erro HTTP ${response.status}`;
        throw new Error(errorMsg);
    }

    const data = await response.json();
    const botText = data?.candidates?.[0]?.content?.parts?.[0]?.text
        || 'Não consegui gerar uma resposta. Tente novamente.';

    // Salva resposta no histórico
    conversationHistory.push({
        role: 'model',
        parts: [{ text: botText }]
    });

    // Limita histórico para não exceder limites da API
    if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
    }

    return botText;
}

// ============================
// Enviar mensagem
// ============================
async function sendMessage() {
    if (isSending) return;

    const text = promptInput.value.trim();
    const files = [...pendingFiles];

    if (!text && files.length === 0) return;

    isSending = true;
    sendBtn.disabled = true;

    hideWelcome();
    createMessage(text, 'user', files);
    promptInput.value = '';
    pendingFiles = [];
    renderPreviewStrip();

    // Rate limiting check
    if (rateLimitCooldown > 0) {
        const timeSince = Date.now() - lastSendTime;
        if (timeSince < rateLimitCooldown) {
            const waitSec = Math.ceil((rateLimitCooldown - timeSince) / 1000);
            createMessage(`⏳ Aguarde ${waitSec}s antes de enviar outra mensagem.`, 'bot');
            isSending = false;
            sendBtn.disabled = false;
            return;
        }
    }
    lastSendTime = Date.now();

    showTyping();

    // Error retry (até 3 tentativas)
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const botReply = await callGeminiAPI(text, files);
            removeTyping();

            // Streaming typewriter effect
            const botContent = createMessage('', 'bot');
            const textDiv = botContent.querySelector('.msg-text') || document.createElement('div');
            textDiv.classList.add('msg-text');
            if (!botContent.querySelector('.msg-text')) botContent.insertBefore(textDiv, botContent.querySelector('.msg-feedback'));

            await typewriterEffect(textDiv, botReply);

            lastError = null;
            break;
        } catch (error) {
            lastError = error;
            console.warn(`Tentativa ${attempt}/3 falhou:`, error.message);
            if (attempt < 3) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }

    if (lastError) {
        removeTyping();
        console.error('Erro na API Gemini após 3 tentativas:', lastError);
        createMessage(`⚠️ Erro: ${lastError.message}`, 'bot');
    }

    isSending = false;
    sendBtn.disabled = false;
    promptInput.focus();
}

sendBtn.addEventListener('click', sendMessage);

promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// ============================
// Suggestion Cards
// ============================
suggestionCards.forEach(card => {
    card.addEventListener('click', () => {
        const prompt = card.getAttribute('data-prompt');
        promptInput.value = prompt;
        sendMessage();
    });
});

// ============================
// Botão Novo Chat
// ============================
document.getElementById('new-chat').addEventListener('click', () => {
    conversationHistory = [];
    chatMessages.innerHTML = '';

    // Recria tela de boas-vindas
    chatMessages.innerHTML = `
        <div class="welcome" id="welcome">
            <div class="welcome-logo">
                <img src="img/SENAI-AI 1.png" alt="SENAI GPT Logo">
                <div class="logo-glow"></div>
            </div>
            <h1 class="welcome-title">SENAI <span class="accent">GPT</span></h1>
            <p class="welcome-subtitle">Como posso te ajudar hoje?</p>
            <div class="suggestion-cards">
                <div class="suggestion-card" data-prompt="O que é inteligência artificial?">
                    <i class="fas fa-lightbulb"></i>
                    <span>O que é inteligência artificial?</span>
                </div>
                <div class="suggestion-card" data-prompt="Me explique sobre machine learning">
                    <i class="fas fa-brain"></i>
                    <span>Me explique sobre machine learning</span>
                </div>
                <div class="suggestion-card" data-prompt="Como funciona um chatbot?">
                    <i class="fas fa-robot"></i>
                    <span>Como funciona um chatbot?</span>
                </div>
                <div class="suggestion-card" data-prompt="Quais os cursos do SENAI?">
                    <i class="fas fa-graduation-cap"></i>
                    <span>Quais os cursos do SENAI?</span>
                </div>
            </div>
        </div>
    `;

    // Re-bind suggestion cards
    document.querySelectorAll('.suggestion-card').forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.getAttribute('data-prompt');
            promptInput.value = prompt;
            sendMessage();
        });
    });
});

// ============================
// Streaming Typewriter Effect
// ============================
async function typewriterEffect(element, text) {
    const formattedHTML = formatMarkdown(text);
    // Insere de uma vez com delay visual
    const words = text.split(' ');
    let current = '';
    for (let i = 0; i < words.length; i++) {
        current += (i > 0 ? ' ' : '') + words[i];
        element.innerHTML = formatMarkdown(current);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        // Velocidade: mais rápido com mais palavras
        const delay = words.length > 100 ? 8 : words.length > 50 ? 15 : 25;
        await new Promise(r => setTimeout(r, delay));
    }
    // Renderiza final completo
    element.innerHTML = formattedHTML;
}

// ============================
// Feedback 👍👎
// ============================
window.handleFeedback = function (btn, type) {
    const wrap = btn.closest('.msg-feedback');
    wrap.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    btn.classList.add(type === 'up' ? 'liked' : 'disliked');
};

// ============================
// Exportar Chat
// ============================
document.getElementById('export-chat').addEventListener('click', () => {
    const messages = chatMessages.querySelectorAll('.message');
    if (messages.length === 0) return;

    let exportText = '=== SENAI GPT — Conversa Exportada ===\n';
    exportText += `Data: ${new Date().toLocaleString('pt-BR')}\n\n`;

    messages.forEach(msg => {
        if (msg.id === 'typing-msg') return;
        const avatar = msg.querySelector('.message-avatar');
        const content = msg.querySelector('.msg-text');
        if (!content) return;
        const sender = avatar.classList.contains('bot') ? 'SENAI GPT' : 'Você';
        exportText += `[${sender}]\n${content.textContent.trim()}\n\n`;
    });

    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `senai-gpt-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
});

// ============================
// Extra: fadeOut keyframe (injetado)
// ============================
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to   { opacity: 0; transform: translateY(-20px); }
    }
`;
document.head.appendChild(style);
