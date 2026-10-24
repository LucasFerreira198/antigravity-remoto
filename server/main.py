import os
import sys
import json
import asyncio
import socket
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Header, Query, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel
import psutil

from .config import AppPaths, API_KEY
from .antigravity_service import AntigravityService
from .tunnel import TunnelManager

service = AntigravityService()
tunnel_manager = TunnelManager(local_port=8765)

# Models
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

# Security Dependency
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
    # Inicialização: Rodar túnel Cloudflare em segundo plano
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, lambda: tunnel_manager.start_tunnel(lambda url: tunnel_manager.print_pairing_qr(API_KEY)))
    yield
    # Finalização
    tunnel_manager.stop_tunnel()

app = FastAPI(
    title="Antigravity Remote Bridge",
    description="API de controle remoto para o Google Antigravity",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- ROTAS PÚBLICAS (PAREAMENTO) -----------------

@app.get("/")
def index():
    return {
        "service": "Antigravity Remote Bridge",
        "status": "online",
        "documentation": "/docs",
        "pairing_dashboard": "/dashboard"
    }

@app.get("/dashboard", response_class=HTMLResponse)
def pairing_dashboard():
    """Painel web simples do host para facilitar visualização de QR Code e status."""
    hostname = socket.gethostname()
    return f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Antigravity Remoto - Painel de Controle</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }}
            .card {{ background: #1e293b; padding: 30px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 500px; width: 100%; text-align: center; border: 1px solid #334155; }}
            h1 {{ margin-top: 0; color: #38bdf8; font-size: 24px; }}
            .status {{ display: inline-block; padding: 6px 12px; background: #065f46; color: #34d399; border-radius: 20px; font-size: 13px; font-weight: bold; margin-bottom: 20px; }}
            .token-box {{ background: #0f172a; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 13px; word-break: break-all; margin: 15px 0; border: 1px solid #475569; }}
            .info {{ color: #94a3b8; font-size: 14px; margin-bottom: 20px; text-align: left; }}
            .info strong {{ color: #e2e8f0; }}
            a.btn {{ display: inline-block; background: #0284c7; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 10px; }}
        </style>
    </head>
    <body>
        <div class="card">
            <h1>🚀 Antigravity Remoto</h1>
            <div class="status">● SERVIÇO ATIVO</div>
            <p class="info">
                <strong>Host:</strong> {hostname}<br>
                <strong>URL Pública Cloudflare:</strong> {tunnel_manager.public_url or "Carregando túnel..."}<br>
                <strong>Porta Local:</strong> {tunnel_manager.local_port}
            </p>
            <div style="margin: 20px 0;">
                <p style="font-size: 13px; color: #cbd5e1; margin-bottom: 8px;">Token de Segurança (API Key):</p>
                <div class="token-box">{API_KEY}</div>
            </div>
            <p style="font-size: 13px; color: #94a3b8;">
                Abra o app <strong>Antigravity Remoto</strong> no celular e use o leitor de QR Code ou insira a URL e o Token acima.
            </p>
        </div>
    </body>
    </html>
    """

@app.get("/api/pairing-info")
def get_pairing_info():
    """Retorna dados estruturados para pareamento rápido com o aplicativo."""
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

# ----------------- ROTAS PROTEGIDAS DA API -----------------

@app.get("/api/status", dependencies=[Depends(verify_token)])
def get_system_status():
    """Retorna o status geral do computador, uso de recursos e do Antigravity."""
    antigravity_running = False
    for p in psutil.process_iter(['name']):
        if p.info['name'] and 'antigravity' in p.info['name'].lower():
            antigravity_running = True
            break

    settings = service.get_settings()
    
    return {
        "status": "online",
        "hostname": socket.gethostname(),
        "cpu_percent": psutil.cpu_percent(interval=None),
        "ram_percent": psutil.virtual_memory().percent,
        "antigravity_running": antigravity_running,
        "settings": {
            "model": settings.get("model", "Gemini 3.8 Flash"),
            "autoExecutionPolicy": settings.get("autoExecutionPolicy", "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER"),
            "theme": settings.get("themeMode", "THEME_MODE_DARK")
        }
    }

@app.get("/api/conversations", dependencies=[Depends(verify_token)])
def list_conversations(limit: int = 50, project_id: Optional[str] = None):
    """Lista as conversas com metadados do SQLite."""
    return service.list_conversations(limit=limit, project_id=project_id)

@app.get("/api/conversations/{conversation_id}", dependencies=[Depends(verify_token)])
def get_conversation(conversation_id: str):
    """Obtém mensagens e artefatos de uma conversa."""
    data = service.get_conversation_transcript(conversation_id)
    if not data["messages"] and not data["artifacts"]:
        # Se vazio, verificar se existe a conversa no SQLite
        convos = service.list_conversations(limit=200)
        found = any(c["id"] == conversation_id for c in convos)
        if not found:
            raise HTTPException(status_code=404, detail="Conversa não encontrada.")
    return data

@app.post("/api/conversations/new", dependencies=[Depends(verify_token)])
def create_conversation(req: NewConversationRequest):
    """Inicia uma nova conversa no Antigravity."""
    result = service.new_conversation(
        prompt=req.prompt,
        model=req.model,
        title=req.title,
        project_id=req.project_id
    )
    return result

@app.post("/api/conversations/{conversation_id}/messages", dependencies=[Depends(verify_token)])
def send_message(conversation_id: str, req: SendMessageRequest):
    """Continua uma conversa enviando novo prompt."""
    result = service.send_message(
        conversation_id=conversation_id,
        prompt=req.prompt,
        title=req.title
    )
    return result

@app.get("/api/projects", dependencies=[Depends(verify_token)])
def list_projects():
    """Retorna todos os projetos do Antigravity."""
    return service.list_projects()

@app.post("/api/projects", dependencies=[Depends(verify_token)])
def create_project(req: CreateProjectRequest):
    """Cria novo projeto no Antigravity."""
    return service.create_project(name=req.name, folder_path=req.folder_path)

@app.get("/api/settings", dependencies=[Depends(verify_token)])
def get_settings():
    """Retorna configurações ativas do Antigravity."""
    return service.get_settings()

@app.put("/api/settings", dependencies=[Depends(verify_token)])
def update_settings(req: UpdateSettingsRequest):
    """Altera configurações globais do Antigravity."""
    return service.update_settings(req.settings)

@app.get("/api/artifacts/{conversation_id}/{filename}", dependencies=[Depends(verify_token)])
def get_artifact(conversation_id: str, filename: str):
    """Baixa ou visualiza artefato gerado na conversa."""
    data = service.get_artifact_content(conversation_id, filename)
    if not data:
        raise HTTPException(status_code=404, detail="Artefato não encontrado.")
    return data

# ----------------- WEBSOCKET DE STREAMING EM TEMPO REAL -----------------

@app.websocket("/api/conversations/{conversation_id}/stream")
async def websocket_conversation_stream(websocket: WebSocket, conversation_id: str, token: Optional[str] = Query(None)):
    """Transmite passos, pensamentos e atualizações de chat em tempo real via WebSocket."""
    if token != API_KEY:
        await websocket.close(code=4001, reason="Não autorizado")
        return

    await websocket.accept()
    
    brain_dir = AppPaths.BRAIN_DIR / conversation_id
    logs_dir = brain_dir / ".system_generated" / "logs"
    transcript_file = logs_dir / "transcript_full.jsonl"
    if not transcript_file.exists():
        transcript_file = logs_dir / "transcript.jsonl"

    last_line_read = 0

    # 1. Enviar mensagens existentes inicialmente
    if transcript_file.exists():
        try:
            with open(transcript_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
                last_line_read = len(lines)
                for line in lines:
                    line = line.strip()
                    if line:
                        try:
                            await websocket.send_text(json.dumps({
                                "event": "step",
                                "data": json.loads(line)
                            }))
                        except Exception:
                            pass
        except Exception as e:
            print(f"Erro ao ler transcript inicial no WS: {e}")

    # 2. Observar novas linhas geradas em tempo real
    try:
        while True:
            await asyncio.sleep(0.5)
            if transcript_file.exists():
                try:
                    with open(transcript_file, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                        if len(lines) > last_line_read:
                            new_lines = lines[last_line_read:]
                            last_line_read = len(lines)
                            for line in new_lines:
                                line = line.strip()
                                if line:
                                    try:
                                        await websocket.send_text(json.dumps({
                                            "event": "step",
                                            "data": json.loads(line)
                                        }))
                                    except Exception:
                                        pass
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Erro no WebSocket: {e}")
