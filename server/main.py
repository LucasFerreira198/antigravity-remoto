import os
import sys
import json
import asyncio
import socket
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, Dict, Any, Set

from fastapi import FastAPI, HTTPException, Header, Query, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel
import psutil

from .config import AppPaths, API_KEY
from .antigravity_service import AntigravityService
from .tunnel import TunnelManager
from .cdp_controller import cdp_controller

service = AntigravityService()
tunnel_manager = TunnelManager(local_port=8765)

# WebSockets ativos por conversa
active_websockets: Dict[str, Set[WebSocket]] = {}
ws_lock = threading.Lock()
main_loop: Optional[asyncio.AbstractEventLoop] = None

class SendMessageRequest(BaseModel):
    prompt: str
    title: Optional[str] = None

class NewConversationRequest(BaseModel):
    prompt: str
    model: Optional[str] = None
    title: Optional[str] = None
    project_id: Optional[str] = None

class CreateProjectRequest(BaseModel):
    name: str
    folder_path: str

class UpdateSettingsRequest(BaseModel):
    settings: Dict[str, Any]

async def verify_token(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    provided = None
    if authorization and authorization.startswith("Bearer "):
        provided = authorization[7:]
    elif x_api_key:
        provided = x_api_key
    elif token:
        provided = token

    if not provided or provided != API_KEY:
        raise HTTPException(status_code=401, detail="Token de autorização inválido ou ausente.")
    return True

@asynccontextmanager
async def lifespan(app: FastAPI):
    global main_loop
    main_loop = asyncio.get_running_loop()
    main_loop.run_in_executor(None, lambda: tunnel_manager.start_tunnel(lambda url: tunnel_manager.print_pairing_qr(API_KEY)))
    yield
    tunnel_manager.stop_tunnel()

app = FastAPI(
    title="Antigravity Remote Bridge",
    description="API de controle remoto para o Google Antigravity",
    version="1.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- BROADCAST HELPER -----------------

def broadcast_to_conversation(conversation_id: str, data: dict):
    """Envia eventos de turno aos WebSockets conectados de forma thread-safe."""
    with ws_lock:
        sockets = list(active_websockets.get(conversation_id, []))
    
    if not sockets or not main_loop or not main_loop.is_running():
        return

    message_text = json.dumps(data)
    for ws in sockets:
        try:
            asyncio.run_coroutine_threadsafe(ws.send_text(message_text), main_loop)
        except Exception:
            pass

# ----------------- ROTAS PÚBLICAS -----------------

@app.get("/")
def index():
    return {
        "service": "Antigravity Remote Bridge",
        "status": "online",
        "version": "1.1.0",
        "documentation": "/docs"
    }

@app.get("/api/pairing-info")
def get_pairing_info():
    hostname = socket.gethostname()
    local_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    return {
        "hostname": hostname,
        "remote_url": tunnel_manager.public_url,
        "local_url": f"http://{local_ip}:{tunnel_manager.local_port}",
        "api_key": API_KEY,
        "is_tunnel_ready": bool(tunnel_manager.public_url)
    }

# ----------------- ROTAS PROTEGIDAS -----------------

@app.get("/api/status", dependencies=[Depends(verify_token)])
async def get_system_status():
    antigravity_running = False
    for p in psutil.process_iter(['name']):
        if p.info['name'] and 'antigravity' in p.info['name'].lower():
            antigravity_running = True
            break

    settings = service.get_settings()
    desktop_cdp = await cdp_controller.is_desktop_available()
    
    return {
        "status": "online",
        "hostname": socket.gethostname(),
        "cpu_percent": psutil.cpu_percent(interval=None),
        "ram_percent": psutil.virtual_memory().percent,
        "antigravity_running": antigravity_running,
        "desktop_cdp_available": desktop_cdp,
        "settings": {
            "model": settings.get("model", "Gemini 3.8 Flash"),
            "autoExecutionPolicy": settings.get("autoExecutionPolicy", "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER"),
            "theme": settings.get("themeMode", "THEME_MODE_DARK")
        }
    }

@app.get("/api/conversations", dependencies=[Depends(verify_token)])
def list_conversations(limit: int = 50, project_id: Optional[str] = None):
    return service.list_conversations(limit=limit, project_id=project_id)

@app.get("/api/conversations/{conversation_id}", dependencies=[Depends(verify_token)])
def get_conversation(conversation_id: str):
    data = service.get_conversation_transcript(conversation_id)
    if not data["messages"] and not data["artifacts"]:
        convos = service.list_conversations(limit=200)
        found = any(c["id"] == conversation_id for c in convos)
        if not found:
            raise HTTPException(status_code=404, detail="Conversa não encontrada.")
    return data

@app.post("/api/conversations/new", dependencies=[Depends(verify_token)])
async def create_conversation(req: NewConversationRequest):
    """Cria nova conversa diretamente no desktop via CDP ou fallback agy.exe."""
    # 1. Tentar via CDP se desktop estiver ativo
    if await cdp_controller.is_desktop_available():
        new_cid = await cdp_controller.create_conversation_on_desktop(req.prompt, req.project_id)
        if new_cid:
            return {
                "status": "created_desktop",
                "conversation_id": new_cid,
                "model": req.model or "desktop"
            }

    # 2. Fallback para agy.exe
    convo_created_event = threading.Event()
    new_convo_id = [None]

    def run_turn():
        def on_line(line_str):
            try:
                evt = json.loads(line_str)
                if evt.get("event") == "init" and evt.get("conversation_id"):
                    new_convo_id[0] = evt["conversation_id"]
                    convo_created_event.set()
                
                cid = new_convo_id[0] or ""
                broadcast_to_conversation(cid, {"event": "stream_step", "raw": evt})
            except Exception:
                pass

        service.execute_turn_stream(
            conversation_id=None,
            prompt=req.prompt,
            on_line=on_line,
            model=req.model,
            project_id=req.project_id
        )

    t = threading.Thread(target=run_turn, daemon=True)
    t.start()

    convo_created_event.wait(timeout=5)

    return {
        "status": "initiated",
        "conversation_id": new_convo_id[0],
        "model": req.model or "default"
    }

@app.post("/api/conversations/{conversation_id}/messages", dependencies=[Depends(verify_token)])
async def send_message(conversation_id: str, req: SendMessageRequest):
    """Envia mensagem para a conversa: via CDP na interface do PC ou fallback para agy.exe."""
    # 1. Enviar diretamente para a janela do PC via CDP (executa na tela do PC)
    if await cdp_controller.is_desktop_available():
        success = await cdp_controller.send_message_to_desktop(conversation_id, req.prompt)
        if success:
            return {
                "status": "executing_desktop",
                "conversation_id": conversation_id,
                "channel": "cdp"
            }

    # 2. Fallback CLI agy.exe
    def run_turn():
        def on_line(line_str):
            try:
                evt = json.loads(line_str)
                broadcast_to_conversation(conversation_id, {"event": "stream_step", "raw": evt})
            except Exception:
                pass

        service.execute_turn_stream(
            conversation_id=conversation_id,
            prompt=req.prompt,
            on_line=on_line
        )

    t = threading.Thread(target=run_turn, daemon=True)
    t.start()

    return {
        "status": "executing_cli",
        "conversation_id": conversation_id,
        "channel": "cli"
    }

@app.get("/api/projects", dependencies=[Depends(verify_token)])
def list_projects():
    return service.list_projects()

@app.post("/api/projects", dependencies=[Depends(verify_token)])
def create_project(req: CreateProjectRequest):
    return service.create_project(name=req.name, folder_path=req.folder_path)

@app.get("/api/settings", dependencies=[Depends(verify_token)])
def get_settings():
    return service.get_settings()

@app.put("/api/settings", dependencies=[Depends(verify_token)])
def update_settings(req: UpdateSettingsRequest):
    return service.update_settings(req.settings)

@app.get("/api/artifacts/{conversation_id}/{filename}", dependencies=[Depends(verify_token)])
def get_artifact(conversation_id: str, filename: str):
    data = service.get_artifact_content(conversation_id, filename)
    if not data:
        raise HTTPException(status_code=404, detail="Artefato não encontrado.")
    return data

# ----------------- WEBSOCKET DE STREAMING -----------------

@app.websocket("/api/conversations/{conversation_id}/stream")
async def websocket_conversation_stream(websocket: WebSocket, conversation_id: str, token: Optional[str] = Query(None)):
    if token != API_KEY:
        await websocket.close(code=4001, reason="Não autorizado")
        return

    await websocket.accept()
    
    with ws_lock:
        if conversation_id not in active_websockets:
            active_websockets[conversation_id] = set()
        active_websockets[conversation_id].add(websocket)

    # 1. Enviar histórico limpo existente inicialmente
    try:
        transcript_data = service.get_conversation_transcript(conversation_id)
        await websocket.send_text(json.dumps({
            "event": "initial_history",
            "messages": transcript_data["messages"],
            "artifacts": transcript_data["artifacts"]
        }))
    except Exception as e:
        print(f"Erro ao enviar histórico inicial: {e}")

    # 2. Tarefa em segundo plano para monitorar o arquivo transcript.jsonl
    brain_dir = service.paths.BRAIN_DIR / conversation_id / ".system_generated" / "logs"
    transcript_file = brain_dir / "transcript_full.jsonl"
    if not transcript_file.exists():
        transcript_file = brain_dir / "transcript.jsonl"

    last_size = transcript_file.stat().st_size if transcript_file.exists() else 0
    stop_event = asyncio.Event()

    async def watch_transcript_loop():
        nonlocal last_size
        while not stop_event.is_set():
            await asyncio.sleep(0.5)
            try:
                if transcript_file.exists():
                    current_size = transcript_file.stat().st_size
                    if current_size != last_size:
                        last_size = current_size
                        fresh_data = service.get_conversation_transcript(conversation_id)
                        await websocket.send_text(json.dumps({
                            "event": "transcript_updated",
                            "messages": fresh_data["messages"],
                            "artifacts": fresh_data["artifacts"]
                        }))
            except Exception:
                pass

    watcher_task = asyncio.create_task(watch_transcript_loop())

    try:
        while True:
            # Manter socket aberto aguardando pings ou desconexão
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        stop_event.set()
        watcher_task.cancel()
        with ws_lock:
            if conversation_id in active_websockets:
                active_websockets[conversation_id].discard(websocket)
                if not active_websockets[conversation_id]:
                    del active_websockets[conversation_id]
