// ============================
// INOVA SENAI — Sistema Híbrido de IA
// ============================

// Tier Mappings
const TIER_MODELS = {
    gemini: {
        classic: 'gemini-2.5-flash-lite',
        perfect: 'gemini-2.5-flash',
        ultimate: 'gemini-2.5-pro',
        ultra: 'gemini-3.1-pro-preview'
    },
    openrouter: {
        classic: 'arcee-ai/trinity-mini:free',
        perfect: 'nvidia/nemotron-3-nano-30b-a3b:free',
        ultimate: 'stepfun/step-3.5-flash:free',
        ultra: 'arcee-ai/trinity-large-preview:free'
    }
};

// Config from localStorage (no config.js needed)
let currentProvider = localStorage.getItem('ai-provider') || 'gemini';
let currentTier = localStorage.getItem('ai-tier') || 'perfect';
let currentModel = TIER_MODELS[currentProvider]?.[currentTier] || 'gemini-2.5-flash';
let currentTemperature = parseFloat(localStorage.getItem('ai-temp') || '0.7');
let openrouterBaseUrl = localStorage.getItem('openrouter-url') || 'https://openrouter.ai/api/v1/chat/completions';

function getApiKey() {
    return localStorage.getItem(`api-key-${currentProvider}`) || '';
}

function getGeminiStreamURL() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:streamGenerateContent?alt=sse&key=${getApiKey()}`;
}

function getGeminiFallbackURL() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${getApiKey()}`;
}

// Histórico de conversa para contexto
let conversationHistory = [];

// Personalidades da IA
const PERSONALITIES = {
    padrao: `Você é o INOVA SENAI, um assistente virtual inteligente do SENAI (Serviço Nacional de Aprendizagem Industrial).
Responda sempre em português brasileiro. Seja educado, claro e útil.
Você pode ajudar com dúvidas sobre tecnologia, programação, cursos do SENAI, e assuntos gerais.
Quando receber arquivos, analise-os e descreva seu conteúdo da melhor forma possível.`,

    casual: `Você é o INOVA SENAI, um assistente super gente boa e descontraído.
Fale de um jeito casual, use gírias brasileiras (tipo "tá ligado", "mano", "show de bola", "bora", "suave", "firmeza").
Seja divertido e acessível, como se fosse um amigo explicando as coisas.
Use emojis de vez em quando 😄🚀. Responda sempre em português brasileiro.
Mesmo sendo casual, dê informações corretas e úteis.`,

    tecnico: `Você é o INOVA SENAI no modo Técnico. Seja direto, objetivo e focado em código.
Priorize respostas com código, exemplos práticos e documentação técnica.
Use termos técnicos sem simplificar demais. Inclua comentários no código.
Evite textos longos desnecessarios — vá direto ao ponto com soluções.
Sempre que possível, mostre código funcional e completo em português brasileiro.`,

    professor: `Você é o INOVA SENAI no modo Professor. Ensine de forma didática e passo a passo.
Explique conceitos com analogias simples do dia a dia.
Use exemplos progressivos: começe pelo básico e aumente a complexidade.
Faça perguntas retoricas para engajar o aluno. Use listas numeradas.
Inclua "Dica:" e "Atenção:" para destacar pontos importantes.
Responda sempre em português brasileiro de forma acolhedora.`
};

let currentPersonality = localStorage.getItem('ai-personality') || 'padrao';
let customPrompt = localStorage.getItem('ai-custom-prompt') || '';
let persistentContext = localStorage.getItem('ai-persistent-context') || '';

function getSystemInstruction() {
    let base = customPrompt || PERSONALITIES[currentPersonality] || PERSONALITIES.padrao;
    if (persistentContext) base += '\n\n[Contexto do Usuário]: ' + persistentContext;
    return base;
}

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
const chatHistoryList = document.getElementById('chat-history-list');
const sidebar = document.getElementById('sidebar');

let pendingFiles = [];
let isSending = false;
let currentAbortController = null;

// ============================
// Persistência (JSON/localStorage)
// ============================
const STORAGE_KEY = 'inova-senai-chats';
const MAX_CHATS = 50;
let allChats = [];
let activeChatId = null;

function loadChats() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (data && data.chats) {
            allChats = data.chats;
            activeChatId = data.activeChat || null;
        }
    } catch (e) {
        allChats = [];
        activeChatId = null;
    }
}

function saveChats() {
    // Limita a MAX_CHATS
    if (allChats.length > MAX_CHATS) {
        allChats = allChats.slice(-MAX_CHATS);
    }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            chats: allChats,
            activeChat: activeChatId
        }));
    } catch (e) {
        console.warn('localStorage cheio, removendo chat mais antigo');
        allChats.shift();
        saveChats();
    }
}

function generateTitle(text) {
    if (!text) return 'Nova conversa';
    const words = text.trim().split(/\s+/).slice(0, 6).join(' ');
    return words.length > 35 ? words.substring(0, 35) + '...' : words;
}

function getActiveChat() {
    return allChats.find(c => c.id === activeChatId) || null;
}

function addMessageToChat(sender, text) {
    const chat = getActiveChat();
    if (!chat) return;
    chat.messages.push({
        sender,
        text,
        timestamp: new Date().toISOString(),
        starred: false
    });
    // Atualiza título na primeira mensagem do usuário
    if (sender === 'user' && chat.messages.filter(m => m.sender === 'user').length === 1) {
        chat.title = generateTitle(text);
    }
    saveChats();
    renderChatHistory();
}

function createNewChat() {
    const chat = {
        id: 'chat_' + Date.now(),
        title: 'Nova conversa',
        createdAt: new Date().toISOString(),
        messages: []
    };
    allChats.push(chat);
    activeChatId = chat.id;
    conversationHistory = [];
    saveChats();
    renderChatHistory();
    showWelcome();
}

function switchChat(chatId) {
    const chat = allChats.find(c => c.id === chatId);
    if (!chat) return;
    activeChatId = chatId;
    saveChats();

    // Limpa a tela
    chatMessages.innerHTML = '';
    conversationHistory = [];

    if (chat.messages.length === 0) {
        showWelcome();
    } else {
        // Reconstrói mensagens na tela
        chat.messages.forEach(m => {
            createMessage(m.text, m.sender, [], false); // false = não salvar de novo
        });
        // Reconstrói histórico da API
        chat.messages.forEach(m => {
            conversationHistory.push({
                role: m.sender === 'user' ? 'user' : 'model',
                parts: [{ text: m.text }]
            });
        });
    }
    renderChatHistory();
}

function deleteChat(chatId) {
    allChats = allChats.filter(c => c.id !== chatId);
    if (activeChatId === chatId) {
        if (allChats.length > 0) {
            switchChat(allChats[allChats.length - 1].id);
        } else {
            activeChatId = null;
            createNewChat();
        }
    }
    saveChats();
    renderChatHistory();
}

