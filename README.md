# 🚀 Antigravity Remoto

Aplicativo móvel Android nativo (**`.apk`**) e servidor ponte para computador (**PC Bridge**) que permite controlar e utilizar o seu **Google Antigravity** remotamente de qualquer lugar do mundo com acesso à internet.

---

## ✨ Principais Funcionalidades

1. 🌍 **Acesso Remoto Global Seguro**:
   - Conexão em tempo real do celular para o PC de casa através de túnel seguro TLS com **Cloudflare Tunnel** (`cloudflared`).
   - Não requer abertura de portas no roteador, IP fixo ou DDNS.
   - Criptografia de ponta a ponta e autenticação por **API Token** exclusivo.
2. 📷 **Pareamento Instantâneo por QR Code**:
   - Ao iniciar o servidor no PC, um QR Code é exibido no terminal.
   - Basta abrir o app no celular, apontar a câmera e conectar em 1 segundo.
3. 📜 **Histórico Completo de Conversas**:
   - Sincronização direta com o SQLite do Antigravity (`conversation_summaries.db`).
   - Busca em tempo real, visualização de status (*Ativo / Ocioso*), quantidade de passos, timestamp relativo e prévia da última mensagem.
   - Filtro rápido por projeto/workspace.
4. 💬 **Continuidade de Conversas**:
   - Envie novas mensagens para qualquer conversa existente a partir do celular.
   - Suporte a comandos rápidos (*Slash Commands*): `/plan`, `/goal`, `/compact`, `/browser`.
5. ⚡ **Streaming em Tempo Real**:
   - Conexão bidirecional via **WebSocket** para acompanhar o agente trabalhando ao vivo.
   - Bloco retrátil com o processo de pensamento (*Thinking*) do modelo Gemini.
   - Indicadores visuais de execução de ferramentas (*Tool Calls* como `run_command`, `edit_file`, etc.).
6. 📁 **Gerenciamento de Projetos & Workspaces**:
   - Crie novos projetos e diretórios no disco do computador diretamente pelo smartphone.
   - Inicie novas conversas vinculadas a projetos específicos.
7. ⚙️ **Painel de Configurações do Antigravity**:
   - Altere remotamente as configurações globais de `config.json`:
     - Seleção de modelo (Gemini 3.8 Flash, Pro, Lite).
     - Política de execução de ferramentas (`Eager`, `Review`, `Strict`).
     - Ativação ou desativação do Sandbox de terminal.
     - Modo de revisão de planos e artefatos (`Turbo`, `Agente decide`, `Pedir revisão`).
     - Acesso a arquivos fora do workspace.
8. 📦 **Compilação e Entrega Automática via APK (GitHub Actions)**:
   - Pipeline de CI configurado em `.github/workflows/build-apk.yml`.
   - A cada commit na branch `main`, o GitHub Actions compila e assina o `AntigravityRemote-release.apk` na nuvem e publica em **Releases** com link direto para download no Android.

---

## 🏗️ Arquitetura

```
┌────────────────────────────────────────┐
│      📱 Smartphone Android (APK)       │
│  - React Native / Expo Native App      │
│  - Leitor de QR Code integrado         │
│  - Chat com Streaming & Markdown       │
│  - Gestão de Projetos e Configurações  │
└───────────────────┬────────────────────┘
                    │ (HTTPS / WSS Seguro)
                    ▼
┌────────────────────────────────────────┐
│       ☁️ Cloudflare Tunnel TLS         │
│  (https://*.trycloudflare.com)         │
└───────────────────┬────────────────────┘
                    │ (Túnel Local Seguro)
                    ▼
┌────────────────────────────────────────┐
│      💻 Servidor Host PC (FastAPI)     │
│  - start-remote.bat                    │
│  - API REST & WebSocket                │
│  - Leitor SQLite (conversas)           │
│  - Executor agentapi.bat / agy.exe     │
│  - Gerenciador config.json / projects  │
└────────────────────────────────────────┘
```

---

## 🚀 Como Iniciar no Computador

### 1. Iniciar o Servidor Ponte
Basta dar um duplo-clique no arquivo:
```cmd
start-remote.bat
```
Ou executar no terminal:
```bash
python -m uvicorn server.main:app --host 0.0.0.0 --port 8765
```

O servidor irá:
1. Carregar/gerar o seu token de segurança (`server_auth.json`).
2. Iniciar automaticamente o **Cloudflare Tunnel** seguro.
3. Imprimir a URL pública (`https://*.trycloudflare.com`) e o **QR Code de Pareamento** no terminal.

---

## 📱 Como Instalar e Usar no Celular

### Opção 1: Download Direto do APK Oficial (Recomendado)
1. Envie este repositório para o seu GitHub:
   ```bash
   git add .
   git commit -m "feat: Antigravity Remoto inicial"
   git push origin main
   ```
2. Acesse a aba **Actions** ou **Releases** do seu repositório no GitHub pelo celular.
3. Baixe o arquivo **`AntigravityRemote-release.apk`** e toque para instalar.

### Opção 2: Teste Instantâneo via Expo Go
No computador, dentro da pasta `mobile`:
```bash
cd mobile
npx expo start
```
Abra o app **Expo Go** no celular e escaneie o QR Code do Expo.

---

## 🛡️ Segurança e Privacidade

- **Autenticação Obrigatória**: Todas as rotas da API exigem o cabeçalho `Authorization: Bearer <API_KEY>` ou `X-API-Key: <API_KEY>`.
- **Prevenção Directory Traversal**: O download e visualização de artefatos é restrito às pastas autorizadas da conversa.
- **Túnel Criptografado**: O tráfego entre o celular e o PC trafega com criptografia TLS 1.3 fornecida pela Cloudflare.
