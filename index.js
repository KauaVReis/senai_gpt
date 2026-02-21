// ============================
// Configuração da API Gemini
// ============================
const GEMINI_API_KEY = 'AIzaSyDXzG18s80JiQjsx0vbRZbcxorq2zp_Bxw';
const GEMINI_MODEL = 'gemini-2.5-flash-preview-04-17';
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

let pendingFiles = [];
let isSending = false; // evita envios duplos

// ============================
// Tema (Dark / Light)
// ============================
function applyTheme(theme) {
    if (theme === 'light') {
        document.body.classList.remove('dark-mode');
        toggleIcon.classList.replace('fa-moon', 'fa-sun');
    } else {
        document.body.classList.add('dark-mode');
        toggleIcon.classList.replace('fa-sun', 'fa-moon');
    }
    localStorage.setItem('theme', theme);
}

const savedTheme = localStorage.getItem('theme');
if (savedTheme) applyTheme(savedTheme);

toggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark-mode');
    applyTheme(isDark ? 'light' : 'dark');
});

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
        textDiv.innerHTML = formatMarkdown(text);
        content.appendChild(textDiv);
    }

    msg.appendChild(avatar);
    msg.appendChild(content);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return content; // retorna content para streaming
}

// Formata markdown básico para HTML
function formatMarkdown(text) {
    return text
        // Code blocks ```
        .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        // Inline code `
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Bold **text**
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Italic *text*
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Line breaks
        .replace(/\n/g, '<br>');
}

function showTyping() {
    const msg = document.createElement('div');
    msg.classList.add('message');
    msg.id = 'typing-msg';

    const avatar = document.createElement('div');
    avatar.classList.add('message-avatar', 'bot');
    avatar.textContent = 'S';

    const content = document.createElement('div');
    content.classList.add('message-content');
    const indicator = document.createElement('div');
    indicator.classList.add('typing-indicator');
    indicator.innerHTML = '<span></span><span></span><span></span>';
    content.appendChild(indicator);

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

    showTyping();

    try {
        const botReply = await callGeminiAPI(text, files);
        removeTyping();
        createMessage(botReply, 'bot');
    } catch (error) {
        removeTyping();
        console.error('Erro na API Gemini:', error);
        createMessage(`⚠️ Erro: ${error.message}`, 'bot');
    } finally {
        isSending = false;
        sendBtn.disabled = false;
        promptInput.focus();
    }
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
