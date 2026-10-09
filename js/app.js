// ============================================================================
// INOVA SENAI — Aplicação Principal & Controlador Central (v2.0 - 2026)
// ============================================================================

import { TIER_MODELS, PERSONALITIES, DEFAULT_CONFIG } from './config.js';
import { dbService } from './db.js';
import { ApiService } from './api.js';
import { pythonRunner } from './python-runner.js';
import { canvasService } from './canvas.js';
import { katexService } from './katex-render.js';
import { speechService } from './speech.js';
import { uiRenderer } from './ui.js';

class InovaSenaiApp {
    constructor() {
        this.activeChatId = null;
        this.provider = localStorage.getItem('ai-provider') || DEFAULT_CONFIG.provider;
        this.tier = localStorage.getItem('ai-tier') || DEFAULT_CONFIG.tier;
        this.temperature = parseFloat(localStorage.getItem('ai-temp') || DEFAULT_CONFIG.temperature);
        this.personality = localStorage.getItem('ai-personality') || DEFAULT_CONFIG.personality;
        this.customPrompt = localStorage.getItem('ai-custom-prompt') || '';
        this.persistentContext = localStorage.getItem('ai-persistent-context') || '';
        this.openrouterUrl = localStorage.getItem('openrouter-url') || DEFAULT_CONFIG.openrouterBaseUrl;

        this.pendingFiles = [];
        this.isSending = false;
        this.abortController = null;
        this.activeTag = 'all';
        this.searchQuery = '';
        this.conversationContext = []; // histórico recente em memória para a API
    }

    async init() {
        console.log('🚀 Inicializando INOVA SENAI v2.0...');

        // 1. Inicializa banco IndexedDB (Dexie) e migra dados antigos se existirem
        await dbService.init();

        // 2. Inicializa Canvas e KaTeX
        canvasService.init();
        katexService.init().catch(() => {});

        // 3. Atualiza UI de configurações e modelos
        this._updateModelDisplay();
        this._loadSettingsToUI();

        // 4. Carrega histórico de conversas no sidebar
        await this.refreshChatHistoryList();

        // 5. Restaura última conversa ou exibe tela de boas-vindas
        const lastChatId = localStorage.getItem('inova-active-chat-id');
        if (lastChatId) {
            await this.selectChat(lastChatId);
        } else {
            uiRenderer.showWelcome();
        }

        // 6. Vincula todos os ouvintes de eventos
        this._bindUIEvents();

        console.log('✅ INOVA SENAI pronto!');
    }

    _updateModelDisplay() {
        const modelInput = document.getElementById('model-display');
        const model = TIER_MODELS[this.provider]?.[this.tier] || 'gemini-2.5-flash';
        if (modelInput) modelInput.value = model;
    }

