// ============================================================================
// INOVA SENAI — Renderizador de Fórmulas Matemáticas & Técnicas (KaTeX)
// ============================================================================

/* global renderMathInElement */

export class KaTeXService {
    constructor() {
        this.loaded = false;
        this.loadingPromise = null;
    }

    async init() {
        if (this.loaded) return;
        if (this.loadingPromise) return this.loadingPromise;

        this.loadingPromise = (async () => {
            if (typeof renderMathInElement === 'undefined') {
                // Injeta CSS
                if (!document.querySelector('link[href*="katex"]')) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
                    document.head.appendChild(link);
                }

                // Injeta JS principal
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';
                    script.async = true;
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });

                // Injeta auto-render extension
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js';
                    script.async = true;
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }

            this.loaded = true;
        })();

        return this.loadingPromise;
    }

    async render(element) {
        if (!element) return;
        try {
            await this.init();
            if (typeof renderMathInElement === 'function') {
                renderMathInElement(element, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\\(', right: '\\)', display: false },
                        { left: '\\[', right: '\\]', display: true }
                    ],
                    throwOnError: false
                });
            }
        } catch (err) {
            console.warn('[KaTeX] Erro ao renderizar fórmulas:', err);
        }
    }
}

export const katexService = new KaTeXService();