let activeTagFilter = 'all';

function renderChatHistory(searchQuery = '') {
    if (!chatHistoryList) return;
    chatHistoryList.innerHTML = '';

    const mobileList = document.getElementById('mobile-drawer-list');
    if (mobileList) mobileList.innerHTML = '';

    // Mais recente primeiro, com filtro de busca e tag
    let sorted = [...allChats].reverse();
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        sorted = sorted.filter(c => c.title.toLowerCase().includes(q));
    }
    if (activeTagFilter !== 'all') {
        sorted = sorted.filter(c => (c.tag || 'geral') === activeTagFilter);
    }

    const TAG_LABELS = { trabalho: '💼', estudo: '📚', codigo: '💻', geral: '📦' };

    sorted.forEach(chat => {
        const tagLabel = chat.tag && chat.tag !== 'geral' ? `<span class="chat-item-tag">${TAG_LABELS[chat.tag] || ''} ${chat.tag}</span>` : '';
        const html = `
            <div class="chat-item-info">
                <span class="chat-item-title">${chat.title}</span>
                <span class="chat-item-date">${new Date(chat.createdAt).toLocaleDateString('pt-BR')}${tagLabel}</span>
            </div>
            <button class="chat-item-delete" onclick="event.stopPropagation(); window._deleteChat('${chat.id}')" title="Deletar">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;

        // Sidebar item
        const item = document.createElement('div');
        item.classList.add('chat-history-item');
        if (chat.id === activeChatId) item.classList.add('active');
        item.innerHTML = html;
        item.querySelector('.chat-item-info').addEventListener('click', () => window._switchChat(chat.id));
        item.querySelector('.chat-item-title').addEventListener('dblclick', (e) => {
            e.stopPropagation();
            startRenameChat(chat.id, e.target);
        });
        // Right-click for tag
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showTagContextMenu(e.clientX, e.clientY, chat.id);
        });
        chatHistoryList.appendChild(item);

        // Mobile drawer item
        if (mobileList) {
            const mItem = document.createElement('div');
            mItem.classList.add('chat-history-item');
            if (chat.id === activeChatId) mItem.classList.add('active');
            mItem.innerHTML = html;
            mItem.querySelector('.chat-item-info').addEventListener('click', () => {
                window._switchChat(chat.id);
                closeMobileDrawer();
            });
            mItem.querySelector('.chat-item-title').addEventListener('dblclick', (e) => {
                e.stopPropagation();
                startRenameChat(chat.id, e.target);
            });
            mobileList.appendChild(mItem);
        }
    });
}

function startRenameChat(chatId, titleEl) {
    const chat = allChats.find(c => c.id === chatId);
    if (!chat) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.classList.add('chat-item-title-edit');
    input.value = chat.title;
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const finishRename = () => {
        const newTitle = input.value.trim() || chat.title;
        chat.title = newTitle;
        saveChats();
        renderChatHistory();
    };

    input.addEventListener('blur', finishRename);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = chat.title; input.blur(); }
    });
}

function closeMobileDrawer() {
    document.getElementById('mobile-drawer-overlay')?.classList.remove('open');
}

// Expor para onclick inline
window._switchChat = switchChat;
window._deleteChat = (id) => { deleteChat(id); renderChatHistory(); };

function showWelcome() {
    chatMessages.innerHTML = `
        <div class="welcome" id="welcome">
            <div class="welcome-logo">
                <img src="img/SENAI-AI 1.png" alt="INOVA SENAI Logo">
                <div class="logo-glow"></div>
            </div>
            <h1 class="welcome-title">INOVA <span class="accent">SENAI</span></h1>
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
            promptInput.value = card.getAttribute('data-prompt');
            sendMessage();
        });
    });
}

// Sidebar toggle
document.getElementById('sidebar-toggle').addEventListener('click', () => {
    sidebar.classList.toggle('expanded');
    localStorage.setItem('sidebar-expanded', sidebar.classList.contains('expanded'));
});

// Restaura estado da sidebar
if (localStorage.getItem('sidebar-expanded') === 'false') {
    sidebar.classList.remove('expanded');
}

// Inicializa persistência
loadChats();
if (allChats.length === 0) {
    createNewChat();
} else {
    renderChatHistory();
    if (activeChatId) {
        switchChat(activeChatId);
    } else {
        switchChat(allChats[allChats.length - 1].id);
    }
}

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

