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

    async def send_message_to_desktop(self, conversation_id: str, prompt: str) -> bool:
        """Digita e envia a mensagem diretamente na janela ativa do Antigravity no PC."""
        port = self.get_devtools_port()
        if not port:
            return False

        ws_url = await self.get_page_ws_url(port)
        if not ws_url:
            return False

        try:
            async with websockets.connect(ws_url, close_timeout=3) as ws:
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
                await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": nav_expr, "returnByValue": True}}))
                res1 = json.loads(await ws.recv())
                nav_result = res1.get("result", {}).get("result", {}).get("value")
                if nav_result in ("clicked_link", "navigated_url"):
                    await asyncio.sleep(0.8)

                # 2. Focar o campo de texto e inserir o conteúdo
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
                await ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate", "params": {"expression": focus_insert_expr, "returnByValue": True}}))
                res2 = json.loads(await ws.recv())
                inserted = res2.get("result", {}).get("result", {}).get("value")

                if not inserted:
                    # Fallback para Input.insertText via CDP
                    await ws.send(json.dumps({
                        "id": 3,
                        "method": "Input.insertText",
                        "params": {"text": prompt}
                    }))
                    await ws.recv()

                await asyncio.sleep(0.2)

                # 3. Enviar mensagem (clicar no botão Send ou disparar tecla Enter)
                submit_expr = """
                (() => {
                    const btn = document.querySelector('button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label^="Send"]');
                    if (btn && !btn.disabled) {
                        btn.click();
                        return 'clicked_button';
                    }
                    const el = document.querySelector('[aria-label="Message input"]');
                    if (el) {
                        const evt = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true
                        });
                        el.dispatchEvent(evt);
                        return 'dispatched_enter';
                    }
                    return 'none';
                })()
                """
                await ws.send(json.dumps({"id": 4, "method": "Runtime.evaluate", "params": {"expression": submit_expr, "returnByValue": True}}))
                res4 = json.loads(await ws.recv())
                sub_res = res4.get("result", {}).get("result", {}).get("value")

                if sub_res == 'none':
                    # Fallback para tecla Enter via eventos de teclado CDP
                    await ws.send(json.dumps({
                        "id": 5,
                        "method": "Input.dispatchKeyEvent",
                        "params": {
                            "type": "keyDown",
                            "key": "Enter",
                            "code": "Enter",
                            "windowsVirtualKeyCode": 13,
                            "nativeVirtualKeyCode": 13,
                            "text": "\r"
                        }
                    }))
                    await ws.recv()
                    await ws.send(json.dumps({
                        "id": 6,
                        "method": "Input.dispatchKeyEvent",
                        "params": {
                            "type": "keyUp",
                            "key": "Enter",
                            "code": "Enter",
                            "windowsVirtualKeyCode": 13,
                            "nativeVirtualKeyCode": 13
                        }
                    }))
                    await ws.recv()

                print(f"[CDP] Mensagem enviada com sucesso para conversa {conversation_id} no PC (resultado: {sub_res})!")
                return True
        except Exception as e:
            print(f"[CDP] Erro ao enviar mensagem via CDP: {e}")
            return False

    async def create_conversation_on_desktop(self, prompt: str, project_id: Optional[str] = None) -> Optional[str]:
        """Inicia uma nova conversa na interface do Antigravity no PC."""
        port = self.get_devtools_port()
        if not port:
            return None

        ws_url = await self.get_page_ws_url(port)
        if not ws_url:
            return None

        try:
            async with websockets.connect(ws_url, close_timeout=3) as ws:
                # 1. Clicar em New Conversation
                nav_expr = """
                (() => {
                    const btn = document.querySelector('button[aria-label="New Conversation"], a[href="/"]');
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    window.location.href = '/';
                    return true;
                })()
                """
                await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": nav_expr, "returnByValue": True}}))
                await ws.recv()
                await asyncio.sleep(0.7)

                # 2. Inserir texto e submeter
                safe_prompt = json.dumps(prompt)
                focus_insert_submit = f"""
                (() => {{
                    const el = document.querySelector('[aria-label="Message input"], [placeholder="Message input"]');
                    if (!el) return false;
                    el.focus();
                    document.execCommand('selectAll', false, null);
                    document.execCommand('insertText', false, {safe_prompt});
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    setTimeout(() => {{
                        const btn = document.querySelector('button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label^="Send"]');
                        if (btn && !btn.disabled) {{
                            btn.click();
                        }}
                    }}, 200);
                    return true;
                }})()
                """
                await ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate", "params": {"expression": focus_insert_submit, "returnByValue": True}}))
                await ws.recv()
                await asyncio.sleep(1.2)

                # 3. Ler o novo URL da conversa gerada
                await ws.send(json.dumps({"id": 3, "method": "Runtime.evaluate", "params": {"expression": "window.location.pathname", "returnByValue": True}}))
                res3 = json.loads(await ws.recv())
                path = res3.get("result", {}).get("result", {}).get("value", "")
                if "/c/" in path:
                    new_cid = path.split("/c/")[1].split("?")[0]
                    print(f"[CDP] Nova conversa iniciada no PC: {new_cid}")
                    return new_cid
                return None
        except Exception as e:
            print(f"[CDP] Erro ao criar conversa via CDP: {e}")
            return None

cdp_controller = CDPController()
