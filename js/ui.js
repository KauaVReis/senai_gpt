// ============================================================================
// INOVA SENAI — Gerenciador de Interface de Usuário & Renderizador (UI)
// ============================================================================

import { pythonRunner } from './python-runner.js';
import { canvasService } from './canvas.js';
import { katexService } from './katex-render.js';
import { speechService } from './speech.js';

/* global mermaid */

export class UIRenderer {
    constructor() {
        this.chatMessagesEl = document.getElementById('chat-messages');
        this.welcomeEl = document.getElementById('welcome');
        this.previewStripEl = document.getElementById('file-preview-strip');
        this.chatHistoryListEl = document.getElementById('chat-history-list');
    }

    hideWelcome() {
        if (this.welcomeEl) {
            this.welcomeEl.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => { this.welcomeEl.style.display = 'none'; }, 300);
        }
    }

    showWelcome() {
        if (this.welcomeEl) {
            this.welcomeEl.style.display = 'flex';
            this.welcomeEl.style.animation = 'fadeIn 0.3s ease-out forwards';
        }
        if (this.chatMessagesEl) {
            // Remove mensagens exceto o welcome
            const messages = this.chatMessagesEl.querySelectorAll('.message');
            messages.forEach(m => m.remove());
        }
    }

    clearChatMessages() {
        if (this.chatMessagesEl) {
            const messages = this.chatMessagesEl.querySelectorAll('.message');
            messages.forEach(m => m.remove());
        }
    }

    scrollToBottom() {
        if (this.chatMessagesEl) {
            this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
        }
    }

    createMessageElement(text, sender = 'user', files = []) {
        const msg = document.createElement('div');
        msg.className = `message message-${sender}`;

        // Avatar
        const avatar = document.createElement('div');
        avatar.className = `message-avatar ${sender}`;
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
        content.className = 'message-content';

        // Anexos de arquivo
        if (files && files.length > 0) {
            const attachments = document.createElement('div');
            attachments.className = 'message-attachments';

            files.forEach(file => {
                if (file.type && file.type.startsWith('image/')) {
                    const imgWrap = document.createElement('div');
                    imgWrap.className = 'message-file-image';
                    const img = document.createElement('img');
                    img.src = file instanceof Blob ? URL.createObjectURL(file) : (file.data || file.url || '');
                    img.alt = file.name || 'Imagem';
                    imgWrap.appendChild(img);
                    attachments.appendChild(imgWrap);
                } else {
                    const fileCard = document.createElement('div');
                    fileCard.className = 'message-file';
                    fileCard.innerHTML = `
                        <div class="file-icon"><i class="fas ${this.getFileIcon(file.type || '')}"></i></div>
                        <div class="file-info">
                            <div class="file-name" title="${file.name || 'arquivo'}">${file.name || 'Arquivo'}</div>
                            <div class="file-size">${this.formatFileSize(file.size || 0)}</div>
                        </div>
                    `;
                    attachments.appendChild(fileCard);
                }
            });

            content.appendChild(attachments);
        }

        // Texto com Markdown & KaTeX
        if (text) {
            const textDiv = document.createElement('div');
            textDiv.className = 'msg-text';
            textDiv.innerHTML = this.formatMarkdown(text);
            content.appendChild(textDiv);
            katexService.render(textDiv);
        }

        // Ações e Feedback
        const feedbackWrap = document.createElement('div');
        feedbackWrap.className = 'msg-feedback';
        if (sender === 'bot') {
            feedbackWrap.innerHTML = `
                <button class="feedback-btn action-star" title="Favoritar"><i class="far fa-star"></i></button>
                <button class="feedback-btn action-speak" title="Ouvir resposta"><i class="fas fa-volume-up"></i></button>
                <button class="feedback-btn action-copy" title="Copiar texto"><i class="fas fa-copy"></i></button>
                <button class="feedback-btn action-up" title="Boa resposta"><i class="fas fa-thumbs-up"></i></button>
                <button class="feedback-btn action-down" title="Resposta ruim"><i class="fas fa-thumbs-down"></i></button>
            `;
        } else {
            feedbackWrap.innerHTML = `
                <button class="feedback-btn action-copy" title="Copiar"><i class="fas fa-copy"></i></button>
            `;
        }
        content.appendChild(feedbackWrap);

        msg.appendChild(avatar);
        msg.appendChild(content);

        this.chatMessagesEl.appendChild(msg);
        this.scrollToBottom();

        // Inicializa Mermaid nos diagramas recém-criados
        if (typeof mermaid !== 'undefined') {
            try {
                mermaid.run({ nodes: msg.querySelectorAll('.mermaid') });
            } catch { /* ignore initial parse error */ }
        }

        return { element: msg, textContainer: content.querySelector('.msg-text') };
    }

    showTyping() {
        const existing = document.getElementById('typing-indicator');
        if (existing) return;

        const typing = document.createElement('div');
        typing.id = 'typing-indicator';
        typing.className = 'message message-bot';
        typing.innerHTML = `
            <div class="message-avatar bot"><i class="fas fa-robot"></i></div>
            <div class="message-content">
                <div class="typing-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        this.chatMessagesEl.appendChild(typing);
        this.scrollToBottom();
    }

    removeTyping() {
        const typing = document.getElementById('typing-indicator');
        if (typing) typing.remove();
    }

    formatMarkdown(text) {
        if (!text) return '';

        // 1. Code blocks ```
        const codeBlocks = [];
        text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
            const index = codeBlocks.length;
            const language = (lang || 'code').toLowerCase();

            // Mermaid diagrams
            if (language === 'mermaid') {
                const cleanSource = code.trim();
                codeBlocks.push(`
                    <div class="mermaid-container">
                        <div class="mermaid-header">
                            <span class="mermaid-label"><i class="fas fa-project-diagram"></i> Diagrama Mermaid</span>
                            <div class="mermaid-actions">
                                <button class="mermaid-copy-btn" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(cleanSource)}'))" title="Copiar código"><i class="fas fa-code"></i> Código</button>
                            </div>
                        </div>
                        <div class="mermaid-body"><div class="mermaid">${cleanSource}</div></div>
                    </div>
                `);
                return `%%CODEBLOCK_${index}%%`;
            }

            const cleanCode = code.trimEnd();
            const escapedCode = cleanCode.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const highlightedCode = this.highlightSyntax(escapedCode, language);

            const lines = highlightedCode.split('\n');
            const numberedLines = lines.map((line, i) =>
                `<span class="code-line"><span class="line-number">${i + 1}</span><span class="line-content">${line}</span></span>`
            ).join('\n');

            const isJS = ['javascript', 'js'].includes(language);
            const isPython = ['python', 'py'].includes(language);
            const isHTMLorSVG = ['html', 'svg'].includes(language);

            let actionBtns = '';

            // Botão Executar JavaScript
            if (isJS) {
                actionBtns += `<button class="code-run-btn" onclick="window.inovaApp.runJSCode(this)" title="Executar JavaScript"><i class="fas fa-play"></i> Run JS</button>`;
            }

            // Botão Executar Python no Navegador (Pyodide WASM)
            if (isPython) {
                actionBtns += `<button class="code-run-py-btn" onclick="window.inovaApp.runPythonCode(this)" title="Executar Python via WebAssembly"><i class="fab fa-python"></i> Run Python</button>`;
            }

            // Botão Abrir no Canvas / Artifacts
            if (isHTMLorSVG) {
                actionBtns += `<button class="code-open-canvas-btn" onclick="window.inovaApp.openInCanvas(this, '${language}')" title="Abrir no Painel Canvas"><i class="fas fa-columns"></i> Abrir no Canvas</button>`;
            }

            actionBtns += `<button class="code-copy-btn" onclick="window.inovaApp.copyCodeBlock(this)" title="Copiar código"><i class="fas fa-copy"></i> Copiar</button>`;

            codeBlocks.push(`
                <div class="code-canvas" data-lang="${language}" data-raw="${encodeURIComponent(cleanCode)}">
                    <div class="code-header">
                        <span class="code-lang">${this.getLangIcon(language)} ${language}</span>
                        <div class="code-actions">
                            ${actionBtns}
                        </div>
                    </div>
                    <pre class="code-body"><code>${numberedLines}</code></pre>
                </div>
            `);

            return `%%CODEBLOCK_${index}%%`;
        });

        // 2. Inline code
        text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // 3. Tabelas Markdown
        text = text.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock) => {
            const rows = tableBlock.trim().split('\n').filter(r => r.trim());
            if (rows.length < 2) return tableBlock;
            let html = '<div class="md-table-wrap"><table class="md-table">';
            rows.forEach((row, i) => {
                if (row.replace(/[|\-\s:]/g, '') === '') return;
                const cells = row.split('|').filter(c => c !== '').map(c => c.trim());
                const tag = i === 0 ? 'th' : 'td';
                html += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
            });
            html += '</table></div>';
            return html;
        });

        // 4. Formatações de texto básicas
        text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        text = text.replace(/~~(.*?)~~/g, '<del>$1</del>');

        // 5. Links
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

        // 6. Títulos
        text = text.replace(/^### (.*$)/gim, '<h3 class="md-h3">$1</h3>');
        text = text.replace(/^## (.*$)/gim, '<h2 class="md-h2">$1</h2>');
        text = text.replace(/^# (.*$)/gim, '<h1 class="md-h1">$1</h1>');

        // 7. Listas e quebras
        text = text.replace(/^\s*[-*+]\s+(.*$)/gim, '<li class="md-li">$1</li>');
        text = text.replace(/\n\n/g, '<br><br>');
        text = text.replace(/\n/g, '<br>');

        // Restaura blocos de código
        codeBlocks.forEach((block, i) => {
            text = text.replace(`%%CODEBLOCK_${i}%%`, block);
        });

        return text;
    }

    highlightSyntax(code, lang) {
        const l = (lang || '').toLowerCase();
        const tokens = [];
        const protect = (match, className) => {
            const idx = tokens.length;
            tokens.push(`<span class="hl-${className}">${match}</span>`);
            return `%%TOKEN_${idx}%%`;
        };

        code = code.replace(/(\/\*[\s\S]*?\*\/)/g, m => protect(m, 'comment'));
        code = code.replace(/((?:\/\/|#).*)$/gm, m => protect(m, 'comment'));
        code = code.replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, m => protect(m, 'string'));
        code = code.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, m => protect(m, 'string'));
        code = code.replace(/(`(?:[^`\\]|\\.)*`)/g, m => protect(m, 'string'));
        code = code.replace(/\b(\d+\.?\d*)\b/g, m => protect(m, 'number'));

        let keywords = 'if|else|for|while|return|function|class|const|let|var|import|export|from|def|try|except|finally|async|await';
        if (['python', 'py'].includes(l)) {
            keywords += '|None|True|False|self|with|as|lambda|yield|raise|in|is|not|and|or';
        } else if (['javascript', 'js', 'ts'].includes(l)) {
            keywords += '|true|false|null|undefined|new|typeof|instanceof|switch|case|break';
        }
        code = code.replace(new RegExp(`\\b(${keywords})\\b`, 'g'), m => protect(m, 'keyword'));

        tokens.forEach((t, i) => {
            code = code.replace(`%%TOKEN_${i}%%`, t);
        });

        return code;
    }

    getLangIcon(lang) {
        const icons = {
            python: '<i class="fab fa-python" style="color:#38bdf8"></i>',
            py: '<i class="fab fa-python" style="color:#38bdf8"></i>',
            javascript: '<i class="fab fa-js-square" style="color:#facc15"></i>',
            js: '<i class="fab fa-js-square" style="color:#facc15"></i>',
            html: '<i class="fab fa-html5" style="color:#f97316"></i>',
            css: '<i class="fab fa-css3-alt" style="color:#3b82f6"></i>',
            svg: '<i class="fas fa-bezier-curve" style="color:#10b981"></i>',
            json: '<i class="fas fa-code" style="color:#a855f7"></i>',
            sql: '<i class="fas fa-database" style="color:#06b6d4"></i>',
            bash: '<i class="fas fa-terminal" style="color:#4ade80"></i>'
        };
        return icons[lang?.toLowerCase()] || '<i class="fas fa-code"></i>';
    }

    getFileIcon(type) {
        if (type.includes('pdf')) return 'fa-file-pdf';
        if (type.includes('image')) return 'fa-file-image';
        if (type.includes('text') || type.includes('code')) return 'fa-file-code';
        return 'fa-file';
    }

    formatFileSize(bytes) {
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }
}

export const uiRenderer = new UIRenderer();