function createMessage(text, sender, files = [], shouldSave = true) {
    const msg = document.createElement('div');
    msg.classList.add('message');

    const avatar = document.createElement('div');
    avatar.classList.add('message-avatar', sender);

    if (sender === 'bot') {
        avatar.innerHTML = '<i class="fas fa-robot"></i>';
    } else {
        const userAvatar = localStorage.getItem('user-avatar');
        if (userAvatar) {
            avatar.style.backgroundImage = `url(${userAvatar})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
            avatar.textContent = '';
        } else {
            avatar.textContent = 'U';
        }
    }

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
    if (sender === 'bot' && text && !text.startsWith('⚠️') && !text.startsWith('⚙️') && !text.startsWith('⏳')) {
        const feedbackWrap = document.createElement('div');
        feedbackWrap.classList.add('msg-feedback');
        feedbackWrap.innerHTML = `
            <button class="feedback-btn" onclick="toggleStar(this)" title="Favoritar"><i class="far fa-star"></i></button>
            <button class="feedback-btn" onclick="speakText(this)" title="Ouvir resposta"><i class="fas fa-volume-up"></i></button>
            <button class="feedback-btn" onclick="handleFeedback(this, 'up')" title="Boa resposta"><i class="fas fa-thumbs-up"></i></button>
            <button class="feedback-btn" onclick="handleFeedback(this, 'down')" title="Resposta ruim"><i class="fas fa-thumbs-down"></i></button>
        `;
        content.appendChild(feedbackWrap);
    } else if (sender === 'user' && text) {
        // Star para usuário também
        const feedbackWrap = document.createElement('div');
        feedbackWrap.classList.add('msg-feedback');
        feedbackWrap.innerHTML = `
            <button class="feedback-btn" onclick="toggleStar(this)" title="Favoritar"><i class="far fa-star"></i></button>
        `;
        content.appendChild(feedbackWrap);
    }

    msg.appendChild(avatar);
    msg.appendChild(content);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Auto-save
    if (shouldSave && text) {
        addMessageToChat(sender, text);
    }

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

        // Mermaid diagram
        if (language.toLowerCase() === 'mermaid') {
            const mermaidSource = code.trim();
            const escaped = mermaidSource.replace(/'/g, '\'').replace(/"/g, '&quot;');
            codeBlocks.push(
                `<div class="mermaid-container">` +
                `<div class="mermaid-header">` +
                `<span class="mermaid-label"><i class="fas fa-project-diagram"></i> Mermaid</span>` +
                `<div class="mermaid-actions">` +
                `<button onclick="copyMermaidCode(this)" title="Copiar código Mermaid"><i class="fas fa-code"></i> Código</button>` +
                `<button onclick="copyMermaidImage(this)" title="Copiar como imagem"><i class="fas fa-image"></i> Imagem</button>` +
                `</div></div>` +
                `<div class="mermaid-body"><div class="mermaid" data-source="${escaped}">${mermaidSource}</div></div>` +
                `</div>`
            );
            return `%%CODEBLOCK_${index}%%`;
        }

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

        // Botão Run para JS
        const isRunnable = ['javascript', 'js'].includes(language.toLowerCase());
        const runBtn = isRunnable
            ? `<button class="code-run-btn" onclick="runCode(this)" title="Executar código"><i class="fas fa-play"></i> Run</button>`
            : '';

        codeBlocks.push(
            `<div class="code-canvas">` +
            `<div class="code-header">` +
            `<span class="code-lang">${langIcon} ${language}</span>` +
            `<div class="code-actions">` +
            runBtn +
            `<button class="code-copy-btn" onclick="copyCode(this)" title="Copiar código">` +
            `<i class="fas fa-copy"></i> Copiar` +
            `</button>` +
            `</div>` +
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
    avatar.innerHTML = '<i class="fas fa-robot"></i>';

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
// Chamada à API — Sistema Híbrido com Streaming SSE
// ============================
async function callAPI(text, files = [], abortSignal) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('Chave de API não configurada. Vá em Configurações e adicione sua API Key.');
    }

    if (currentProvider === 'gemini') {
        return await callGeminiStreaming(text, files, abortSignal);
    } else {
        return await callOpenRouterStreaming(text, abortSignal);
    }
}

async function callGeminiStreaming(text, files, abortSignal) {
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

    if (text) {
        userParts.push({ text });
    } else if (files.length > 0) {
        userParts.push({ text: 'Analise o(s) arquivo(s) enviado(s) e descreva seu conteúdo.' });
    }

    // Histórico no formato Gemini
    const geminiHistory = conversationHistory.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }]
    }));

    const requestBody = {
        system_instruction: {
            parts: [{ text: getSystemInstruction() }]
        },
        contents: [
            ...geminiHistory,
            { role: 'user', parts: userParts }
        ],
        generationConfig: {
            temperature: currentTemperature,
            maxOutputTokens: 4096
        }
    };

    // Tenta streaming SSE primeiro
    try {
        const response = await fetch(getGeminiStreamURL(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: abortSignal
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData?.error?.message || `Erro HTTP ${response.status}`);
        }

        return { stream: response.body, type: 'gemini-sse' };
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        // Fallback para não-streaming
        const response = await fetch(getGeminiFallbackURL(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: abortSignal
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData?.error?.message || `Erro HTTP ${response.status}`);
        }
        const data = await response.json();
        const botText = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta.';
        return { text: botText, type: 'fallback' };
    }
}

async function callOpenRouterStreaming(text, abortSignal) {
    const messages = [
        { role: 'system', content: getSystemInstruction() },
        ...conversationHistory.map(m => ({ role: m.role, content: m.text })),
        { role: 'user', content: text }
    ];

    const response = await fetch(openrouterBaseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getApiKey()}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'INOVA SENAI'
        },
        body: JSON.stringify({
            model: currentModel,
            messages,
            temperature: currentTemperature,
            max_tokens: 4096,
            stream: true
        }),
        signal: abortSignal
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `Erro HTTP ${response.status}`);
    }

    return { stream: response.body, type: 'openrouter-sse' };
}

// Processa stream SSE e retorna texto completo
async function processStream(result, textElement) {
    if (result.type === 'fallback') {
        textElement.innerHTML = formatMarkdown(result.text);
        return result.text;
    }

    const reader = result.stream.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    let token = '';

                    if (result.type === 'gemini-sse') {
                        token = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    } else {
                        token = parsed?.choices?.[0]?.delta?.content || '';
                    }

                    if (token) {
                        fullText += token;
                        textElement.innerHTML = formatMarkdown(fullText);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                } catch (e) { /* ignore parse errors */ }
            }
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            fullText += ' *[Interrompido]*';
            textElement.innerHTML = formatMarkdown(fullText);
        } else {
            throw err;
        }
    } finally {
        reader.releaseLock();
    }

    return fullText;
}

// ============================
// Enviar mensagem
// ============================
async function sendMessage() {
    if (isSending) return;

    const text = promptInput.value.trim();
    let files = [...pendingFiles];

    if (!text && files.length === 0) return;

    // Validação de ficheiros (máx 10MB, só Gemini)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (files.length > 0) {
        if (currentProvider !== 'gemini') {
            alert('Anexos de ficheiros só são suportados com o provedor Gemini.');
            files = [];
        } else {
            const oversized = files.filter(f => f.size > MAX_FILE_SIZE);
            if (oversized.length > 0) {
                alert(`Ficheiro(s) excede(m) 10MB: ${oversized.map(f => f.name).join(', ')}. Remova-os e tente novamente.`);
                return;
            }
        }
    }

    isSending = true;
    const stopBtn = document.getElementById('stop-btn');
    sendBtn.style.display = 'none';
    stopBtn.style.display = 'flex';

    // AbortController
    currentAbortController = new AbortController();
    stopBtn.onclick = () => {
        if (currentAbortController) currentAbortController.abort();
    };

    hideWelcome();
    createMessage(text, 'user', files);

    // Se não tem chat ativo, cria um
    if (!activeChatId || !getActiveChat()) {
        createNewChat();
    }
    promptInput.value = '';
    pendingFiles = [];
    renderPreviewStrip();

    // Salva no histórico neutro
    conversationHistory.push({ role: 'user', text });
    if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
    }

    // Rate limiting check
    if (rateLimitCooldown > 0) {
        const timeSince = Date.now() - lastSendTime;
        if (timeSince < rateLimitCooldown) {
            const waitSec = Math.ceil((rateLimitCooldown - timeSince) / 1000);
            createMessage(`⏳ Aguarde ${waitSec}s antes de enviar outra mensagem.`, 'bot');
            isSending = false;
            sendBtn.style.display = 'flex';
            stopBtn.style.display = 'none';
            return;
        }
    }
    lastSendTime = Date.now();

    showTyping();

    try {
        const result = await callAPI(text, files, currentAbortController.signal);
        removeTyping();

        // Cria mensagem do bot com elemento de texto vazio para streaming
        const botContent = createMessage('', 'bot', [], false);
        let textDiv = botContent.querySelector('.msg-text');
        if (!textDiv) {
            textDiv = document.createElement('div');
            textDiv.classList.add('msg-text');
            botContent.insertBefore(textDiv, botContent.querySelector('.msg-feedback'));
        }

        const botReply = await processStream(result, textDiv);

        // Salva no histórico neutro
        conversationHistory.push({ role: 'assistant', text: botReply });
        if (conversationHistory.length > 20) {
            conversationHistory = conversationHistory.slice(-20);
        }

        addMessageToChat('bot', botReply);
        playNotificationSound();

    } catch (error) {
        removeTyping();
        if (error.name !== 'AbortError') {
            console.error('Erro na API:', error);
            createMessage(`⚠️ Erro: ${error.message}`, 'bot');
        }
    }

    currentAbortController = null;
    isSending = false;
    sendBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
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
    createNewChat();
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
// Exportar Chat (Dropdown multi-formato)
// ============================
const exportBtn = document.getElementById('export-chat');
const exportDropdown = document.getElementById('export-dropdown');

exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown.classList.toggle('open');
});

document.addEventListener('click', () => exportDropdown?.classList.remove('open'));

function getChatExportData() {
    const messages = chatMessages.querySelectorAll('.message');
    const items = [];
    messages.forEach(msg => {
        if (msg.id === 'typing-msg') return;
        const avatar = msg.querySelector('.message-avatar');
        const content = msg.querySelector('.msg-text');
        if (!content) return;
        const sender = avatar.classList.contains('bot') ? 'INOVA SENAI' : 'Você';
        items.push({ sender, text: content.textContent.trim() });
    });
    return items;
}

function exportAsTxt() {
    const items = getChatExportData();
    if (!items.length) return;
    let txt = '=== INOVA SENAI \u2014 Conversa Exportada ===\n';
    txt += `Data: ${new Date().toLocaleString('pt-BR')}\n\n`;
    items.forEach(i => txt += `[${i.sender}]\n${i.text}\n\n`);
    downloadFile(txt, `inova-senai-${Date.now()}.txt`, 'text/plain');
}

function exportAsMarkdown() {
    const items = getChatExportData();
    if (!items.length) return;
    let md = '# INOVA SENAI \u2014 Conversa\n\n';
    md += `> Exportada em ${new Date().toLocaleString('pt-BR')}\n\n---\n\n`;
    items.forEach(i => {
        const icon = i.sender === 'Você' ? '\ud83d\udde3\ufe0f' : '\ud83e\udd16';
        md += `### ${icon} ${i.sender}\n\n${i.text}\n\n---\n\n`;
    });
    downloadFile(md, `inova-senai-${Date.now()}.md`, 'text/markdown');
}

