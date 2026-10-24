import os
import json
import sqlite3
import subprocess
import uuid
import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from .config import AppPaths

class AntigravityService:
    def __init__(self):
        self.paths = AppPaths()

    def get_db_connection(self):
        """Abre conexão somente leitura com o banco de resumos de conversas."""
        if not self.paths.CONVERSATION_SUMMARIES_DB.exists():
            return None
        conn = sqlite3.connect(f"file:{self.paths.CONVERSATION_SUMMARIES_DB}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn

    def list_conversations(self, limit: int = 50, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retorna lista de conversas com metadados do SQLite."""
        conn = self.get_db_connection()
        if not conn:
            return []
        
        try:
            cursor = conn.cursor()
            query = """
                SELECT conversation_id, title, preview, step_count, last_modified_time, 
                       workspace_uris, status, source, project_id, agent_name, not_fully_idle, 
                       last_user_input_time
                FROM conversation_summaries
            """
            params = []
            if project_id:
                query += " WHERE project_id = ?"
                params.append(project_id)
            
            query += " ORDER BY last_modified_time DESC LIMIT ?"
            params.append(limit)
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            # Mapear projetos para obter nomes amigáveis
            projects = {p["id"]: p["name"] for p in self.list_projects()}

            results = []
            for row in rows:
                p_id = row["project_id"]
                results.append({
                    "id": row["conversation_id"],
                    "title": row["title"] or "Conversa sem título",
                    "preview": row["preview"] or "",
                    "step_count": row["step_count"],
                    "last_modified_time": row["last_modified_time"],
                    "workspace_uris": json.loads(row["workspace_uris"]) if row["workspace_uris"] else [],
                    "status": row["status"],
                    "source": row["source"],
                    "project_id": p_id,
                    "project_name": projects.get(p_id, "Geral"),
                    "agent_name": row["agent_name"],
                    "is_active": bool(row["not_fully_idle"]),
                    "last_user_input_time": row["last_user_input_time"]
                })
            return results
        finally:
            conn.close()

    def get_conversation_transcript(self, conversation_id: str) -> Dict[str, Any]:
        """Lê os passos da conversa a partir do arquivo transcript.jsonl / transcript_full.jsonl."""
        brain_dir = self.paths.BRAIN_DIR / conversation_id
        logs_dir = brain_dir / ".system_generated" / "logs"
        transcript_file = logs_dir / "transcript_full.jsonl"
        if not transcript_file.exists():
            transcript_file = logs_dir / "transcript.jsonl"
        
        messages = []
        if transcript_file.exists():
            try:
                with open(transcript_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            step = json.loads(line)
                            step_type = step.get("type")
                            source = step.get("source")
                            
                            # Normalizar em formato de mensagem para o chat mobile
                            if step_type == "USER_INPUT":
                                messages.append({
                                    "role": "user",
                                    "step_index": step.get("step_index", 0),
                                    "created_at": step.get("created_at"),
                                    "content": step.get("content", ""),
                                    "type": "user_message"
                                })
                            elif step_type == "PLANNER_RESPONSE":
                                messages.append({
                                    "role": "assistant",
                                    "step_index": step.get("step_index", 0),
                                    "created_at": step.get("created_at"),
                                    "thinking": step.get("thinking", ""),
                                    "tool_calls": step.get("tool_calls", []),
                                    "type": "planner_response"
                                })
                            elif step_type == "GENERIC" and source == "MODEL":
                                messages.append({
                                    "role": "assistant",
                                    "step_index": step.get("step_index", 0),
                                    "created_at": step.get("created_at"),
                                    "content": step.get("content", ""),
                                    "type": "assistant_message"
                                })
                        except json.JSONDecodeError:
                            continue
            except Exception as e:
                print(f"Erro ao ler transcrição: {e}")

        # Buscar artefatos disponíveis nesta conversa
        artifacts = self.list_artifacts(conversation_id)

        return {
            "conversation_id": conversation_id,
            "messages": messages,
            "artifacts": artifacts
        }

    def list_artifacts(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Lista os arquivos e artefatos criados dentro da pasta brain da conversa."""
        brain_dir = self.paths.BRAIN_DIR / conversation_id
        if not brain_dir.exists():
            return []
        
        artifacts = []
        for item in brain_dir.iterdir():
            if item.name.startswith(".") or item.name == "scratch":
                continue
            if item.is_file():
                if item.name.endswith(".metadata.json"):
                    continue
                meta_file = brain_dir / f"{item.name}.metadata.json"
                meta_info = {}
                if meta_file.exists():
                    try:
                        with open(meta_file, "r", encoding="utf-8") as mf:
                            meta_info = json.load(mf)
                    except Exception:
                        pass
                
                artifacts.append({
                    "name": item.name,
                    "size": item.stat().st_size,
                    "modified_at": datetime.datetime.fromtimestamp(item.stat().st_mtime).isoformat(),
                    "summary": meta_info.get("Summary", ""),
                    "user_facing": meta_info.get("UserFacing", True),
                    "is_markdown": item.suffix.lower() in [".md", ".markdown", ".txt"],
                    "is_image": item.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp", ".svg"]
                })
        return artifacts

    def get_artifact_content(self, conversation_id: str, filename: str) -> Optional[Dict[str, Any]]:
        """Lê o conteúdo de um arquivo ou artefato."""
        brain_dir = self.paths.BRAIN_DIR / conversation_id
        target = (brain_dir / filename).resolve()
        # Prevenção contra Directory Traversal
        if not str(target).startswith(str(brain_dir.resolve())) or not target.exists():
            return None
        
        is_binary = target.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp", ".exe", ".bin"]
        if is_binary:
            with open(target, "rb") as f:
                import base64
                return {
                    "filename": filename,
                    "is_binary": True,
                    "base64_data": base64.b64encode(f.read()).decode("ascii")
                }
        else:
            with open(target, "r", encoding="utf-8", errors="replace") as f:
                return {
                    "filename": filename,
                    "is_binary": False,
                    "content": f.read()
                }

    def send_message(self, conversation_id: str, prompt: str, title: Optional[str] = None) -> Dict[str, Any]:
        """Envia mensagem para continuar uma conversa via agentapi.bat."""
        cmd = [str(self.paths.AGENTAPI_BAT), "send-message"]
        if title:
            cmd.extend([f"--title={title}"])
        cmd.extend([conversation_id, prompt])
        
        # Executar em processo desacoplado para não travar a requisição HTTP
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            shell=True
        )
        return {
            "status": "sent",
            "conversation_id": conversation_id,
            "pid": process.pid
        }

    def new_conversation(self, prompt: str, model: Optional[str] = None, title: Optional[str] = None, project_id: Optional[str] = None) -> Dict[str, Any]:
        """Cria uma nova conversa via agentapi.bat."""
        cmd = [str(self.paths.AGENTAPI_BAT), "new-conversation"]
        if model:
            cmd.append(f"--model={model}")
        if title:
            cmd.append(f"--title={title}")
        cmd.append(prompt)

        cwd = None
        if project_id:
            # Se fornecido project_id, usar o diretório de trabalho do projeto
            projects = self.list_projects()
            for p in projects:
                if p["id"] == project_id and p.get("folder_path"):
                    cwd = p["folder_path"]
                    break

        process = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            shell=True
        )
        return {
            "status": "initiated",
            "pid": process.pid,
            "model": model or "default",
            "title": title
        }

    def list_projects(self) -> List[Dict[str, Any]]:
        """Lê os projetos configurados em ~/.gemini/config/projects/."""
        if not self.paths.PROJECTS_DIR.exists():
            return []
        
        projects = []
        for file in self.paths.PROJECTS_DIR.glob("*.json"):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    folder_path = ""
                    resources = data.get("projectResources", {}).get("resources", [])
                    if resources and "folderUri" in resources[0]:
                        uri = resources[0]["folderUri"]
                        # Decodificar file:///c%3A/Users/... para caminho Windows
                        import urllib.parse
                        decoded = urllib.parse.unquote(uri)
                        if decoded.startswith("file:///"):
                            folder_path = decoded[8:].replace("/", "\\")
                    
                    projects.append({
                        "id": data.get("id", file.stem),
                        "name": data.get("name", file.stem),
                        "folder_path": folder_path,
                        "settings": data.get("settings", {})
                    })
            except Exception as e:
                print(f"Erro ao ler projeto {file.name}: {e}")
        return projects

    def create_project(self, name: str, folder_path: str) -> Dict[str, Any]:
        """Cria um novo projeto e sua pasta se necessário."""
        path_obj = Path(folder_path)
        path_obj.mkdir(parents=True, exist_ok=True)
        
        project_id = str(uuid.uuid4())
        # Codificar formato folderUri
        import urllib.parse
        clean_path = str(path_obj.resolve()).replace("\\", "/")
        if not clean_path.startswith("/"):
            clean_path = "/" + clean_path
        uri = f"file://{urllib.parse.quote(clean_path, safe='/:')}"

        project_data = {
            "id": project_id,
            "name": name,
            "projectResources": {
                "resources": [
                    {
                        "folderUri": uri
                    }
                ]
            },
            "settings": {},
            "isWorkspaceOnly": False
        }
        
        self.paths.PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
        target_file = self.paths.PROJECTS_DIR / f"{project_id}.json"
        with open(target_file, "w", encoding="utf-8") as f:
            json.dump(project_data, f, indent=2)
            
        return {
            "id": project_id,
            "name": name,
            "folder_path": str(path_obj.resolve()),
            "status": "created"
        }

    def get_settings(self) -> Dict[str, Any]:
        """Retorna configurações globais do Antigravity."""
        if not self.paths.GLOBAL_CONFIG_FILE.exists():
            return {}
        try:
            with open(self.paths.GLOBAL_CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("userSettings", {})
        except Exception as e:
            print(f"Erro ao ler settings: {e}")
            return {}

    def update_settings(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Atualiza campos de configuração em config.json mantendo integridade."""
        if not self.paths.GLOBAL_CONFIG_FILE.exists():
            return {}
        
        try:
            with open(self.paths.GLOBAL_CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            user_settings = data.setdefault("userSettings", {})
            for key, val in updates.items():
                user_settings[key] = val
                
            with open(self.paths.GLOBAL_CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
                
            return user_settings
        except Exception as e:
            print(f"Erro ao salvar configurações: {e}")
            raise
