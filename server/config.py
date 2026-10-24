import os
import json
import secrets
from pathlib import Path
from pydantic import BaseModel

class AppPaths:
    USER_HOME = Path.home()
    GEMINI_DIR = USER_HOME / ".gemini"
    ANTIGRAVITY_DIR = GEMINI_DIR / "antigravity"
    CONFIG_DIR = GEMINI_DIR / "config"
    PROJECTS_DIR = CONFIG_DIR / "projects"
    GLOBAL_CONFIG_FILE = CONFIG_DIR / "config.json"
    
    CONVERSATION_SUMMARIES_DB = ANTIGRAVITY_DIR / "conversation_summaries.db"
    CONVERSATIONS_DIR = ANTIGRAVITY_DIR / "conversations"
    BRAIN_DIR = ANTIGRAVITY_DIR / "brain"
    
    AGENTAPI_BAT = ANTIGRAVITY_DIR / "bin" / "agentapi.bat"
    AGY_EXE = GEMINI_DIR / "bin" / "agy.exe"

class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8765
    api_key: str = ""
    public_url: str = ""

def get_or_create_api_key(config_file_path: Path = None) -> str:
    """Carrega ou gera um token de segurança exclusivo para pareamento."""
    if config_file_path is None:
        config_file_path = Path(__file__).resolve().parent / "server_auth.json"
    
    if config_file_path.exists():
        try:
            with open(config_file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "api_key" in data and data["api_key"]:
                    return data["api_key"]
        except Exception:
            pass

    new_key = secrets.token_hex(24)
    data = {
        "api_key": new_key,
        "hostname": os.environ.get("COMPUTERNAME", "localhost"),
        "created_at": str(Path(__file__).stat().st_ctime if Path(__file__).exists() else "")
    }
    try:
        with open(config_file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Aviso ao salvar server_auth.json: {e}")
    
    return new_key

API_KEY = get_or_create_api_key()