function exportAsPdf() {
    const items = getChatExportData();
    if (!items.length) return;
    const w = window.open('', '_blank');
    w.document.write(`
        <html><head><title>INOVA SENAI</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
            h1 { color: #dd203c; border-bottom: 2px solid #dd203c; padding-bottom: 8px; }
            .meta { color: #888; font-size: 0.85rem; margin-bottom: 24px; }
            .msg { margin-bottom: 20px; padding: 12px 16px; border-radius: 8px; }
            .user { background: #f0f0f5; border-left: 3px solid #dd203c; }
            .bot { background: #fafafa; border-left: 3px solid #3b82f6; }
            .sender { font-weight: 600; margin-bottom: 4px; font-size: 0.85rem; }
            .text { white-space: pre-wrap; line-height: 1.6; }
        </style></head><body>
        <h1>INOVA SENAI</h1>
        <p class="meta">Exportada em ${new Date().toLocaleString('pt-BR')}</p>
        ${items.map(i => `<div class="msg ${i.sender === 'Voc\u00ea' ? 'user' : 'bot'}"><div class="sender">${i.sender}</div><div class="text">${i.text}</div></div>`).join('')}
        </body></html>
    `);
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

document.querySelectorAll('.export-option').forEach(opt => {
    opt.addEventListener('click', () => {
        const format = opt.dataset.format;
        if (format === 'txt') exportAsTxt();
        if (format === 'md') exportAsMarkdown();
        if (format === 'pdf') exportAsPdf();
        exportDropdown.classList.remove('open');
    });
});
// ============================
// Settings Panel \u2014 Sistema H\u00edbrido
// ============================
const settingsOverlay = document.getElementById('settings-overlay');
const settingsBtn = document.getElementById('settings-btn');
const settingsClose = document.getElementById('settings-close');
const settingsSave = document.getElementById('settings-save');
const providerSelect = document.getElementById('provider-select');
const tierSelect = document.getElementById('tier-select');
const apiKeyInput = document.getElementById('api-key-input');
const modelDisplay = document.getElementById('model-display');
const openrouterUrlGroup = document.getElementById('openrouter-url-group');
const openrouterUrlInput = document.getElementById('openrouter-url');
const fetchModelsGroup = document.getElementById('fetch-models-group');
const fetchModelsBtn = document.getElementById('fetch-models-btn');
const freeModelsList = document.getElementById('free-models-list');
const tempSlider = document.getElementById('temp-slider');
const tempValue = document.getElementById('temp-value');
const customPromptInput = document.getElementById('custom-prompt');

// Fun\u00e7\u00e3o para atualizar modelo baseado em provedor/tier
function updateModelFromTier() {
    const model = TIER_MODELS[providerSelect.value]?.[tierSelect.value] || '';
    modelDisplay.value = model;
}

// Provedor toggle: mostra/oculta campos OpenRouter
function updateProviderUI() {
    const isOR = providerSelect.value === 'openrouter';
    openrouterUrlGroup.style.display = isOR ? 'block' : 'none';
    fetchModelsGroup.style.display = isOR ? 'block' : 'none';
    // Carrega API key do provedor atual
    apiKeyInput.value = localStorage.getItem(`api-key-${providerSelect.value}`) || '';
    updateModelFromTier();
}

providerSelect.addEventListener('change', updateProviderUI);
tierSelect.addEventListener('change', updateModelFromTier);

// Carrega valores salvos
providerSelect.value = currentProvider;
tierSelect.value = currentTier;
tempSlider.value = currentTemperature;
tempValue.textContent = currentTemperature;
customPromptInput.value = customPrompt;
apiKeyInput.value = getApiKey();
openrouterUrlInput.value = openrouterBaseUrl;
const pcInit = document.getElementById('persistent-context');
if (pcInit) pcInit.value = persistentContext;
updateProviderUI();

// Marca personalidade ativa
document.querySelectorAll('.personality-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.personality === currentPersonality);
});

settingsBtn.addEventListener('click', () => {
    settingsOverlay.classList.add('open');
});

settingsClose.addEventListener('click', () => {
    settingsOverlay.classList.remove('open');
});

settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
});

tempSlider.addEventListener('input', () => {
    tempValue.textContent = tempSlider.value;
});

