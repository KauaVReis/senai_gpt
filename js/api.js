// ============================================================================
// INOVA SENAI — Serviço de Comunicação com APIs de IA (Gemini & OpenRouter)
// ============================================================================

import { TIER_MODELS } from './config.js';

export class ApiService {
    static getApiKey(provider = 'gemini') {
        return localStorage.getItem(`api-key-${provider}`) || '';
    }

    static setApiKey(provider, key) {
        if (provider && key !== undefined) {
            localStorage.setItem(`api-key-${provider}`, key.trim());
        }
    }

    static fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    static async call({
        provider = 'gemini',
        tier = 'perfect',
        model = null,
        temperature = 0.7,
        systemInstruction = '',
        history = [],
        text = '',
        files = [],
        openrouterUrl = 'https://openrouter.ai/api/v1/chat/completions',
        abortSignal = null,
        onToken = null
    }) {
        const apiKey = this.getApiKey(provider);
        if (!apiKey) {
            throw new Error(`Chave de API do provedor [${provider.toUpperCase()}] não configurada. Abra as Configurações para informá-la.`);
        }

        const selectedModel = model || TIER_MODELS[provider]?.[tier] || (provider === 'gemini' ? 'gemini-2.5-flash' : 'google/gemini-2.0-flash-exp:free');

        if (provider === 'gemini') {
            return await this._callGemini({
                apiKey,
                model: selectedModel,
                temperature,
                systemInstruction,
                history,
                text,
                files,
                abortSignal,
                onToken
            });
        } else {
            return await this._callOpenRouter({
                apiKey,
                baseUrl: openrouterUrl,
                model: selectedModel,
                temperature,
                systemInstruction,
                history,
                text,
                abortSignal,
                onToken
            });
        }
    }

    static async _callGemini({
        apiKey,
        model,
        temperature,
        systemInstruction,
        history,
        text,
        files,
        abortSignal,
        onToken
    }) {
        const userParts = [];

        // Converte arquivos para inlineData
        for (const file of files) {
            try {
                const base64Data = await this.fileToBase64(file);
                userParts.push({
                    inlineData: {
                        mimeType: file.type || 'application/octet-stream',
                        data: base64Data
                    }
                });
            } catch (err) {
                console.warn('[API] Erro ao converter anexo:', file.name, err);
            }
        }

        if (text) {
            userParts.push({ text });
        } else if (files.length > 0) {
            userParts.push({ text: 'Analise o(s) arquivo(s) enviado(s) detalhadamente e responda com clareza.' });
        }

        // Formata histórico para Gemini
        const geminiHistory = history.map(m => ({
            role: m.role === 'assistant' || m.sender === 'bot' ? 'model' : 'user',
            parts: [{ text: m.text }]
        }));

        const requestBody = {
            system_instruction: {
                parts: [{ text: systemInstruction }]
            },
            contents: [
                ...geminiHistory,
                { role: 'user', parts: userParts }
            ],
            generationConfig: {
                temperature: Number(temperature) || 0.7,
                maxOutputTokens: 8192
            }
        };

        const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

        try {
            const response = await fetch(streamUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: abortSignal
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData?.error?.message || `Erro HTTP ${response.status}`);
            }

            return await this._readSSEStream(response.body, 'gemini', onToken, abortSignal);
        } catch (err) {
            if (err.name === 'AbortError') throw err;

            // Fallback não-streaming caso SSE falhe
            console.warn('[API] Streaming SSE falhou, tentando fallback direto...', err.message);
            const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const fallbackRes = await fetch(fallbackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: abortSignal
            });

            if (!fallbackRes.ok) {
                const errData = await fallbackRes.json().catch(() => ({}));
                throw new Error(errData?.error?.message || `Erro HTTP ${fallbackRes.status}`);
            }

            const data = await fallbackRes.json();
            const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta.';
            if (onToken) onToken(reply, reply);
            return reply;
        }
    }

    static async _callOpenRouter({
        apiKey,
        baseUrl,
        model,
        temperature,
        systemInstruction,
        history,
        text,
        abortSignal,
        onToken
    }) {
        const messages = [];
        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }
        for (const item of history) {
            messages.push({
                role: item.role === 'assistant' || item.sender === 'bot' ? 'assistant' : 'user',
                content: item.text
            });
        }
        messages.push({ role: 'user', content: text });

        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'INOVA SENAI'
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: Number(temperature) || 0.7,
                max_tokens: 4096,
                stream: true
            }),
            signal: abortSignal
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `Erro HTTP ${response.status}`);
        }

        return await this._readSSEStream(response.body, 'openrouter', onToken, abortSignal);
    }

    static async _readSSEStream(stream, providerType, onToken, abortSignal) {
        const reader = stream.getReader();
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

                        if (providerType === 'gemini') {
                            token = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        } else {
                            token = parsed?.choices?.[0]?.delta?.content || '';
                        }

                        if (token) {
                            fullText += token;
                            if (onToken) onToken(token, fullText);
                        }
                    } catch {
                        // Linha incompleta ou formato não-JSON
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                fullText += ' *[Geração interrompida]*';
                if (onToken) onToken('', fullText);
            } else {
                throw err;
            }
        } finally {
            reader.releaseLock();
        }

        return fullText;
    }

    static async fetchFreeOpenRouterModels() {
        try {
            const res = await fetch('https://openrouter.ai/api/v1/models');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return (data.data || [])
                .filter(m => m.id && (m.id.endsWith(':free') || m.pricing?.prompt === '0'))
                .map(m => ({ id: m.id, name: m.name || m.id }));
        } catch (err) {
            console.error('[API] Erro ao buscar modelos free:', err);
            return [];
        }
    }
}