    _loadSettingsToUI() {
        const providerSelect = document.getElementById('provider-select');
        const tierSelect = document.getElementById('tier-select');
        const tempSlider = document.getElementById('temp-slider');
        const tempValue = document.getElementById('temp-value');
        const apiKeyInput = document.getElementById('api-key-input');
        const customPromptInput = document.getElementById('custom-prompt');
        const persistentContextInput = document.getElementById('persistent-context');
        const openrouterUrlInput = document.getElementById('openrouter-url');
        const openrouterGroup = document.getElementById('openrouter-url-group');
        const fetchModelsGroup = document.getElementById('fetch-models-group');

        if (providerSelect) providerSelect.value = this.provider;
        if (tierSelect) tierSelect.value = this.tier;
        if (tempSlider) tempSlider.value = this.temperature;
        if (tempValue) tempValue.textContent = this.temperature;
        if (apiKeyInput) apiKeyInput.value = ApiService.getApiKey(this.provider);
        if (customPromptInput) customPromptInput.value = this.customPrompt;
        if (persistentContextInput) persistentContextInput.value = this.persistentContext;
        if (openrouterUrlInput) openrouterUrlInput.value = this.openrouterUrl;

        if (this.provider === 'openrouter') {
            if (openrouterGroup) openrouterGroup.style.display = 'block';
            if (fetchModelsGroup) fetchModelsGroup.style.display = 'block';
        } else {
            if (openrouterGroup) openrouterGroup.style.display = 'none';
            if (fetchModelsGroup) fetchModelsGroup.style.display = 'none';
        }

        // Seleciona botão de personalidade
        document.querySelectorAll('.personality-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.personality === this.personality);
        });
    }

    getSystemInstruction() {
        let base = this.customPrompt || PERSONALITIES[this.personality] || PERSONALITIES.padrao;
        if (this.persistentContext) {
            base += '\n\n[Contexto Persistente do Usuário]: ' + this.persistentContext;
        }
        return base;
    }

    // ==========================================
    // Gestão de Conversas (Chats)
    // ==========================================
    async createNewChat() {
        const newChat = {
            id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            title: 'Nova conversa',
            tag: 'geral',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isFavorite: false
        };

        await dbService.saveChat(newChat);
        this.activeChatId = newChat.id;
        localStorage.setItem('inova-active-chat-id', newChat.id);
        this.conversationContext = [];

        uiRenderer.clearChatMessages();
        uiRenderer.showWelcome();
        await this.refreshChatHistoryList();

        const promptInput = document.getElementById('prompt');
        if (promptInput) promptInput.focus();
    }

    async selectChat(chatId) {
        const chat = await dbService.getChat(chatId);
        if (!chat) {
            this.createNewChat();
            return;
        }

        this.activeChatId = chat.id;
        localStorage.setItem('inova-active-chat-id', chat.id);
        this.conversationContext = [];

        uiRenderer.clearChatMessages();
        uiRenderer.hideWelcome();

        // Renderiza mensagens salvas
        if (chat.messages && chat.messages.length > 0) {
            chat.messages.forEach(m => {
                uiRenderer.createMessageElement(m.text, m.role === 'user' ? 'user' : 'bot', m.files || []);
                this.conversationContext.push({ role: m.role, text: m.text });
            });
        } else {
            uiRenderer.showWelcome();
        }

        await this.refreshChatHistoryList();
    }

    async deleteChat(chatId, e) {
        if (e) e.stopPropagation();
        if (confirm('Tem certeza que deseja excluir esta conversa?')) {
            await dbService.deleteChat(chatId);
            if (this.activeChatId === chatId) {
                this.activeChatId = null;
                localStorage.removeItem('inova-active-chat-id');
                uiRenderer.clearChatMessages();
                uiRenderer.showWelcome();
            }
            await this.refreshChatHistoryList();
        }
    }

    async refreshChatHistoryList() {
        const listEl = document.getElementById('chat-history-list');
        const mobileListEl = document.getElementById('mobile-drawer-list');
        if (!listEl) return;

        let chats = await dbService.getAllChats();

        // Filtro por tag
        if (this.activeTag !== 'all') {
            chats = chats.filter(c => c.tag === this.activeTag);
        }

        // Filtro por busca
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            chats = chats.filter(c => c.title.toLowerCase().includes(q));
        }

        listEl.innerHTML = '';
        if (mobileListEl) mobileListEl.innerHTML = '';

        if (chats.length === 0) {
            const emptyNotice = '<div style="padding:12px;font-size:0.75rem;color:var(--text-muted);text-align:center">Nenhuma conversa encontrada</div>';
            listEl.innerHTML = emptyNotice;
            if (mobileListEl) mobileListEl.innerHTML = emptyNotice;
            return;
        }

        chats.forEach(chat => {
            const item = document.createElement('div');
            item.className = `chat-history-item ${chat.id === this.activeChatId ? 'active' : ''}`;
            const dateStr = new Date(chat.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

            item.innerHTML = `
                <div class="chat-item-info">
                    <div class="chat-item-title" title="${chat.title}">${chat.title}</div>
                    <div class="chat-item-date">${dateStr} • ${chat.tag || 'geral'}</div>
                </div>
                <button class="chat-item-delete" title="Excluir"><i class="fas fa-trash-alt"></i></button>
            `;

            item.addEventListener('click', () => this.selectChat(chat.id));
            item.querySelector('.chat-item-delete').addEventListener('click', (ev) => this.deleteChat(chat.id, ev));

            listEl.appendChild(item);

            if (mobileListEl) {
                const mobileItem = item.cloneNode(true);
                mobileItem.addEventListener('click', () => {
                    this.selectChat(chat.id);
                    document.getElementById('mobile-drawer-overlay')?.classList.remove('open');
                });
                mobileItem.querySelector('.chat-item-delete').addEventListener('click', (ev) => this.deleteChat(chat.id, ev));
                mobileListEl.appendChild(mobileItem);
            }
        });
    }

    // ==========================================
    // Envio e Processamento de Mensagens
    // ==========================================
    async sendMessage() {
        if (this.isSending) return;

        const promptInput = document.getElementById('prompt');
        const text = promptInput?.value.trim() || '';
        const files = [...this.pendingFiles];

        if (!text && files.length === 0) return;

        // Se não houver conversa ativa, cria uma
        if (!this.activeChatId) {
            await this.createNewChat();
        }

        this.isSending = true;
        this.abortController = new AbortController();

        const sendBtn = document.getElementById('send-btn');
        const stopBtn = document.getElementById('stop-btn');
        if (sendBtn) sendBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'flex';

        // Limpa input
        if (promptInput) promptInput.value = '';
        this.pendingFiles = [];
        this._renderPreviewStrip();
        uiRenderer.hideWelcome();

        // 1. Renderiza e salva mensagem do usuário
        uiRenderer.createMessageElement(text, 'user', files);
        await dbService.addMessage(this.activeChatId, { role: 'user', text, files });
        this.conversationContext.push({ role: 'user', text });

        // Atualiza título se for a primeira mensagem
        const currentChat = await dbService.getChat(this.activeChatId);
        if (currentChat && currentChat.title === 'Nova conversa') {
            const newTitle = text.slice(0, 30) + (text.length > 30 ? '...' : '');
            await dbService.updateChatTitle(this.activeChatId, newTitle);
            await this.refreshChatHistoryList();
        }

        uiRenderer.showTyping();

        // 2. Prepara mensagem do bot para streaming
        let botMsgItem = null;
        let botTextDiv = null;

        const onToken = (token, fullAccumulatedText) => {
            uiRenderer.removeTyping();
            if (!botMsgItem) {
                botMsgItem = uiRenderer.createMessageElement('', 'bot');
                botTextDiv = botMsgItem.textContainer;
            }
            if (botTextDiv) {
                botTextDiv.innerHTML = uiRenderer.formatMarkdown(fullAccumulatedText);
                uiRenderer.scrollToBottom();
            }
        };

        try {
            const reply = await ApiService.call({
                provider: this.provider,
                tier: this.tier,
                temperature: this.temperature,
                systemInstruction: this.getSystemInstruction(),
                history: this.conversationContext.slice(-15),
                text,
                files,
                openrouterUrl: this.openrouterUrl,
                abortSignal: this.abortController.signal,
                onToken
            });

            uiRenderer.removeTyping();

            if (!botMsgItem) {
                botMsgItem = uiRenderer.createMessageElement(reply, 'bot');
            } else if (botTextDiv) {
                botTextDiv.innerHTML = uiRenderer.formatMarkdown(reply);
                katexService.render(botTextDiv);
            }

            // Salva mensagem final do bot no IndexedDB
            await dbService.addMessage(this.activeChatId, { role: 'assistant', text: reply });
            this.conversationContext.push({ role: 'assistant', text: reply });

            // Detecta automaticamente artefatos ricos e oferece abertura no Canvas
            this._autoDetectArtifacts(reply);

        } catch (err) {
            uiRenderer.removeTyping();
            if (err.name !== 'AbortError') {
                console.error('[App] Erro na API:', err);
                uiRenderer.createMessageElement(`⚠️ Erro ao gerar resposta: ${err.message}`, 'bot');
            }
        } finally {
            this.isSending = false;
            this.abortController = null;
            if (sendBtn) sendBtn.style.display = 'flex';
            if (stopBtn) stopBtn.style.display = 'none';
            if (promptInput) promptInput.focus();
        }
    }

    _autoDetectArtifacts(text) {
        // Se a resposta contiver um bloco HTML completo ou SVG grande
        const htmlMatch = text.match(/```html\n([\s\S]*?)```/);
        const svgMatch = text.match(/```svg\n([\s\S]*?)```/);

        if (htmlMatch && htmlMatch[1].length > 150) {
            // Sugere no Canvas ou já abre se for no Desktop
            if (window.innerWidth > 768) {
                canvasService.open({
                    title: 'Página Web / Componente',
                    type: 'html',
                    content: htmlMatch[1],
                    language: 'html'
                });
            }
        } else if (svgMatch && svgMatch[1].length > 100) {
            if (window.innerWidth > 768) {
                canvasService.open({
                    title: 'Gráfico / Diagrama SVG',
                    type: 'svg',
                    content: svgMatch[1],
                    language: 'svg'
                });
            }
        }
    }

    // ==========================================
    // Execução de Código & Interatividades
    // ==========================================
    async runJSCode(btn) {
        const codeBlock = btn.closest('.code-canvas');
        if (!codeBlock) return;

        const rawCode = decodeURIComponent(codeBlock.dataset.raw || '');
        let outputDiv = codeBlock.querySelector('.code-output');
        if (outputDiv) outputDiv.remove();

        outputDiv = document.createElement('div');
        outputDiv.className = 'code-output';

        try {
            const logs = [];
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);

            iframe.contentWindow.console = {
                log: (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
                error: (...args) => logs.push('ERRO: ' + args.join(' ')),
                warn: (...args) => logs.push('AVISO: ' + args.join(' '))
            };

            const result = iframe.contentWindow.eval(rawCode);
            document.body.removeChild(iframe);

            const output = logs.length > 0 ? logs.join('\n') : (result !== undefined ? String(result) : 'Executado com sucesso.');
            outputDiv.innerHTML = `<span class="output-label">Saída JS:</span><pre>${output}</pre>`;
            outputDiv.classList.add('success');
        } catch (err) {
            outputDiv.innerHTML = `<span class="output-label">Erro JS:</span><pre>${err.message}</pre>`;
            outputDiv.classList.add('error');
        }

        codeBlock.appendChild(outputDiv);
    }

    async runPythonCode(btn) {
        const codeBlock = btn.closest('.code-canvas');
        if (!codeBlock) return;

        const rawCode = decodeURIComponent(codeBlock.dataset.raw || '');
        let outputDiv = codeBlock.querySelector('.code-output');
        if (outputDiv) outputDiv.remove();

        outputDiv = document.createElement('div');
        outputDiv.className = 'code-output code-exec-status loading';
        outputDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Preparando ambiente Python WebAssembly...</span>`;
        codeBlock.appendChild(outputDiv);

        btn.disabled = true;

        const onProgress = (msg) => {
            outputDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${msg}</span>`;
        };

        const result = await pythonRunner.run(rawCode, onProgress);
        btn.disabled = false;
        outputDiv.classList.remove('loading');

        if (result.success) {
            outputDiv.classList.add('success');
            outputDiv.innerHTML = `<span class="output-label">Saída Python:</span><pre>${result.output}</pre>`;
        } else {
            outputDiv.classList.add('error');
            outputDiv.innerHTML = `<span class="output-label">Erro Python:</span><pre>${result.error}</pre>`;
        }
    }

    openInCanvas(btn, language) {
        const codeBlock = btn.closest('.code-canvas');
        if (!codeBlock) return;

        const rawCode = decodeURIComponent(codeBlock.dataset.raw || '');
        canvasService.open({
            title: language === 'svg' ? 'Ilustração / Gráfico Técnico' : 'Aplicação Interativa',
            type: language,
            content: rawCode,
            language
        });
    }

    copyCodeBlock(btn) {
        const codeBlock = btn.closest('.code-canvas');
        if (!codeBlock) return;

        const rawCode = decodeURIComponent(codeBlock.dataset.raw || '');
        navigator.clipboard.writeText(rawCode);
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check" style="color:#10b981"></i> Copiado!';
        setTimeout(() => { btn.innerHTML = original; }, 1800);
    }

    // ==========================================
    // Eventos e UI Bindings
    // ==========================================
    _bindUIEvents() {
        // Envio
        document.getElementById('send-btn')?.addEventListener('click', () => this.sendMessage());
        document.getElementById('prompt')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Parar geração
        document.getElementById('stop-btn')?.addEventListener('click', () => {
            if (this.abortController) this.abortController.abort();
        });

        // Novo Chat
        document.getElementById('new-chat')?.addEventListener('click', () => this.createNewChat());
        document.getElementById('mobile-new-chat')?.addEventListener('click', () => {
            this.createNewChat();
            document.getElementById('mobile-drawer-overlay')?.classList.remove('open');
        });

        // Sidebar recolhível
        document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
            document.getElementById('sidebar')?.classList.toggle('expanded');
        });

        // Modo foco (Ctrl+F ou botão)
        document.getElementById('focus-btn')?.addEventListener('click', () => {
            document.body.classList.toggle('focus-mode');
        });
        document.getElementById('focus-exit-hint')?.addEventListener('click', () => {
            document.body.classList.remove('focus-mode');
        });

        // Tecla ESC para fechar modais ou modo foco
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.body.classList.remove('focus-mode');
                canvasService.close();
                document.querySelectorAll('.settings-overlay, .webcam-overlay, .templates-overlay, .mobile-drawer-overlay').forEach(el => el.classList.remove('open'));
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.getElementById('chat-search')?.focus();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.createNewChat();
            }
        });

        // Filtro de Tags
        document.querySelectorAll('.tag-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.activeTag = pill.dataset.tag || 'all';
                this.refreshChatHistoryList();
            });
        });

        // Busca de conversas
        const searchInput = document.getElementById('chat-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.trim();
                this.refreshChatHistoryList();
            });
        }

        // Anexos de arquivos
        const fileInput = document.getElementById('file-input');
        document.getElementById('attach-btn')?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            this.pendingFiles.push(...files);
            this._renderPreviewStrip();
            fileInput.value = '';
        });

        // Drag & Drop
        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer?.files?.length > 0) {
                this.pendingFiles.push(...Array.from(e.dataTransfer.files));
                this._renderPreviewStrip();
            }
        });

        // Reconhecimento de Voz (STT)
        const micBtn = document.getElementById('capture');
        if (micBtn) {
            micBtn.addEventListener('click', () => {
                const promptInput = document.getElementById('prompt');
                speechService.startListening({
                    onResult: (text) => {
                        if (promptInput) promptInput.value = (promptInput.value ? promptInput.value + ' ' : '') + text;
                        micBtn.classList.remove('recording');
                    },
                    onEnd: () => micBtn.classList.remove('recording'),
                    onError: () => micBtn.classList.remove('recording')
                });
                micBtn.classList.add('recording');
            });
        }

        // Sugestões da tela inicial
        this._bindSuggestionEvents();

        // Modais (Templates, Agentes, Comparação, Webcam)
        this._bindModalEvents();

        // Exportação e Compartilhamento
        this._bindExportEvents();

        // Botão de scroll para o final
        document.getElementById('scroll-bottom')?.addEventListener('click', () => {
            uiRenderer.scrollToBottom();
        });

        // Configurações
        this._bindSettingsEvents();

        // Temas
        this._bindThemeEvents();

        // Ações nas mensagens delegadas (Star, Speak, Copy, Feedback)
        this._bindMessageActionDelegates();
    }

    _renderPreviewStrip() {
        const strip = document.getElementById('file-preview-strip');
        if (!strip) return;

        strip.innerHTML = '';
        if (this.pendingFiles.length === 0) return;

        this.pendingFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-preview-item';
            item.innerHTML = `
                <i class="fas ${uiRenderer.getFileIcon(file.type)}"></i>
                <span class="file-name" title="${file.name}">${file.name}</span>
                <button class="remove-btn" title="Remover"><i class="fas fa-times"></i></button>
            `;
            item.querySelector('.remove-btn').addEventListener('click', () => {
                this.pendingFiles.splice(index, 1);
                this._renderPreviewStrip();
            });
            strip.appendChild(item);
        });
    }

    _bindSettingsEvents() {
        const settingsBtn = document.getElementById('settings-btn');
        const settingsOverlay = document.getElementById('settings-overlay');
        const settingsClose = document.getElementById('settings-close');
        const settingsSave = document.getElementById('settings-save');

        settingsBtn?.addEventListener('click', () => {
            this._loadSettingsToUI();
            settingsOverlay?.classList.add('open');
        });
        settingsClose?.addEventListener('click', () => settingsOverlay?.classList.remove('open'));

        // Troca de provedor
        document.getElementById('provider-select')?.addEventListener('change', (e) => {
            this.provider = e.target.value;
            this._updateModelDisplay();
            const openrouterGroup = document.getElementById('openrouter-url-group');
            const fetchModelsGroup = document.getElementById('fetch-models-group');
            const apiKeyInput = document.getElementById('api-key-input');

            if (this.provider === 'openrouter') {
                if (openrouterGroup) openrouterGroup.style.display = 'block';
                if (fetchModelsGroup) fetchModelsGroup.style.display = 'block';
            } else {
                if (openrouterGroup) openrouterGroup.style.display = 'none';
                if (fetchModelsGroup) fetchModelsGroup.style.display = 'none';
            }
            if (apiKeyInput) apiKeyInput.value = ApiService.getApiKey(this.provider);
        });

        // Troca de Tier
        document.getElementById('tier-select')?.addEventListener('change', (e) => {
            this.tier = e.target.value;
            this._updateModelDisplay();
        });

        // Slider de Temperatura
        document.getElementById('temp-slider')?.addEventListener('input', (e) => {
            this.temperature = parseFloat(e.target.value);
            const valEl = document.getElementById('temp-value');
            if (valEl) valEl.textContent = this.temperature;
        });

        // Botões de Personalidade
        document.querySelectorAll('.personality-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.personality-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.personality = btn.dataset.personality;
            });
        });

        // Salvar configurações
        settingsSave?.addEventListener('click', () => {
            const apiKey = document.getElementById('api-key-input')?.value.trim();
            const customPrompt = document.getElementById('custom-prompt')?.value.trim();
            const persistentContext = document.getElementById('persistent-context')?.value.trim();
            const openrouterUrl = document.getElementById('openrouter-url')?.value.trim();

            if (apiKey !== undefined) ApiService.setApiKey(this.provider, apiKey);
            localStorage.setItem('ai-provider', this.provider);
            localStorage.setItem('ai-tier', this.tier);
            localStorage.setItem('ai-temp', String(this.temperature));
            localStorage.setItem('ai-personality', this.personality);
            localStorage.setItem('ai-custom-prompt', customPrompt || '');
            localStorage.setItem('ai-persistent-context', persistentContext || '');
            if (openrouterUrl) localStorage.setItem('openrouter-url', openrouterUrl);

            this.customPrompt = customPrompt || '';
            this.persistentContext = persistentContext || '';

            settingsOverlay?.classList.remove('open');
            alert('Configurações salvas com sucesso!');
        });
    }

    _bindThemeEvents() {
        const themeBtn = document.getElementById('theme-selector-btn');
        const themeDropdown = document.getElementById('theme-dropdown');
        const toggleMode = document.getElementById('toggle-mode');

        themeBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            themeDropdown?.classList.toggle('open');
        });

        document.addEventListener('click', () => themeDropdown?.classList.remove('open'));

        document.querySelectorAll('.theme-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const theme = opt.dataset.theme;
                document.body.className = theme === 'light' ? 'light-mode' : `${theme}-theme dark-mode`;
                localStorage.setItem('inova-theme', theme);
                themeDropdown?.classList.remove('open');
            });
        });

        toggleMode?.addEventListener('click', () => {
            const isDark = document.body.classList.contains('dark-mode');
            document.body.className = isDark ? 'light-mode' : 'dark-mode';
            localStorage.setItem('inova-theme', isDark ? 'light' : 'dark');
        });
    }

    _bindSuggestionEvents() {
        document.querySelectorAll('.suggestion-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.dataset.prompt;
                const promptInput = document.getElementById('prompt');
                if (promptInput && prompt) {
                    promptInput.value = prompt;
                    this.sendMessage();
                }
            });
        });
    }

    _bindModalEvents() {
        // Prompt Templates
        const templatesBtn = document.getElementById('templates-btn');
        const templatesOverlay = document.getElementById('templates-overlay');
        const templatesClose = document.getElementById('templates-close');

        templatesBtn?.addEventListener('click', () => templatesOverlay?.classList.add('open'));
        templatesClose?.addEventListener('click', () => templatesOverlay?.classList.remove('open'));

        document.querySelectorAll('.template-card:not(.agent-card)').forEach(card => {
            card.addEventListener('click', () => {
                const text = card.dataset.template;
                const promptInput = document.getElementById('prompt');
                if (promptInput && text) {
                    promptInput.value = text + ' ';
                    promptInput.focus();
                }
                templatesOverlay?.classList.remove('open');
            });
        });

        // Agentes Especializados
        const agentsBtn = document.getElementById('agents-btn');
        const agentsOverlay = document.getElementById('agents-overlay');
        const agentsClose = document.getElementById('agents-close');

        agentsBtn?.addEventListener('click', () => agentsOverlay?.classList.add('open'));
        agentsClose?.addEventListener('click', () => agentsOverlay?.classList.remove('open'));

        document.querySelectorAll('.agent-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.dataset.prompt;
                if (prompt) {
                    this.customPrompt = prompt;
                    const customPromptInput = document.getElementById('custom-prompt');
                    if (customPromptInput) customPromptInput.value = prompt;
                    localStorage.setItem('ai-custom-prompt', prompt);
                    alert(`Agente [${card.querySelector('strong')?.textContent}] ativado!`);
                }
                agentsOverlay?.classList.remove('open');
            });
        });

        // Comparação de Modelos
        const compareBtn = document.getElementById('compare-btn');
        const compareOverlay = document.getElementById('compare-overlay');
        const compareClose = document.getElementById('compare-close');
        const compareSend = document.getElementById('compare-send');

        compareBtn?.addEventListener('click', () => {
            this._populateCompareModelSelects();
            compareOverlay?.classList.add('open');
        });
        compareClose?.addEventListener('click', () => compareOverlay?.classList.remove('open'));

        compareSend?.addEventListener('click', async () => {
            const prompt = document.getElementById('compare-prompt')?.value.trim();
            const modelA = document.getElementById('compare-model-a')?.value;
            const modelB = document.getElementById('compare-model-b')?.value;

            if (!prompt) {
                alert('Digite uma pergunta para comparar.');
                return;
            }

            compareOverlay?.classList.remove('open');
            uiRenderer.hideWelcome();
            uiRenderer.createMessageElement(`⚖️ **Comparação de Modelos:**\nPergunta: "${prompt}"\n- Modelo A: \`${modelA}\`\n- Modelo B: \`${modelB}\``, 'user');

            uiRenderer.showTyping();
            try {
                const [resA, resB] = await Promise.allSettled([
                    ApiService.call({ provider: this.provider, model: modelA, text: prompt, systemInstruction: this.getSystemInstruction() }),
                    ApiService.call({ provider: this.provider, model: modelB, text: prompt, systemInstruction: this.getSystemInstruction() })
                ]);
                uiRenderer.removeTyping();

                const textA = resA.status === 'fulfilled' ? resA.value : `Erro: ${resA.reason.message}`;
                const textB = resB.status === 'fulfilled' ? resB.value : `Erro: ${resB.reason.message}`;

                uiRenderer.createMessageElement(`### 🅰️ Resposta [${modelA}]:\n\n${textA}\n\n---\n\n### 🅱️ Resposta [${modelB}]:\n\n${textB}`, 'bot');
            } catch (err) {
                uiRenderer.removeTyping();
                uiRenderer.createMessageElement(`Erro na comparação: ${err.message}`, 'bot');
            }
        });

        // Mobile drawer histórico
        document.getElementById('mobile-history-btn')?.addEventListener('click', () => {
            document.getElementById('mobile-drawer-overlay')?.classList.add('open');
        });
        document.getElementById('mobile-drawer-close')?.addEventListener('click', () => {
            document.getElementById('mobile-drawer-overlay')?.classList.remove('open');
        });

        // Webcam
        this._bindWebcamEvents();
    }

    _populateCompareModelSelects() {
        const selectA = document.getElementById('compare-model-a');
        const selectB = document.getElementById('compare-model-b');
        if (!selectA || !selectB) return;

        const models = Object.values(TIER_MODELS[this.provider] || {});
        selectA.innerHTML = '';
        selectB.innerHTML = '';
        models.forEach((m, idx) => {
            const optA = new Option(m, m, false, idx === 0);
            const optB = new Option(m, m, false, idx === 1 || idx === 0);
            selectA.appendChild(optA);
            selectB.appendChild(optB);
        });
    }

    _bindWebcamEvents() {
        const webcamBtn = document.getElementById('webcam-btn');
        const webcamOverlay = document.getElementById('webcam-overlay');
        const webcamClose = document.getElementById('webcam-close');
        const webcamCapture = document.getElementById('webcam-capture');
        const webcamVideo = document.getElementById('webcam-video');
        const webcamCanvas = document.getElementById('webcam-canvas');
        let stream = null;

        webcamBtn?.addEventListener('click', async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (webcamVideo) webcamVideo.srcObject = stream;
                webcamOverlay?.classList.add('open');
            } catch {
                alert('Não foi possível acessar a câmera. Verifique as permissões.');
            }
        });

        const closeCam = () => {
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
                stream = null;
            }
            if (webcamVideo) webcamVideo.srcObject = null;
            webcamOverlay?.classList.remove('open');
        };

        webcamClose?.addEventListener('click', closeCam);

        webcamCapture?.addEventListener('click', () => {
            if (!webcamVideo || !webcamCanvas) return;
            webcamCanvas.width = webcamVideo.videoWidth;
            webcamCanvas.height = webcamVideo.videoHeight;
            webcamCanvas.getContext('2d')?.drawImage(webcamVideo, 0, 0);

            webcamCanvas.toBlob(blob => {
                if (blob) {
                    const file = new File([blob], 'captura-webcam.jpg', { type: 'image/jpeg' });
                    this.pendingFiles.push(file);
                    this._renderPreviewStrip();
                    closeCam();
                    document.getElementById('prompt')?.focus();
                }
            }, 'image/jpeg', 0.85);
        });
    }

    _bindExportEvents() {
        const exportBtn = document.getElementById('export-chat');
        const exportDropdown = document.getElementById('export-dropdown');
        const shareBtn = document.getElementById('share-chat');

        exportBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            exportDropdown?.classList.toggle('open');
        });
        document.addEventListener('click', () => exportDropdown?.classList.remove('open'));

        document.querySelectorAll('.export-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                const format = opt.dataset.format;
                if (!this.activeChatId) {
                    alert('Nenhuma conversa selecionada para exportar.');
                    return;
                }
                const chat = await dbService.getChat(this.activeChatId);
                if (!chat || !chat.messages || chat.messages.length === 0) {
                    alert('Esta conversa está vazia.');
                    return;
                }

                let content = '';
                if (format === 'txt') {
                    content = chat.messages.map(m => `[${m.role === 'user' ? 'Você' : 'INOVA SENAI'}]:\n${m.text}\n\n`).join('');
                    this._downloadFile(content, `${chat.title}.txt`, 'text/plain');
                } else if (format === 'md') {
                    content = `# ${chat.title}\n\n` + chat.messages.map(m => `### ${m.role === 'user' ? '👤 Usuário' : '🤖 INOVA SENAI'}\n\n${m.text}\n\n---\n`).join('\n');
                    this._downloadFile(content, `${chat.title}.md`, 'text/markdown');
                } else if (format === 'pdf') {
                    window.print();
                }
                exportDropdown?.classList.remove('open');
            });
        });

        shareBtn?.addEventListener('click', async () => {
            if (!this.activeChatId) {
                alert('Nenhuma conversa para compartilhar.');
                return;
            }
            const chat = await dbService.getChat(this.activeChatId);
            if (!chat || !chat.messages || chat.messages.length === 0) {
                alert('Conversa vazia.');
                return;
            }

            const summary = `*${chat.title}* (INOVA SENAI)\n\n` + chat.messages.slice(0, 4).map(m => `${m.role === 'user' ? 'P:' : 'R:'} ${m.text.slice(0, 80)}...`).join('\n');
            navigator.clipboard.writeText(summary);
            alert('Resumo da conversa copiado para a área de transferência!');
        });
    }

    _downloadFile(content, filename, type) {
        const blob = new Blob([content], { type: `${type};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    _bindMessageActionDelegates() {
        document.getElementById('chat-messages')?.addEventListener('click', async (e) => {
            const starBtn = e.target.closest('.action-star');
            const speakBtn = e.target.closest('.action-speak');
            const copyBtn = e.target.closest('.action-copy');

            if (starBtn) {
                const msgEl = starBtn.closest('.message');
                const text = msgEl.querySelector('.msg-text')?.textContent || '';
                if (this.activeChatId) {
                    const isStarred = await dbService.toggleMessageStar(this.activeChatId, text);
                    const icon = starBtn.querySelector('i');
                    if (icon) {
                        icon.className = isStarred ? 'fas fa-star' : 'far fa-star';
                        icon.style.color = isStarred ? '#f59e0b' : '';
                    }
                }
            }

            if (speakBtn) {
                const msgEl = speakBtn.closest('.message');
                const text = msgEl.querySelector('.msg-text')?.textContent || '';
                speechService.speak(text, () => speakBtn.classList.add('speaking'), () => speakBtn.classList.remove('speaking'));
            }

            if (copyBtn) {
                const msgEl = copyBtn.closest('.message');
                const text = msgEl.querySelector('.msg-text')?.textContent || '';
                navigator.clipboard.writeText(text);
                const original = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check" style="color:#10b981"></i>';
                setTimeout(() => { copyBtn.innerHTML = original; }, 1500);
            }
        });
    }
}

// Instância global para integração com o DOM
window.inovaApp = new InovaSenaiApp();
document.addEventListener('DOMContentLoaded', () => {
    window.inovaApp.init();
});
