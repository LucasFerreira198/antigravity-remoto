import json
import urllib.request
import websockets
import asyncio
from pathlib import Path
from typing import Optional

class CDPController:
    def __init__(self):
        self.devtools_port_file = Path.home() / "AppData" / "Roaming" / "antigravity" / "DevToolsActivePort"

    def get_devtools_port(self) -> Optional[int]:
        if not self.devtools_port_file.exists():
            return None
        try:
            with open(self.devtools_port_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
                if lines:
                    return int(lines[0].strip())
        except Exception:
            pass
        return None

    async def get_page_ws_url(self, port: int) -> Optional[str]:
        try:
            url = f"http://127.0.0.1:{port}/json"
            req = urllib.request.Request(url, headers={"User-Agent": "AntigravityBridge"})
            with urllib.request.urlopen(req, timeout=1.5) as res:
                targets = json.loads(res.read().decode("utf-8"))
                for t in targets:
                    if t.get("type") == "page" and "webSocketDebuggerUrl" in t:
                        return t["webSocketDebuggerUrl"]
        except Exception:
            pass
        return None

    async def is_desktop_available(self) -> bool:
        port = self.get_devtools_port()
        if not port:
            return False
        ws_url = await self.get_page_ws_url(port)
        return bool(ws_url)

    async def send_message_to_desktop(self, conversation_id: str, prompt: str, file_path: Optional[str] = None) -> bool:
        """Digita e envia a mensagem diretamente na janela ativa do Antigravity no PC, com suporte a anexo de arquivo."""
        port = self.get_devtools_port()
        if not port:
            return False

        ws_url = await self.get_page_ws_url(port)
        if not ws_url:
            return False

        try:
            async with websockets.connect(ws_url, max_size=20 * 1024 * 1024, close_timeout=5, origin=None) as ws:
                async def cdp_call(method, params=None, msg_id=1):
                    await ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
                    while True:
                        msg = json.loads(await ws.recv())
                        if msg.get("id") == msg_id:
                            return msg

                # 1. Trocar para a conversa desejada se a tela estiver em outra
                nav_expr = f"""
                (() => {{
                    if (!window.location.pathname.includes('{conversation_id}')) {{
                        const link = document.querySelector('a[href*="{conversation_id}"]');
                        if (link) {{
                            link.click();
                            return 'clicked_link';
                        }} else {{
                            window.location.href = '/c/{conversation_id}';
                            return 'navigated_url';
                        }}
                    }}
                    return 'already_here';
                }})()
                """
                res1 = await cdp_call("Runtime.evaluate", {"expression": nav_expr, "returnByValue": True}, msg_id=1)
                nav_result = res1.get("result", {}).get("result", {}).get("value")
                if nav_result in ("clicked_link", "navigated_url"):
                    await asyncio.sleep(0.8)

                # 2. Se houver anexo de imagem / arquivo, injetar no input file
                if file_path and Path(file_path).exists():
                    try:
                        await cdp_call("DOM.enable", {}, msg_id=10)
                        doc_res = await cdp_call("DOM.getDocument", {"depth": -1}, msg_id=11)
                        root_id = doc_res.get("result", {}).get("root", {}).get("nodeId")
                        if root_id:
                            q_res = await cdp_call("DOM.querySelector", {"nodeId": root_id, "selector": 'input[type="file"]'}, msg_id=12)
                            file_node_id = q_res.get("result", {}).get("nodeId")
                            if file_node_id:
                                abs_p = str(Path(file_path).resolve())
                                await cdp_call("DOM.setFileInputFiles", {"files": [abs_p], "nodeId": file_node_id}, msg_id=13)
                                await asyncio.sleep(0.5)
                    except Exception as e:
                        print(f"[CDP] Erro ao injetar arquivo: {e}")

                # 2.5 Verificar se há um modal de pergunta interativa aberto no desktop (ask_question)
                safe_prompt = json.dumps(prompt)
                check_modal_expr = f"""
                (() => {{
                    // 1. Procurar botão de Submit da pergunta interativa na tela
                    const allBtns = Array.from(document.querySelectorAll('button'));
                    const submitBtn = allBtns.find(b => {{
                        const t = (b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase();
                        return (t === 'submit' || t.includes('submit') || t === 'confirmar') && !b.disabled;
                    }});

                    const modal = document.querySelector('[role="dialog"], [role="alertdialog"], div[data-state="open"], div[class*="modal"]') || 
                                  (submitBtn ? (submitBtn.closest('div[class*="card"], div[class*="dialog"]') || submitBtn.parentElement.parentElement) : null);
                    
                    if (!submitBtn && !modal) return 'no_modal';
                    
                    const container = modal || document.body;
                    const answerText = {safe_prompt}.trim().toLowerCase();
                    
                    // A. Procurar opção selecionável com texto correspondente
                    const allClickables = Array.from(container.querySelectorAll('button, label, [role="radio"], [role="checkbox"], div[class*="option"], div[class*="item"], div[class*="choice"]'));
                    let clicked = false;
                    for (const el of allClickables) {{
                        if (el === submitBtn) continue;
                        const t = (el.innerText || '').trim().toLowerCase();
                        if (t && (t === answerText || t.includes(answerText) || answerText.includes(t))) {{
                            el.click();
                            clicked = true;
                            break;
                        }}
                    }}

                    // B. Se não encontrou opção ou se for texto customizado, preencher o campo de texto/textarea do modal
                    const input = container.querySelector('input[type="text"], textarea');
                    if (!clicked && input) {{
                        input.focus();
                        document.execCommand('selectAll', false, null);
                        document.execCommand('insertText', false, {safe_prompt});
                        input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        input.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    }}

                    // C. Clicar no botão Submit imediatamente
                    if (submitBtn) {{
                        submitBtn.click();
                    }} else {{
                        const fallbackSubmit = Array.from(container.querySelectorAll('button')).find(b => {{
                            const t = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase();
                            return t.includes('submit') || t.includes('confirm') || b.type === 'submit';
                        }});
                        if (fallbackSubmit) fallbackSubmit.click();
                    }}

                    return 'modal_answered';
                }})()
                """
                modal_res = await cdp_call("Runtime.evaluate", {"expression": check_modal_expr, "returnByValue": True}, msg_id=20)
                if modal_res.get("result", {}).get("result", {}).get("value") == "modal_answered":
                    await asyncio.sleep(0.5)
                    return True

                # 3. Focar o campo de texto e inserir o conteúdo
                safe_prompt = json.dumps(prompt)
                focus_insert_expr = f"""
                (() => {{
                    const el = document.querySelector('[aria-label="Message input"], [placeholder="Message input"]');
                    if (!el) return false;
                    el.focus();
                    document.execCommand('selectAll', false, null);
                    document.execCommand('insertText', false, {safe_prompt});
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    return true;
                }})()
                """
                res2 = await cdp_call("Runtime.evaluate", {"expression": focus_insert_expr, "returnByValue": True}, msg_id=2)
                inserted = res2.get("result", {}).get("result", {}).get("value")

                if not inserted:
                    # Fallback para Input.insertText via CDP
                    await cdp_call("Input.insertText", {"text": prompt}, msg_id=3)

                await asyncio.sleep(0.3)

                # 4. Enviar mensagem (clicar no botão Send ou disparar tecla Enter nativa)
                submit_expr = """
                (() => {
                    const btn = document.querySelector('button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label^="Send"]');
                    if (btn && !btn.disabled) {
                        btn.click();
                        return 'clicked_button';
                    }
                    return 'need_enter';
                })()
                """
                res4 = await cdp_call("Runtime.evaluate", {"expression": submit_expr, "returnByValue": True}, msg_id=4)
                sub_res = res4.get("result", {}).get("result", {}).get("value")

                if sub_res != 'clicked_button':
                    # Fallback para tecla Enter via eventos nativos de teclado CDP
                    await cdp_call("Input.dispatchKeyEvent", {
                        "type": "rawKeyDown",
                        "key": "Enter",
                        "code": "Enter",
                        "windowsVirtualKeyCode": 13,
                        "nativeVirtualKeyCode": 13,
                        "text": "\r"
                    }, msg_id=5)
                    await cdp_call("Input.dispatchKeyEvent", {
                        "type": "keyUp",
                        "key": "Enter",
                        "code": "Enter",
                        "windowsVirtualKeyCode": 13,
                        "nativeVirtualKeyCode": 13
                    }, msg_id=6)

                return True
        except Exception as e:
            print(f"[CDP Controller] Erro ao enviar mensagem para desktop: {e}")
            return False

    async def get_desktop_pending_text(self, conversation_id: str) -> Optional[str]:
        """Obtém o texto que está digitado no campo de mensagem do desktop aguardando envio."""
        port = self.get_devtools_port()
        if not port:
            return None
        ws_url = await self.get_page_ws_url(port)
        if not ws_url:
            return None
        try:
            async with websockets.connect(ws_url, max_size=5 * 1024 * 1024, close_timeout=3, origin=None) as ws:
                expr = """
                (() => {
                    const el = document.querySelector('[aria-label="Message input"], [placeholder="Message input"]');
                    if (el) {
                        return (el.innerText || el.value || '').trim();
                    }
                    return '';
                })()
                """
                await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}}))
                res = json.loads(await ws.recv())
                return res.get("result", {}).get("result", {}).get("value") or ""
        except Exception:
            return None

    async def create_conversation_on_desktop(self, prompt: str, project_id: Optional[str] = None) -> Optional[str]:
        """Cria nova conversa na janela do PC clicando em 'New Conversation' ou navegando para '/'."""
        port = self.get_devtools_port()
        if not port:
            return None

        ws_url = await self.get_page_ws_url(port)
        if not ws_url:
            return None

        try:
            async with websockets.connect(ws_url, max_size=20 * 1024 * 1024, close_timeout=5, origin=None) as ws:
                async def cdp_call(method, params=None, msg_id=1):
                    await ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
                    while True:
                        msg = json.loads(await ws.recv())
                        if msg.get("id") == msg_id:
                            return msg

                # 1. Clicar em novo chat ou navegar para a home
                new_chat_expr = """
                (() => {
                    const newBtn = document.querySelector('button[aria-label="New Conversation"], a[href="/"], button[data-testid="new-conversation-button"]');
                    if (newBtn) {
                        newBtn.click();
                        return 'clicked_new';
                    } else {
                        window.location.href = '/';
                        return 'navigated_root';
                    }
                })()
                """
                await cdp_call("Runtime.evaluate", {"expression": new_chat_expr, "returnByValue": True}, msg_id=1)
                await asyncio.sleep(1.0)

                # 2. Digitar e enviar o prompt
                safe_prompt = json.dumps(prompt)
                type_expr = f"""
                (() => {{
                    const el = document.querySelector('[aria-label="Message input"], [placeholder="Message input"]');
                    if (!el) return false;
                    el.focus();
                    document.execCommand('insertText', false, {safe_prompt});
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    
                    setTimeout(() => {{
                        const btn = document.querySelector('button[data-testid="send-button"], button[aria-label="Send message"]');
                        if (btn) btn.click();
                    }}, 300);
                    return true;
                }})()
                """
                await cdp_call("Runtime.evaluate", {"expression": type_expr, "returnByValue": True}, msg_id=2)
                await asyncio.sleep(1.5)

                # 3. Ler o novo conversation_id da URL atual
                url_expr = "window.location.pathname"
                url_res = await cdp_call("Runtime.evaluate", {"expression": url_expr, "returnByValue": True}, msg_id=3)
                pathname = url_res.get("result", {}).get("result", {}).get("value", "")
                if "/c/" in pathname:
                    new_id = pathname.split("/c/")[-1].split("/")[0].split("?")[0]
                    return new_id
                return None
        except Exception as e:
            print(f"[CDP Controller] Erro ao criar conversa no desktop: {e}")
            return None

    async def stop_execution(self, conversation_id: str) -> bool:
        """Clica no botão de Parar execução (Stop execution) na interface desktop do Antigravity."""
        port = self.get_devtools_port()
        if not port:
            return False
        ws_url = await self.get_page_ws_url(port)
        if not ws_url:
            return False
        try:
            async with websockets.connect(ws_url, max_size=5 * 1024 * 1024, close_timeout=4, origin=None) as ws:
                expr = """
                (() => {
                    const stopBtn = document.querySelector('button[aria-label*="Stop execution"], button[title*="Stop execution"], button[aria-label*="Stop"], button[data-testid*="stop"]');
                    if (stopBtn && !stopBtn.disabled) {
                        stopBtn.click();
                        return true;
                    }
                    const btns = Array.from(document.querySelectorAll('button'));
                    for (const b of btns) {
                        const t = (b.innerText || '').toLowerCase();
                        const a = (b.getAttribute('aria-label') || '').toLowerCase();
                        if (t === 'stop' || t === 'parar' || a === 'stop' || a === 'stop execution') {
                            b.click();
                            return true;
                        }
                    }
                    return false;
                })()
                """
                await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}}))
                res = json.loads(await ws.recv())
                return bool(res.get("result", {}).get("result", {}).get("value"))
        except Exception as e:
            print(f"[CDP Controller] Erro ao parar execução: {e}")
            return False

    async def get_models(self) -> Dict[str, Any]:
        """Obtém o modelo ativo atual e os modelos disponíveis no Antigravity desktop."""
        port = self.get_devtools_port()
        if not port:
            return {"current_model": "Desconhecido", "available_models": []}
        ws_url = await self.get_page_ws_url(port)
        if not ws_url:
            return {"current_model": "Desconhecido", "available_models": []}
        try:
            async with websockets.connect(ws_url, max_size=5 * 1024 * 1024, close_timeout=4, origin=None) as ws:
                # 1. Obter modelo atual
                get_curr_expr = """
                (() => {
                    const btn = document.querySelector('button[aria-label*="Select model"]');
                    if (!btn) return 'Gemini 3.8 Flash High';
                    const aria = btn.getAttribute('aria-label') || '';
                    const match = aria.match(/current:\s*(.+)$/i);
                    if (match) return match[1].trim();
                    return btn.innerText.trim() || 'Gemini 3.8 Flash High';
                })()
                """
                await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": get_curr_expr, "returnByValue": True}}))
                res1 = json.loads(await ws.recv())
                current_model = res1.get("result", {}).get("result", {}).get("value") or "Gemini 3.8 Flash High"

                # 2. Clicar no botão para abrir as opções de modelos
                open_expr = """
                (() => {
                    const btn = document.querySelector('button[aria-label*="Select model"]');
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                })()
                """
                await ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate", "params": {"expression": open_expr, "returnByValue": True}}))
                await ws.recv()
                await asyncio.sleep(0.3)

                # 3. Ler opções do menu
                read_opts_expr = """
                (() => {
                    const items = Array.from(document.querySelectorAll('[role="menuitem"]')).map(el => {
                        const lines = el.innerText.trim().split('\\n').map(l => l.trim()).filter(Boolean);
                        const name = lines[0] || '';
                        const badge = lines[1] || '';
                        return { name, badge, text: el.innerText.trim() };
                    }).filter(m => m.name && !m.name.includes('View Usage'));

                    // Fechar o menu com Escape
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    return items;
                })()
                """
                await ws.send(json.dumps({"id": 3, "method": "Runtime.evaluate", "params": {"expression": read_opts_expr, "returnByValue": True}}))
                res3 = json.loads(await ws.recv())
                opts = res3.get("result", {}).get("result", {}).get("value") or []

                if not opts:
                    opts = [
                        {"name": "Gemini 3.8 Flash High", "badge": "Rápido (1M)", "id": "flash"},
                        {"name": "Claude Sonnet 4.6 (Thinking)", "badge": "Raciocínio", "id": "sonnet"},
                        {"name": "Claude Opus 4.6 (Thinking)", "badge": "Máxima Capacidade", "id": "opus"},
                        {"name": "GPT-OSS 120B (Medium)", "badge": "Open-Source", "id": "gpt"},
                        {"name": "Gemini 4 Argon", "badge": "Próxima Geração", "id": "argon"},
                    ]
                return {
                    "current_model": current_model,
                    "available_models": opts
                }
        except Exception as e:
            print(f"[CDP Controller] Erro ao buscar modelos: {e}")
            return {
                "current_model": "Gemini 3.8 Flash High",
                "available_models": [
                    {"name": "Gemini 3.8 Flash High", "badge": "Padrão", "id": "flash"},
                    {"name": "Claude Sonnet 4.6 (Thinking)", "badge": "Raciocínio", "id": "sonnet"},
                    {"name": "Claude Opus 4.6 (Thinking)", "badge": "Máxima Capacidade", "id": "opus"},
                ]
            }

    async def set_model(self, model_name: str) -> bool:
        """Seleciona um modelo no dropdown do Antigravity desktop."""
        port = self.get_devtools_port()
        if not port:
            return False
        ws_url = await self.get_page_ws_url(port)
        if not ws_url:
            return False
        try:
            async with websockets.connect(ws_url, max_size=5 * 1024 * 1024, close_timeout=4, origin=None) as ws:
                # 1. Abrir dropdown
                await ws.send(json.dumps({
                    "id": 1,
                    "method": "Runtime.evaluate",
                    "params": {
                        "expression": "(() => { const b = document.querySelector('button[aria-label*=\"Select model\"]'); if (b) { b.click(); return true; } return false; })()",
                        "returnByValue": True
                    }
                }))
                await ws.recv()
                await asyncio.sleep(0.3)

                # 2. Clicar no item correspondente ao model_name
                safe_name = json.dumps(model_name.lower())
                select_expr = f"""
                (() => {{
                    const query = {safe_name};
                    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
                    for (const item of items) {{
                        const text = (item.innerText || '').toLowerCase();
                        if (text.includes(query) || (query.includes('flash') && text.includes('flash')) ||
                            (query.includes('sonnet') && text.includes('sonnet')) ||
                            (query.includes('opus') && text.includes('opus')) ||
                            (query.includes('gpt') && text.includes('gpt')) ||
                            (query.includes('argon') && text.includes('argon'))) {{
                            item.click();
                            return true;
                        }}
                    }}
                    document.dispatchEvent(new KeyboardEvent('keydown', {{ key: 'Escape', bubbles: true }}));
                    return false;
                }})()
                """
                await ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate", "params": {"expression": select_expr, "returnByValue": True}}))
                res2 = json.loads(await ws.recv())
                return bool(res2.get("result", {}).get("result", {}).get("value"))
        except Exception as e:
            print(f"[CDP Controller] Erro ao trocar modelo: {e}")
            return False

cdp_controller = CDPController()