document.querySelectorAll('.personality-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.personality-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// Buscar Modelos Free (OpenRouter)
fetchModelsBtn.addEventListener('click', async () => {
    freeModelsList.innerHTML = '<small>Buscando...</small>';
    try {
        const res = await fetch('https://openrouter.ai/api/v1/models');
        const data = await res.json();
        const freeModels = (data.data || []).filter(m => m.pricing?.prompt === '0' || m.id.includes(':free'));
        if (freeModels.length === 0) {
            freeModelsList.innerHTML = '<small>Nenhum modelo free encontrado.</small>';
            return;
        }
        freeModelsList.innerHTML = freeModels.slice(0, 20).map(m =>
            `<div class="free-model-item" data-model="${m.id}"><strong>${m.name || m.id}</strong><br><small>${m.id}</small></div>`
        ).join('');
        freeModelsList.querySelectorAll('.free-model-item').forEach(item => {
            item.addEventListener('click', () => {
                modelDisplay.value = item.dataset.model;
                freeModelsList.innerHTML = '';
            });
        });
    } catch (err) {
        freeModelsList.innerHTML = `<small>Erro: ${err.message}</small>`;
    }
});

settingsSave.addEventListener('click', () => {
    // Salva provedor
    currentProvider = providerSelect.value;
    localStorage.setItem('ai-provider', currentProvider);

    // Salva tier
    currentTier = tierSelect.value;
    localStorage.setItem('ai-tier', currentTier);

    // Salva modelo
    currentModel = modelDisplay.value;

    // Salva API key do provedor atual
    localStorage.setItem(`api-key-${currentProvider}`, apiKeyInput.value.trim());

    // Salva URL base OpenRouter
    openrouterBaseUrl = openrouterUrlInput.value.trim();
    localStorage.setItem('openrouter-url', openrouterBaseUrl);

    // Salva temperatura
    currentTemperature = parseFloat(tempSlider.value);
    localStorage.setItem('ai-temp', currentTemperature);

    // Salva personalidade
    const activePersonality = document.querySelector('.personality-btn.active');
    currentPersonality = activePersonality ? activePersonality.dataset.personality : 'padrao';
    localStorage.setItem('ai-personality', currentPersonality);

    // Salva prompt personalizado
    customPrompt = customPromptInput.value.trim();
    localStorage.setItem('ai-custom-prompt', customPrompt);

    // Salva contexto persistente
    const pcInput = document.getElementById('persistent-context');
    persistentContext = pcInput ? pcInput.value.trim() : '';
    localStorage.setItem('ai-persistent-context', persistentContext);

    // Fecha painel
    settingsOverlay.classList.remove('open');
    createMessage('\u2699\ufe0f Configura\u00e7\u00f5es salvas!', 'bot');
});

// ============================
// Speech-to-Text (Web Speech API)
// ============================
const captureBtn = document.getElementById('capture');
let isRecording = false;
let recognition = null;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        promptInput.value = transcript;
        captureBtn.classList.remove('recording');
        isRecording = false;
    };

    recognition.onerror = () => {
        captureBtn.classList.remove('recording');
        isRecording = false;
    };

    recognition.onend = () => {
        captureBtn.classList.remove('recording');
        isRecording = false;
    };
}

captureBtn.addEventListener('click', () => {
    if (!recognition) {
        alert('Seu navegador não suporta reconhecimento de voz.');
        return;
    }
    if (isRecording) {
        recognition.stop();
        isRecording = false;
        captureBtn.classList.remove('recording');
    } else {
        recognition.start();
        isRecording = true;
        captureBtn.classList.add('recording');
    }
});

// ============================
// Text-to-Speech
// ============================
window.speakText = function (btn) {
    const msgText = btn.closest('.message-content').querySelector('.msg-text');
    if (!msgText) return;

    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        btn.classList.remove('speaking');
        return;
    }

    const utterance = new SpeechSynthesisUtterance(msgText.textContent);
    utterance.lang = 'pt-BR';
    utterance.rate = 1;

    utterance.onend = () => btn.classList.remove('speaking');
    btn.classList.add('speaking');
    window.speechSynthesis.speak(utterance);
};

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

// ============================
// Webcam ao Vivo
// ============================
const webcamOverlay = document.getElementById('webcam-overlay');
const webcamVideo = document.getElementById('webcam-video');
const webcamCanvas = document.getElementById('webcam-canvas');
let webcamStream = null;

document.getElementById('webcam-btn').addEventListener('click', async () => {
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        webcamVideo.srcObject = webcamStream;
        webcamOverlay.classList.add('open');
    } catch (err) {
        alert('Não foi possível acessar a câmera. Verifique as permissões.');
    }
});

function closeWebcam() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(t => t.stop());
        webcamStream = null;
    }
    webcamVideo.srcObject = null;
    webcamOverlay.classList.remove('open');
}

document.getElementById('webcam-close').addEventListener('click', closeWebcam);
webcamOverlay.addEventListener('click', (e) => { if (e.target === webcamOverlay) closeWebcam(); });

document.getElementById('webcam-capture').addEventListener('click', () => {
    webcamCanvas.width = webcamVideo.videoWidth;
    webcamCanvas.height = webcamVideo.videoHeight;
    webcamCanvas.getContext('2d').drawImage(webcamVideo, 0, 0);

    webcamCanvas.toBlob(blob => {
        const file = new File([blob], 'webcam-capture.jpg', { type: 'image/jpeg' });
        pendingFiles.push(file);
        renderPreviewStrip();
        closeWebcam();
        promptInput.focus();
    }, 'image/jpeg', 0.85);
});

// ============================
// Executor de Código (JS)
// ============================
window.runCode = function (btn) {
    const codeBlock = btn.closest('.code-block');
    const lines = codeBlock.querySelectorAll('.line-content');
    let code = '';
    lines.forEach(line => { code += line.textContent + '\n'; });

    // Remove resultado anterior
    const existing = codeBlock.querySelector('.code-output');
    if (existing) existing.remove();

    const outputDiv = document.createElement('div');
    outputDiv.classList.add('code-output');

    try {
        // Captura console.log
        const logs = [];
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        iframe.contentWindow.console = {
            log: (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
            error: (...args) => logs.push('ERROR: ' + args.join(' ')),
            warn: (...args) => logs.push('WARN: ' + args.join(' '))
        };

        const result = iframe.contentWindow.eval(code);
        document.body.removeChild(iframe);

        const output = logs.length > 0 ? logs.join('\n') : (result !== undefined ? String(result) : 'Executado sem saída');
        outputDiv.innerHTML = `<span class="output-label">Output:</span><pre>${output}</pre>`;
        outputDiv.classList.add('success');
    } catch (err) {
        outputDiv.innerHTML = `<span class="output-label">Erro:</span><pre>${err.message}</pre>`;
        outputDiv.classList.add('error');
    }

    codeBlock.appendChild(outputDiv);
};

// ============================
// Compartilhar Conversa
// ============================
document.getElementById('share-chat').addEventListener('click', () => {
    const chat = getActiveChat();
    if (!chat || chat.messages.length === 0) {
        alert('Nenhuma conversa para compartilhar.');
        return;
    }

    const shareData = {
        title: chat.title,
        messages: chat.messages.map(m => ({ s: m.sender[0], t: m.text }))
    };

    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))));
    const url = window.location.origin + window.location.pathname + '#shared=' + encoded;

    navigator.clipboard.writeText(url).then(() => {
        createMessage('📎 Link copiado para a área de transferência!', 'bot', [], false);
    }).catch(() => {
        prompt('Copie o link:', url);
    });
});

