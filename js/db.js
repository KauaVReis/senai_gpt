// ============================================================================
// INOVA SENAI — Gerenciador de Banco de Dados Local (IndexedDB via Dexie.js)
// ============================================================================

/* global Dexie */

class DatabaseService {
    constructor() {
        this.db = null;
        this.initialized = false;
        this.initPromise = null;
    }

    async init() {
        if (this.initialized) return this;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            // Se Dexie não estiver carregado ainda, aguarda brevemente
            if (typeof Dexie === 'undefined') {
                console.warn('Dexie.js não encontrado globalmente. Aguardando...');
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            if (typeof Dexie !== 'undefined') {
                this.db = new Dexie('InovaSenaiDB');
                this.db.version(1).stores({
                    chats: 'id, title, updatedAt, createdAt, tag, isFavorite',
                    messages: '++id, chatId, role, timestamp, isStarred, feedback',
                    artifacts: 'id, chatId, title, type, language, updatedAt',
                    settings: 'key'
                });
            } else {
                console.warn('Dexie indisponível, usando fallback localStorage temporário.');
            }

            this.initialized = true;
            await this.migrateFromLocalStorage();
            return this;
        })();

        return this.initPromise;
    }

    // Migração transparente de dados do localStorage para o IndexedDB
    async migrateFromLocalStorage() {
        const STORAGE_KEY = 'inova-senai-chats';
        const MIGRATED_FLAG = 'inova-senai-migrated-to-idb';

        try {
            if (localStorage.getItem(MIGRATED_FLAG) === 'true') {
                return; // Já migrado anteriormente
            }

            const rawData = localStorage.getItem(STORAGE_KEY);
            if (!rawData) {
                localStorage.setItem(MIGRATED_FLAG, 'true');
                return;
            }

            const parsed = JSON.parse(rawData);
            const oldChats = parsed?.chats || [];

            if (Array.isArray(oldChats) && oldChats.length > 0 && this.db) {
                console.log(`[IndexedDB] Migrando ${oldChats.length} chats do localStorage para IndexedDB...`);

                await this.db.transaction('rw', this.db.chats, this.db.messages, async () => {
                    for (const oldChat of oldChats) {
                        const chatId = oldChat.id || `chat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                        const updatedAt = oldChat.updatedAt || oldChat.timestamp || Date.now();
                        const createdAt = oldChat.createdAt || updatedAt;

                        await this.db.chats.put({
                            id: chatId,
                            title: oldChat.title || 'Conversa importada',
                            updatedAt,
                            createdAt,
                            tag: oldChat.tag || 'geral',
                            isFavorite: !!oldChat.isFavorite
                        });

                        if (Array.isArray(oldChat.messages)) {
                            for (const msg of oldChat.messages) {
                                await this.db.messages.add({
                                    chatId,
                                    role: msg.sender === 'user' || msg.role === 'user' ? 'user' : 'assistant',
                                    text: msg.text || '',
                                    files: msg.files || [],
                                    timestamp: msg.timestamp || updatedAt,
                                    isStarred: !!msg.starred,
                                    feedback: msg.feedback || null
                                });
                            }
                        }
                    }
                });

                localStorage.setItem(MIGRATED_FLAG, 'true');
                console.log('[IndexedDB] Migração concluída com sucesso!');
            }
        } catch (err) {
            console.error('[IndexedDB] Erro durante migração de dados:', err);
        }
    }

    // Obter todas as conversas ordenadas por updatedAt decrescente
    async getAllChats() {
        await this.init();
        if (!this.db) return this._fallbackGetAllChats();
        return await this.db.chats.orderBy('updatedAt').reverse().toArray();
    }

    // Obter uma conversa e suas mensagens
    async getChat(chatId) {
        await this.init();
        if (!this.db) return this._fallbackGetChat(chatId);

        const chat = await this.db.chats.get(chatId);
        if (!chat) return null;

        const messages = await this.db.messages
            .where('chatId')
            .equals(chatId)
            .sortBy('timestamp');

        return { ...chat, messages };
    }

    // Criar ou atualizar metadata de uma conversa
    async saveChat(chat) {
        await this.init();
        if (!this.db) return this._fallbackSaveChat(chat);

        const record = {
            id: chat.id,
            title: chat.title || 'Nova conversa',
            updatedAt: chat.updatedAt || Date.now(),
            createdAt: chat.createdAt || Date.now(),
            tag: chat.tag || 'geral',
            isFavorite: !!chat.isFavorite
        };

        await this.db.chats.put(record);
        return record;
    }

    // Adicionar mensagem a uma conversa
    async addMessage(chatId, message) {
        await this.init();
        if (!this.db) return this._fallbackAddMessage(chatId, message);

        const record = {
            chatId,
            role: message.role || message.sender || 'user',
            text: message.text || '',
            files: message.files || [],
            timestamp: message.timestamp || Date.now(),
            isStarred: !!message.isStarred,
            feedback: message.feedback || null
        };

        const id = await this.db.messages.add(record);

        // Atualiza timestamp da conversa
        await this.db.chats.update(chatId, { updatedAt: record.timestamp });

        return { id, ...record };
    }

    // Atualizar título da conversa
    async updateChatTitle(chatId, title) {
        await this.init();
        if (!this.db) return;
        await this.db.chats.update(chatId, { title, updatedAt: Date.now() });
    }

    // Atualizar tag da conversa
    async updateChatTag(chatId, tag) {
        await this.init();
        if (!this.db) return;
        await this.db.chats.update(chatId, { tag, updatedAt: Date.now() });
    }

    // Alternar favorito da conversa
    async toggleChatFavorite(chatId) {
        await this.init();
        if (!this.db) return;
        const chat = await this.db.chats.get(chatId);
        if (chat) {
            await this.db.chats.update(chatId, { isFavorite: !chat.isFavorite });
            return !chat.isFavorite;
        }
        return false;
    }

    // Excluir conversa e todas as suas mensagens associadas
    async deleteChat(chatId) {
        await this.init();
        if (!this.db) return this._fallbackDeleteChat(chatId);

        await this.db.transaction('rw', this.db.chats, this.db.messages, this.db.artifacts, async () => {
            await this.db.messages.where('chatId').equals(chatId).delete();
            await this.db.artifacts.where('chatId').equals(chatId).delete();
            await this.db.chats.delete(chatId);
        });
    }

    // Favoritar mensagem específica
    async toggleMessageStar(chatId, messageText) {
        await this.init();
        if (!this.db) return false;

        const msg = await this.db.messages
            .where('chatId')
            .equals(chatId)
            .filter(m => m.text === messageText)
            .first();

        if (msg) {
            const nextState = !msg.isStarred;
            await this.db.messages.update(msg.id, { isStarred: nextState });
            return nextState;
        }
        return false;
    }

    // Salvar Artefato gerado (Canvas)
    async saveArtifact(artifact) {
        await this.init();
        if (!this.db) return;
        await this.db.artifacts.put({
            id: artifact.id || `art_${Date.now()}`,
            chatId: artifact.chatId,
            title: artifact.title || 'Artefato sem título',
            type: artifact.type || 'html',
            language: artifact.language || 'html',
            content: artifact.content,
            updatedAt: Date.now()
        });
    }

    // Fallbacks para localStorage caso IndexedDB esteja inacessível
    _fallbackGetAllChats() {
        try {
            const data = JSON.parse(localStorage.getItem('inova-senai-chats')) || {};
            return data.chats || [];
        } catch {
            return [];
        }
    }

    _fallbackGetChat(chatId) {
        const chats = this._fallbackGetAllChats();
        return chats.find(c => c.id === chatId) || null;
    }

    _fallbackSaveChat(chat) {
        const chats = this._fallbackGetAllChats();
        const idx = chats.findIndex(c => c.id === chat.id);
        if (idx >= 0) chats[idx] = { ...chats[idx], ...chat };
        else chats.unshift(chat);
        localStorage.setItem('inova-senai-chats', JSON.stringify({ chats, activeChat: chat.id }));
    }

    _fallbackAddMessage(chatId, message) {
        const chats = this._fallbackGetAllChats();
        const chat = chats.find(c => c.id === chatId);
        if (chat) {
            if (!chat.messages) chat.messages = [];
            chat.messages.push(message);
            chat.updatedAt = Date.now();
            localStorage.setItem('inova-senai-chats', JSON.stringify({ chats, activeChat: chatId }));
        }
    }

    _fallbackDeleteChat(chatId) {
        let chats = this._fallbackGetAllChats();
        chats = chats.filter(c => c.id !== chatId);
        localStorage.setItem('inova-senai-chats', JSON.stringify({ chats }));
    }
}

export const dbService = new DatabaseService();
