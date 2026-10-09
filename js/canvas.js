// ============================================================================
// INOVA SENAI — Painel Interativo Canvas / Artifacts (v2.0)
// ============================================================================

export class CanvasService {
    constructor() {
        this.isOpen = false;
        this.currentArtifact = null;
        this.currentView = 'preview'; // 'preview' | 'code'
        this.panelEl = null;
        this.mobileToggleBtn = null;
    }

    init() {
        if (this.panelEl) return;

        // Cria o painel do Canvas caso ainda não exista no DOM
        let panel = document.getElementById('canvas-panel');
        if (!panel) {
            panel = document.createElement('aside');
            panel.id = 'canvas-panel';
            panel.className = 'canvas-panel';
            panel.innerHTML = `
                <div class="canvas-header">
                    <div class="canvas-title-wrap">
                        <span class="canvas-type-badge" id="canvas-type-badge">HTML</span>
                        <h4 class="canvas-title" id="canvas-title">Artefato</h4>
                    </div>
                    <div class="canvas-tabs">
                        <button class="canvas-tab active" id="canvas-tab-preview" title="Pré-visualização ao vivo">
                            <i class="fas fa-play"></i> Preview
                        </button>
                        <button class="canvas-tab" id="canvas-tab-code" title="Ver código-fonte">
                            <i class="fas fa-code"></i> Código
                        </button>
                    </div>
                    <div class="canvas-actions">
                        <button class="canvas-action-btn" id="canvas-copy" title="Copiar código">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="canvas-action-btn" id="canvas-download" title="Baixar arquivo">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="canvas-action-btn" id="canvas-popout" title="Abrir em tela cheia / nova aba">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                        <button class="canvas-action-btn canvas-close-btn" id="canvas-close" title="Fechar Canvas">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="canvas-body">
                    <iframe id="canvas-iframe" class="canvas-iframe" sandbox="allow-scripts allow-modals"></iframe>
                    <div id="canvas-code-view" class="canvas-code-view" style="display:none">
                        <pre><code id="canvas-code-content"></code></pre>
                    </div>
                </div>
            `;
            document.body.appendChild(panel);
        }

        // Cria botão flutuante de alternância mobile (Opção 2A)
        let toggleBtn = document.getElementById('mobile-canvas-toggle');
        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'mobile-canvas-toggle';
            toggleBtn.className = 'mobile-canvas-toggle';
            toggleBtn.innerHTML = '<i class="fas fa-laptop-code"></i> <span>Ver Artefato</span>';
            toggleBtn.style.display = 'none';
            document.body.appendChild(toggleBtn);
        }

        this.panelEl = panel;
        this.mobileToggleBtn = toggleBtn;