// Carrega conversa compartilhada via URL
(function loadSharedChat() {
    const hash = window.location.hash;
    if (!hash.startsWith('#shared=')) return;

    try {
        const data = JSON.parse(decodeURIComponent(escape(atob(hash.replace('#shared=', '')))));
        createNewChat();

        const chat = getActiveChat();
        chat.title = '📎 ' + (data.title || 'Compartilhado');

        data.messages.forEach(m => {
            const sender = m.s === 'u' ? 'user' : 'bot';
            createMessage(m.t, sender, [], false);
            chat.messages.push({ sender, text: m.t, timestamp: new Date().toISOString(), starred: false });
        });

        saveChats();
        renderChatHistory();
        window.location.hash = '';
    } catch (e) {
        console.warn('Erro ao carregar conversa compartilhada:', e);
    }
})();

// ============================
// Avatar do Usuário (click p/ trocar)
// ============================
document.addEventListener('dblclick', (e) => {
    const avatar = e.target.closest('.message-avatar.user');
    if (!avatar) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            localStorage.setItem('user-avatar', reader.result);
            // Atualiza todos os avatares na tela
            document.querySelectorAll('.message-avatar.user').forEach(a => {
                a.style.backgroundImage = `url(${reader.result})`;
                a.style.backgroundSize = 'cover';
                a.style.backgroundPosition = 'center';
                a.textContent = '';
            });
        };
        reader.readAsDataURL(file);
    };
    input.click();
});

// ============================
// Favoritar Mensagem (Star)
// ============================
window.toggleStar = function (btn) {
    const icon = btn.querySelector('i');
    const msgDiv = btn.closest('.message');
    const text = msgDiv.querySelector('.msg-text')?.textContent || "";

    const chat = getActiveChat();
    if (!chat) return;

    // Encontra a mensagem no histórico do chat ativo
    // Usamos o texto e a posição relativa para identificar
    const msgObj = chat.messages.find(m => m.text === text && !m.starred);
    // Se não achar uma não favoritada, procura qualquer uma (toggle off)
    const target = msgObj || chat.messages.find(m => m.text === text);

    if (target) {
        target.starred = !target.starred;
        if (target.starred) {
            icon.classList.replace('far', 'fas');
            icon.style.color = '#f59e0b'; // Gold
            btn.title = "Remover favorito";
        } else {
            icon.classList.replace('fas', 'far');
            icon.style.color = '';
            btn.title = "Favoritar";
        }
        saveChats();
    }
};

// ============================
// RODADA 1 — Novas Features
// ============================

// 1. MODO FOCO
const focusBtn = document.getElementById('focus-btn');
const focusExitHint = document.getElementById('focus-exit-hint');

function toggleFocusMode() {
    document.body.classList.toggle('focus-mode');
    const isFocus = document.body.classList.contains('focus-mode');
    if (focusBtn) focusBtn.innerHTML = isFocus ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
}

if (focusBtn) focusBtn.addEventListener('click', toggleFocusMode);
if (focusExitHint) focusExitHint.addEventListener('click', toggleFocusMode);

// 2. BUSCAR NAS CONVERSAS
const chatSearchInput = document.getElementById('chat-search');
if (chatSearchInput) {
    chatSearchInput.addEventListener('input', () => {
        renderChatHistory(chatSearchInput.value.trim());
    });
}

const mobileChatSearch = document.getElementById('mobile-chat-search');
if (mobileChatSearch) {
    mobileChatSearch.addEventListener('input', () => {
        renderChatHistory(mobileChatSearch.value.trim());
    });
}

// 3. ATALHOS DE TECLADO
document.addEventListener('keydown', (e) => {
    // Ctrl+N — Novo chat
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        createNewChat();
    }
    // Ctrl+K — Focar na busca
    if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (chatSearchInput) {
            if (!sidebar.classList.contains('expanded')) sidebar.classList.add('expanded');
            chatSearchInput.focus();
        }
    }
    // Ctrl+Shift+S — Abrir configurações
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        document.getElementById('settings-overlay')?.classList.add('open');
    }
    // Escape — Sair do modo foco ou fechar modais
    if (e.key === 'Escape') {
        if (document.body.classList.contains('focus-mode')) {
            toggleFocusMode();
        }
        document.getElementById('settings-overlay')?.classList.remove('open');
        closeMobileDrawer();
    }
});

// 4. NOTIFICAÇÃO SONORA (Web Audio API)
function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) { /* silent fallback */ }
}

// 5. HISTÓRICO MOBILE (Drawer)
const mobileHistoryBtn = document.getElementById('mobile-history-btn');
const mobileDrawerOverlay = document.getElementById('mobile-drawer-overlay');
const mobileDrawerClose = document.getElementById('mobile-drawer-close');
const mobileNewChat = document.getElementById('mobile-new-chat');

if (mobileHistoryBtn) {
    mobileHistoryBtn.addEventListener('click', () => {
        renderChatHistory();
        mobileDrawerOverlay?.classList.add('open');
    });
}
if (mobileDrawerClose) mobileDrawerClose.addEventListener('click', closeMobileDrawer);
if (mobileDrawerOverlay) {
    mobileDrawerOverlay.addEventListener('click', (e) => {
        if (e.target === mobileDrawerOverlay) closeMobileDrawer();
    });
}
if (mobileNewChat) {
    mobileNewChat.addEventListener('click', () => {
        createNewChat();
        closeMobileDrawer();
    });
}

// ============================
// RODADA 2 — Prompt Templates
// ============================
const templatesBtn = document.getElementById('templates-btn');
const templatesOverlay = document.getElementById('templates-overlay');
const templatesClose = document.getElementById('templates-close');

if (templatesBtn) {
    templatesBtn.addEventListener('click', () => {
        templatesOverlay?.classList.add('open');
    });
}
if (templatesClose) {
    templatesClose.addEventListener('click', () => {
        templatesOverlay?.classList.remove('open');
    });
}
if (templatesOverlay) {
    templatesOverlay.addEventListener('click', (e) => {
        if (e.target === templatesOverlay) templatesOverlay.classList.remove('open');
    });
}

document.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
        const template = card.dataset.template;
        promptInput.value = template + ' ';
        templatesOverlay?.classList.remove('open');
        promptInput.focus();
    });
});

