# Plano de Modernização — INOVA SENAI (Outubro 2026)

> **Branch:** `feat/modernizacao-inova-senai-2026`  
> **Status:** Planejamento Aprovado / Em Validação de Edge Cases  
> **Responsável:** `project-planner` + `orchestrator` + `frontend-specialist`

---

## 🎯 Visão Geral do Projeto

Transformar o **INOVA SENAI** de um chat web monolítico tradicional (fev/2026) em uma plataforma de aprendizado e assistência técnica de IA de última geração para o ecossistema SENAI:
- **Zero Servidor Obrigatório:** Mantendo a flexibilidade de execução estática/PWA no navegador.
- **Armazenamento Ilimitado:** Migração de `localStorage` para **IndexedDB (Dexie.js)**.
- **Superpoderes de Execução:** Python nativo no navegador via **WebAssembly (Pyodide)** + Painel interativo **Canvas / Artifacts**.
- **Foco Pedagógico SENAI:** RAG para apostilas técnicas (PDFs), Modo Tutor Socrático e KaTeX para fórmulas científicas e industriais.

---

## 🏗️ Arquitetura Proposta

```
/workspaces/senai_gpt/
├── index.html                 # Ponto de entrada com Layout Split (Chat + Canvas)
├── style.css                  # Design Tokens, variáveis e estilos base
├── manifest.json              # PWA Manifest
├── sw.js                      # Service Worker para offline/cache
├── img/                       # Assets e logos SENAI
└── js/
    ├── app.js                 # Ponto de inicialização principal
    ├── state.js               # Gestão centralizada de estado e reatividade
    ├── config.js              # Tiers, modelos (Gemini 2.5/Flash/Pro) e endpoints
    ├── modules/
    │   ├── db.js              # IndexedDB com Dexie.js (substitui localStorage)
    │   ├── api.js             # Provedores Gemini (SSE streaming + search) e OpenRouter
    │   ├── python-runner.js   # Sandbox Pyodide (WASM) para execução de Python
    │   ├── canvas.js          # Painel Artifacts (Live Preview HTML/SVG/Gráficos)
    │   ├── rag.js             # Processamento e consulta semântica de apostilas/PDFs
    │   ├── katex-render.js    # Renderização de fórmulas matemáticas/físicas
    │   └── speech.js          # Web Speech STT/TTS e controle de voz
```

---

## 📋 Fases de Execução & Tarefas

### Fase 1: Fundação, Armazenamento Ilimitado & Modularização
- [x] **T1.1:** Instalar/Integrar Dexie.js via CDN/ESM para persistência em **IndexedDB**.
- [x] **T1.2:** Criar camada de migração automática dos chats salvos de `localStorage` para `IndexedDB` sem perda de dados para os usuários existentes.
- [x] **T1.3:** Decompor `index.js` monolítico em módulos ES organizados (`/js/`).
- [x] **T1.4:** Atualizar catálogo de modelos com as versões estáveis atuais (Gemini 2.5 Flash, 2.5 Flash-Lite, 2.5 Pro).

### Fase 2: Execução de Código & Painel Canvas (Artifacts)
- [x] **T2.1:** Integrar **Pyodide (WebAssembly)** para executar blocos de código Python diretamente no navegador.
- [x] **T2.2:** Criar o container do **Canvas / Artifacts** (painel lateral retrátil) no `index.html` e `style.css`.
- [x] **T2.3:** Implementar detecção automática de artefatos na resposta da IA (código HTML/CSS/JS, gráficos SVG ou scripts interativos) abrindo no Canvas lado a lado.
- [x] **T2.4:** Permitir download e visualização em tela cheia do artefato gerado.

### Fase 3: Recursos Educacionais SENAI & RAG Local
- [ ] **T3.1:** Implementar leitor de PDFs/Apostilas com extração e busca semântica/RAG no próprio browser.
- [x] **T3.2:** Integrar **KaTeX** para renderização de fórmulas matemáticas, físicas e elétricas nas respostas.
- [x] **T3.3:** Criar persona e modo **Tutor Socrático SENAI** (faz perguntas de raciocínio, diagnostica erros e orienta alunos de cursos técnicos).
- [ ] **T3.4:** Modo Simulados & Quizzes interativos com pontuação na tela.

### Fase 4: Otimização PWA, Auditoria & Validação
- [x] **T4.1:** Atualizar Service Worker (`sw.js`) para suportar cache dos novos módulos e bibliotecas.
- [x] **T4.2:** Testar responsividade mobile e alternância de temas (SENAI Red, Dark, Light, Ocean).
- [x] **T4.3:** Executar testes e checagem de integridade e segurança de API Keys.

---

## 🛡️ Validação & Critérios de Aceite

1. **Persistência:** Usuário pode ter 100+ conversas com imagens e PDFs anexados sem aviso de cota de memória estourada.
2. **Python WASM:** Clicar em "Executar" em um bloco de código Python roda e imprime `print()` e cálculos sem depender de servidor externo.
3. **Canvas:** Solicitando "Crie uma página de login em HTML" ou "Um gráfico de tensão elétrica", o Canvas abre ao lado renderizando o resultado vivo.
4. **Sem Regressão:** Todas as funcionalidades de fevereiro (temas, modo foco, exportação PDF/TXT, comparação de modelos) continuam 100% funcionais.