        this._bindEvents();
    }

    _bindEvents() {
        document.getElementById('canvas-close')?.addEventListener('click', () => this.close());
        
        document.getElementById('canvas-tab-preview')?.addEventListener('click', () => {
            this.setView('preview');
        });

        document.getElementById('canvas-tab-code')?.addEventListener('click', () => {
            this.setView('code');
        });

        document.getElementById('canvas-copy')?.addEventListener('click', () => {
            if (this.currentArtifact?.content) {
                navigator.clipboard.writeText(this.currentArtifact.content);
                const btn = document.getElementById('canvas-copy');
                const original = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check" style="color:#10b981"></i>';
                setTimeout(() => { btn.innerHTML = original; }, 1800);
            }
        });

        document.getElementById('canvas-download')?.addEventListener('click', () => {
            if (!this.currentArtifact) return;
            const ext = this._getExtension(this.currentArtifact.language);
            const blob = new Blob([this.currentArtifact.content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `artefato_inova_senai.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('canvas-popout')?.addEventListener('click', () => {
            if (!this.currentArtifact) return;
            const win = window.open('', '_blank');
            if (win) {
                win.document.write(this._wrapInHTML(this.currentArtifact.content, this.currentArtifact.language));
                win.document.close();
            }
        });

        // Alternador de aba no celular (Opção 2A)
        this.mobileToggleBtn?.addEventListener('click', () => {
            const isShowingArtifact = this.panelEl.classList.contains('mobile-visible');
            if (isShowingArtifact) {
                this.panelEl.classList.remove('mobile-visible');
                this.mobileToggleBtn.innerHTML = '<i class="fas fa-laptop-code"></i> <span>Ver Artefato</span>';
            } else {
                this.panelEl.classList.add('mobile-visible');
                this.mobileToggleBtn.innerHTML = '<i class="fas fa-comment-alt"></i> <span>Ver Chat</span>';
            }
        });
    }

    open({ title = 'Artefato Interativo', type = 'html', content = '', language = 'html' }) {
        this.init();
        this.currentArtifact = { title, type, content, language };
        this.isOpen = true;

        document.body.classList.add('canvas-open');
        this.panelEl.classList.add('active');

        // Em mobile, exibe o botão flutuante e abre o painel
        if (window.innerWidth <= 768) {
            this.mobileToggleBtn.style.display = 'flex';
            this.panelEl.classList.add('mobile-visible');
            this.mobileToggleBtn.innerHTML = '<i class="fas fa-comment-alt"></i> <span>Ver Chat</span>';
        }

        // Atualiza cabeçalho
        document.getElementById('canvas-title').textContent = title;
        document.getElementById('canvas-type-badge').textContent = language.toUpperCase();

        // Renderiza conteúdo
        this._renderContent();
    }

    close() {
        this.isOpen = false;
        document.body.classList.remove('canvas-open');
        this.panelEl?.classList.remove('active', 'mobile-visible');
        if (this.mobileToggleBtn) {
            this.mobileToggleBtn.style.display = 'none';
        }
    }

    setView(viewName) {
        this.currentView = viewName;
        const tabPreview = document.getElementById('canvas-tab-preview');
        const tabCode = document.getElementById('canvas-tab-code');
        const iframe = document.getElementById('canvas-iframe');
        const codeView = document.getElementById('canvas-code-view');

        if (viewName === 'preview') {
            tabPreview?.classList.add('active');
            tabCode?.classList.remove('active');
            if (iframe) iframe.style.display = 'block';
            if (codeView) codeView.style.display = 'none';
        } else {
            tabCode?.classList.add('active');
            tabPreview?.classList.remove('active');
            if (iframe) iframe.style.display = 'none';
            if (codeView) codeView.style.display = 'block';
        }
    }

    _renderContent() {
        if (!this.currentArtifact) return;

        const { content, language } = this.currentArtifact;
        const iframe = document.getElementById('canvas-iframe');
        const codeContent = document.getElementById('canvas-code-content');

        if (codeContent) {
            codeContent.textContent = content;
        }

        if (iframe) {
            const html = this._wrapInHTML(content, language);
            iframe.srcdoc = html;
        }

        this.setView('preview');
    }

    _wrapInHTML(code, language) {
        const lang = (language || '').toLowerCase();
        if (lang === 'html') {
            // Se já for um documento HTML completo
            if (code.includes('<!DOCTYPE') || code.includes('<html')) {
                return code;
            }
            return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>INOVA SENAI Canvas Preview</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 16px; color: #1f2937; background: #ffffff; }
    </style>
</head>
<body>
    ${code}
</body>
</html>`;
        }

        if (lang === 'svg') {
            return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f9fafb; padding: 20px; }
        svg { max-width: 100%; height: auto; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.05)); }
    </style>
</head>
<body>${code}</body>
</html>`;
        }

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>body { font-family: monospace; white-space: pre-wrap; padding: 16px; background: #0f172a; color: #e2e8f0; }</style>
</head>
<body>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body>
</html>`;
    }

    _getExtension(lang) {
        const map = { html: 'html', js: 'js', javascript: 'js', css: 'css', svg: 'svg', python: 'py', py: 'py' };
        return map[lang?.toLowerCase()] || 'txt';
    }
}

export const canvasService = new CanvasService();