// ============================
// RODADA 2 — Contador de Tokens
// ============================
function estimateTokens(text) {
    // Estimativa simples: ~4 chars por token (padrão GPT/Gemini)
    return Math.ceil((text || '').length / 4);
}

function updateTokenCounter() {
    const counter = document.getElementById('token-counter');
    if (!counter) return;
    const chat = getActiveChat();
    if (!chat || !chat.messages?.length) {
        counter.textContent = '0 tokens';
        return;
    }
    const totalChars = chat.messages.reduce((sum, m) => sum + (m.text || '').length, 0);
    const tokens = estimateTokens(totalChars.toString().repeat(0) || '') || Math.ceil(totalChars / 4);
    counter.textContent = `~${Math.ceil(totalChars / 4)} tokens`;
}

// Atualiza ao carregar e após cada mensagem
updateTokenCounter();
const _origAddMsg = addMessageToChat;
addMessageToChat = function (sender, text) {
    _origAddMsg(sender, text);
    updateTokenCounter();
};

// ============================
// RODADA 3 — Tag Filter Pills
// ============================
document.querySelectorAll('.tag-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        document.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeTagFilter = pill.dataset.tag;
        renderChatHistory();
    });
});

// ============================
// RODADA 3 — Tag Context Menu (right-click)
// ============================
function showTagContextMenu(x, y, chatId) {
    // Remove existing
    document.querySelectorAll('.tag-context-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.classList.add('tag-context-menu');
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const tags = [
        { tag: 'trabalho', label: '💼 Trabalho' },
        { tag: 'estudo', label: '📚 Estudo' },
        { tag: 'codigo', label: '💻 Código' },
        { tag: 'geral', label: '📦 Geral' }
    ];

    tags.forEach(t => {
        const item = document.createElement('div');
        item.classList.add('tag-context-item');
        item.textContent = t.label;
        item.addEventListener('click', () => {
            const chat = allChats.find(c => c.id === chatId);
            if (chat) {
                chat.tag = t.tag;
                saveChats();
                renderChatHistory();
            }
            menu.remove();
        });
        menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Close on click outside
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
}

// ============================
// RODADA 3 — Agentes Especializados
// ============================
let activeAgent = null;
const agentsBtn = document.getElementById('agents-btn');
const agentsOverlay = document.getElementById('agents-overlay');
const agentsClose = document.getElementById('agents-close');

if (agentsBtn) {
    agentsBtn.addEventListener('click', () => {
        agentsOverlay?.classList.add('open');
    });
}
if (agentsClose) {
    agentsClose.addEventListener('click', () => {
        agentsOverlay?.classList.remove('open');
    });
}
if (agentsOverlay) {
    agentsOverlay.addEventListener('click', (e) => {
        if (e.target === agentsOverlay) agentsOverlay.classList.remove('open');
    });
}

document.querySelectorAll('.agent-card').forEach(card => {
    card.addEventListener('click', () => {
        const agentName = card.querySelector('strong').textContent;
        const agentPrompt = card.dataset.prompt;
        activeAgent = { name: agentName, prompt: agentPrompt };

        // Set customPrompt to the agent's prompt
        customPrompt = agentPrompt;
        localStorage.setItem('ai-custom-prompt', customPrompt);
        const cpInput = document.getElementById('custom-prompt');
        if (cpInput) cpInput.value = customPrompt;

        agentsOverlay?.classList.remove('open');

        // Show active agent badge
        document.querySelectorAll('.agent-active-badge').forEach(b => b.remove());
        const badge = document.createElement('div');
        badge.classList.add('agent-active-badge');
        badge.innerHTML = `<i class="fas fa-user-cog"></i> ${agentName} <span style="opacity:0.5;font-size:0.65rem;">(clique p/ desativar)</span>`;
        badge.addEventListener('click', () => {
            activeAgent = null;
            customPrompt = '';
            localStorage.setItem('ai-custom-prompt', '');
            const cpInput = document.getElementById('custom-prompt');
            if (cpInput) cpInput.value = '';
            badge.remove();
            createMessage('🤖 Agente desativado. Voltando ao modo padrão.', 'bot');
        });
        document.body.appendChild(badge);

        createMessage(`🤖 **${agentName}** ativado! O sistema agora está configurado como: "${agentPrompt.substring(0, 80)}..."`, 'bot');
    });
});

// ============================
// RODADA 3 — Mermaid Initialization
// ============================
if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose'
    });
}

function renderMermaidDiagrams() {
    if (typeof mermaid === 'undefined') return;
    const els = document.querySelectorAll('.mermaid:not([data-processed])');
    els.forEach(async (el) => {
        try {
            el.setAttribute('data-processed', 'true');
            const id = 'mermaid-' + Date.now() + Math.random().toString(36).substr(2, 5);
            const { svg } = await mermaid.render(id, el.textContent.trim());
            el.innerHTML = svg;
        } catch (e) {
            el.innerHTML = '<small style="color:var(--text-muted)">⚠️ Diagrama Mermaid inválido</small>';
        }
    });
}

// Call after each message append
const __origCreateMsg = createMessage;
createMessage = function (...args) {
    const result = __origCreateMsg(...args);
    setTimeout(renderMermaidDiagrams, 100);
    return result;
};

// Initial render
setTimeout(renderMermaidDiagrams, 500);

// Copy Mermaid code
window.copyMermaidCode = function (btn) {
    const container = btn.closest('.mermaid-container');
    const mermaidEl = container.querySelector('.mermaid');
    const source = mermaidEl.dataset.source || mermaidEl.textContent;
    navigator.clipboard.writeText('```mermaid\n' + source + '\n```').then(() => {
        btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
        setTimeout(() => btn.innerHTML = '<i class="fas fa-code"></i> Código', 2000);
    });
};

// Copy Mermaid as image
window.copyMermaidImage = function (btn) {
    const container = btn.closest('.mermaid-container');
    const svg = container.querySelector('svg');
    if (!svg) {
        btn.innerHTML = '<i class="fas fa-times"></i> Sem SVG';
        setTimeout(() => btn.innerHTML = '<i class="fas fa-image"></i> Imagem', 2000);
        return;
    }
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        ctx.scale(2, 2);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(blob => {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
                btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
                setTimeout(() => btn.innerHTML = '<i class="fas fa-image"></i> Imagem', 2000);
            });
        }, 'image/png');
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
};

// ============================
// RODADA 3 — Multi-Model Comparison
// ============================
const compareBtn = document.getElementById('compare-btn');
const compareOverlay = document.getElementById('compare-overlay');
const compareClose = document.getElementById('compare-close');
const compareSend = document.getElementById('compare-send');

