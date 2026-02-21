# 💡 Ideias de Melhorias — SENAI GPT

## 🎨 Interface & Design
- [x] **Sidebar expansível** — mostrar histórico de conversas salvas
- [ ] **Avatares personalizados** — foto do usuário e ícone animado do bot
- [x] **Animação de digitação** — texto aparecendo letra por letra (streaming)
- [x] **Temas personalizados** — além de dark/light, temas como "SENAI Red", "Midnight", "Ocean"
- [x] **Responsividade mobile** — menu hambúrguer, input fixo no fundo
- [x] **Skeleton loading** — placeholder animado enquanto espera a resposta
- [x] **Botão de scroll automático** — seta para voltar ao final do chat

## 🤖 Funcionalidades de IA
- [ ] **Streaming de resposta** — texto aparecendo em tempo real (SSE)
- [x] **Escolha de modelo** — dropdown para trocar entre Gemini Flash, Pro, etc.
- [x] **Controle de temperatura** — slider para criatividade da resposta
- [x] **Prompt de sistema editável** — usuário pode personalizar a "personalidade"
- [x] **Geração de imagens** — integrar Imagen ou DALL-E para criar imagens
- [x] **Text-to-Speech** — ouvir as respostas do bot em áudio
- [x] **Speech-to-Text funcional** — usar Web Speech API no botão de microfone

## 💾 Persistência & Dados
- [x] **Salvar conversas** — localStorage ou banco de dados (MySQL/PHP)
- [x] **Exportar chat** — baixar conversa como PDF ou TXT
- [x] **Histórico na sidebar** — listar conversas anteriores com título automático
- [x] **Favoritar mensagens** — marcar respostas importantes com estrela
- [x] **Login de usuário** — sistema de autenticação para salvar dados

## 📎 Arquivos & Mídia
- [x] **Preview de PDFs** — mostrar miniatura do PDF no chat
- [x] **Arrastar múltiplos arquivos** — upload em batch com barra de progresso
- [x] **Limite de tamanho** — aviso visual quando arquivo excede o limite da API
- [x] **Câmera ao vivo** — capturar foto pela webcam e enviar para análise

## 🔧 Técnico & Performance
- [ ] **Backend PHP** — proxy para esconder a API key do frontend
- [ ] **Cache de respostas** — salvar respostas frequentes para economia de tokens
- [x] **Rate limiting** — controlar quantidade de requests por minuto(o usuario pode desativar ou controlar)
- [x] **Error retry** — tentar novamente automaticamente em caso de falha
- [ ] **PWA** — tornar o site instalável como app (manifest + service worker)

## 📚 Código & UX
- [x] **Botão de executar código** — rodar Python/JS direto no navegador (sandbox)
- [x] **Syntax highlighting avançado** — usar Prism.js ou Highlight.js para mais linguagens
- [x] **Markdown completo** — tabelas, listas ordenadas, headings, links clicáveis
- [x] **Feedback de respostas** — botões 👍👎 para avaliar cada resposta
- [x] **Compartilhar conversa** — gerar link público para uma conversa
