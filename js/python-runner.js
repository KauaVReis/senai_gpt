// ============================================================================
// INOVA SENAI — Executor de Código Python no Navegador (WebAssembly via Pyodide)
// ============================================================================

/* global loadPyodide */

class PythonRunner {
    constructor() {
        this.pyodide = null;
        this.isLoading = false;
        this.isReady = false;
        this.loadPromise = null;
    }

    // Carregamento sob demanda (Lazy-Load - Opção 1A)
    async init(onProgress = null) {
        if (this.isReady && this.pyodide) return this.pyodide;
        if (this.loadPromise) return this.loadPromise;

        this.isLoading = true;
        this.loadPromise = (async () => {
            try {
                if (onProgress) onProgress('Baixando motor Python WebAssembly (~12MB)...');

                // Injeta script Pyodide via CDN se não estiver no DOM
                if (typeof loadPyodide === 'undefined') {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
                        script.async = true;
                        script.onload = resolve;
                        script.onerror = () => reject(new Error('Falha ao baixar os binários do Pyodide CDN.'));
                        document.head.appendChild(script);
                    });
                }

                if (onProgress) onProgress('Inicializando ambiente Python no navegador...');

                this.pyodide = await loadPyodide({
                    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
                });

                // Prepara redirecionamento de stdout e stderr
                await this.pyodide.runPythonAsync(`
import sys
import io

class OutputCatcher:
    def __init__(self):
        self.buffer = io.StringIO()
    def write(self, s):
        self.buffer.write(s)
    def flush(self):
        pass
    def get_output(self):
        return self.buffer.getvalue()
    def clear(self):
        self.buffer = io.StringIO()

_stdout_catcher = OutputCatcher()
_stderr_catcher = OutputCatcher()
sys.stdout = _stdout_catcher
sys.stderr = _stderr_catcher
`);

                this.isReady = true;
                this.isLoading = false;
                if (onProgress) onProgress('Ambiente Python pronto!');
                return this.pyodide;
            } catch (err) {
                this.isLoading = false;
                this.loadPromise = null;
                throw err;
            }
        })();

        return this.loadPromise;
    }

    async run(code, onProgress = null) {
        await this.init(onProgress);

        try {
            // Limpa buffers anteriores
            await this.pyodide.runPythonAsync(`
_stdout_catcher.clear()
_stderr_catcher.clear()
`);

            // Executa código
            let result = await this.pyodide.runPythonAsync(code);

            // Obtém saídas de print() e erros
            const stdout = await this.pyodide.runPythonAsync('_stdout_catcher.get_output()');
            const stderr = await this.pyodide.runPythonAsync('_stderr_catcher.get_output()');

            let outputText = stdout || '';
            if (stderr) {
                outputText += (outputText ? '\n' : '') + '[STDERR]: ' + stderr;
            }
            if (!outputText && result !== undefined && result !== null) {
                outputText = String(result);
            }
            if (!outputText) {
                outputText = 'Código executado com sucesso (sem retorno impresso).';
            }

            return {
                success: true,
                output: outputText.trim(),
                error: null
            };
        } catch (err) {
            return {
                success: false,
                output: null,
                error: err.message || String(err)
            };
        }
    }
}

export const pythonRunner = new PythonRunner();