if (compareBtn) {
    compareBtn.addEventListener('click', () => compareOverlay?.classList.add('open'));
}
if (compareClose) {
    compareClose.addEventListener('click', () => compareOverlay?.classList.remove('open'));
}
if (compareOverlay) {
    compareOverlay.addEventListener('click', (e) => {
        if (e.target === compareOverlay) compareOverlay.classList.remove('open');
    });
}

// Populate compare selects from TIER_MODELS
function populateCompareSelects() {
    const selA = document.getElementById('compare-model-a');
    const selB = document.getElementById('compare-model-b');
    if (!selA || !selB) return;

    const TIER_LABELS = { classic: '⚡ Classic', perfect: '🎯 Perfect', ultimate: '🚀 Ultimate', ultra: '💎 Ultra' };
    const PROVIDER_LABELS = { gemini: '🤖 Gemini', openrouter: '🌐 OpenRouter' };

    [selA, selB].forEach((sel, idx) => {
        sel.innerHTML = '';
        for (const [provider, tiers] of Object.entries(TIER_MODELS)) {
            const group = document.createElement('optgroup');
            group.label = PROVIDER_LABELS[provider] || provider;
            for (const [tier, modelId] of Object.entries(tiers)) {
                const opt = document.createElement('option');
                opt.value = modelId;
                opt.textContent = `${TIER_LABELS[tier] || tier} — ${modelId}`;
                group.appendChild(opt);
            }
            sel.appendChild(group);
        }
        // Default: A = first gemini, B = first openrouter
        const geminiModels = Object.values(TIER_MODELS.gemini || {});
        const orModels = Object.values(TIER_MODELS.openrouter || {});
        if (idx === 0 && geminiModels.length) sel.value = geminiModels[1] || geminiModels[0]; // perfect tier
        if (idx === 1 && orModels.length) sel.value = orModels[1] || orModels[0];
    });
}
populateCompareSelects();

async function callModelDirect(modelId, prompt) {
    const isGemini = modelId.startsWith('gemini-');
    const start = Date.now();

    if (isGemini) {
        // Gemini API
        const apiKey = localStorage.getItem('api-key-gemini') || '';
        if (!apiKey) throw new Error('Chave Gemini não configurada');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: currentTemperature, maxOutputTokens: 2048 }
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `Gemini HTTP ${res.status}`);
        }
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta';
        return { text, time: Date.now() - start, model: modelId };
    } else {
        // OpenRouter API
        const apiKey = localStorage.getItem('api-key-openrouter') || '';
        if (!apiKey) throw new Error('Chave OpenRouter não configurada');
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'INOVA SENAI'
            },
            body: JSON.stringify({
                model: modelId,
                messages: [
                    { role: 'system', content: getSystemInstruction() },
                    { role: 'user', content: prompt }
                ],
                temperature: currentTemperature,
                max_tokens: 2048
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `OpenRouter HTTP ${res.status}`);
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || 'Sem resposta';
        return { text, time: Date.now() - start, model: modelId };
    }
}

function createComparisonView(prompt, modelA, modelB) {
    // User message
    createMessage(prompt, 'user');

    // Split view container
    const msg = document.createElement('div');
    msg.classList.add('message');

    const avatar = document.createElement('div');
    avatar.classList.add('message-avatar', 'bot');
    avatar.innerHTML = '<i class="fas fa-robot"></i>';

    const content = document.createElement('div');
    content.classList.add('message-content');

    const label = document.createElement('div');
    label.classList.add('msg-text');
    label.innerHTML = '<strong>⚡ Comparação Multi-Modelo</strong>';
    content.appendChild(label);

    const split = document.createElement('div');
    split.classList.add('compare-split');
    split.innerHTML = `
        <div class="compare-card" id="compare-result-a">
            <div class="compare-card-header model-a"><i class="fas fa-robot"></i> ${modelA}</div>
            <div class="compare-card-body compare-skeleton">
                <div class="skel-line"></div>
                <div class="skel-line"></div>
                <div class="skel-line"></div>
            </div>
        </div>
        <div class="compare-card" id="compare-result-b">
            <div class="compare-card-header model-b"><i class="fas fa-robot"></i> ${modelB}</div>
            <div class="compare-card-body compare-skeleton">
                <div class="skel-line"></div>
                <div class="skel-line"></div>
                <div class="skel-line"></div>
            </div>
        </div>
    `;
    content.appendChild(split);

    msg.appendChild(avatar);
    msg.appendChild(content);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return split;
}

if (compareSend) {
    compareSend.addEventListener('click', async () => {
        const modelA = document.getElementById('compare-model-a').value;
        const modelB = document.getElementById('compare-model-b').value;
        const prompt = document.getElementById('compare-prompt').value.trim();

        if (!prompt) {
            document.getElementById('compare-prompt').focus();
            return;
        }

        compareOverlay.classList.remove('open');

        const split = createComparisonView(prompt, modelA, modelB);
        const cardA = split.querySelector('#compare-result-a');
        const cardB = split.querySelector('#compare-result-b');

        // Call both models in parallel
        const [resultA, resultB] = await Promise.allSettled([
            callModelDirect(modelA, prompt),
            callModelDirect(modelB, prompt)
        ]);

        // Render Model A
        const bodyA = cardA.querySelector('.compare-card-body');
        if (resultA.status === 'fulfilled') {
            bodyA.classList.remove('compare-skeleton');
            bodyA.innerHTML = `<div class="msg-text">${formatMarkdown(resultA.value.text)}</div>`;
            const footerA = document.createElement('div');
            footerA.classList.add('compare-card-footer');
            footerA.innerHTML = `<span>⏱️ ${(resultA.value.time / 1000).toFixed(1)}s</span><span>~${Math.ceil(resultA.value.text.length / 4)} tokens</span>`;
            cardA.appendChild(footerA);
        } else {
            bodyA.classList.remove('compare-skeleton');
            bodyA.innerHTML = `<div class="msg-text" style="color:var(--accent)">⚠️ ${resultA.reason.message}</div>`;
        }

        // Render Model B
        const bodyB = cardB.querySelector('.compare-card-body');
        if (resultB.status === 'fulfilled') {
            bodyB.classList.remove('compare-skeleton');
            bodyB.innerHTML = `<div class="msg-text">${formatMarkdown(resultB.value.text)}</div>`;
            const footerB = document.createElement('div');
            footerB.classList.add('compare-card-footer');
            footerB.innerHTML = `<span>⏱️ ${(resultB.value.time / 1000).toFixed(1)}s</span><span>~${Math.ceil(resultB.value.text.length / 4)} tokens</span>`;
            cardB.appendChild(footerB);
        } else {
            bodyB.classList.remove('compare-skeleton');
            bodyB.innerHTML = `<div class="msg-text" style="color:var(--accent)">⚠️ ${resultB.reason.message}</div>`;
        }

        // Render Mermaid if present
        setTimeout(renderMermaidDiagrams, 200);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Play notification
        playNotificationSound?.();
    });
}
