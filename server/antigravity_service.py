import os
import re
import json
import sqlite3
import subprocess
import uuid
import datetime
import threading
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable

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

    def clean_message_content(self, text: str) -> str:
        """Limpa metadados internos, tags XML e notificações de sistema para exibir apenas o texto limpo."""
        if not text:
            return ""
        
        # Ignorar mensagens de sistema que não foram enviadas pelo usuário
        if "The following is a <SYSTEM_MESSAGE>" in text:
            return ""
        
        # 1. Extrair conteúdo principal de <USER_REQUEST> se existir
        match = re.search(r'<USER_REQUEST>(.*?)</USER_REQUEST>', text, re.DOTALL)
        if match:
            text = match.group(1).strip()

        # 2. Remover bloco de metadados
        text = re.sub(r'<ADDITIONAL_METADATA>.*?</ADDITIONAL_METADATA>', '', text, flags=re.DOTALL)
        # 3. Remover tags de slash commands / contexto interno
        text = re.sub(r'<[A-Z_]+(\[[^\]]+\])?>.*?</[A-Z_]+>', '', text, flags=re.DOTALL)
        # 4. Remover tags residuais
        text = re.sub(r'</?[A-Za-z0-9_-]+(\s+[^>]*)?>', '', text)

        return text.strip()

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
            
            projects = {p["id"]: p["name"] for p in self.list_projects()}

            results = []
            for row in rows:
                p_id = row["project_id"]
                preview = self.clean_message_content(row["preview"] or "")
                title = row["title"] or "Conversa sem título"
                # Limpar título se contiver tags
                title = self.clean_message_content(title) or title

                results.append({
                    "id": row["conversation_id"],
                    "title": title,
                    "preview": preview,
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

    def format_tool_call(self, tc: Dict[str, Any]) -> Dict[str, Any]:
        """Formata ferramentas executadas com ícones visuais e descrições idênticas ao desktop."""
        name = tc.get("name", "Tool")
        args = tc.get("args", {})
        summary = args.get("toolSummary") or args.get("CommandLine") or name

        icon = "doc"
        title = name
        detail = ""

        if name == "read_file":
            path_str = str(args.get("Path", ""))
            basename = Path(path_str).name or path_str
            start_l = args.get("StartLine")
            end_l = args.get("EndLine")
            ext = Path(path_str).suffix.lower()
            badge = "📄"
            icon = "doc"
            if ext == ".py":
                badge = "🐍"
                icon = "python"
            elif ext in [".tsx", ".jsx"]:
                badge = "⚛"
                icon = "react"
            elif ext in [".ts", ".js"]:
                badge = "TS"
                icon = "typescript"

            if start_l and end_l:
                title = f"Analyzed {badge} {basename} #L{start_l}-{end_l}"
            elif start_l:
                title = f"Analyzed {badge} {basename} #L{start_l}"
            else:
                title = f"Reading {badge} {basename}"
            detail = path_str
        elif name in ["run_command"]:
            icon = "terminal"
            cmd = str(args.get("CommandLine", ""))
            tool_sum = args.get("toolSummary")
            if tool_sum:
                title = f"Ran {tool_sum}"
            else:
                title = f"Ran {cmd[:30]}..." if len(cmd) > 30 else f"Ran {cmd}"
            detail = cmd
        elif name in ["edit_file", "write_file"]:
            path_str = str(args.get("Path", ""))
            basename = Path(path_str).name or path_str
            ext = Path(path_str).suffix.lower()
            badge = "🐍" if ext == ".py" else ("⚛" if ext in [".tsx", ".jsx"] else ("TS" if ext in [".ts", ".js"] else "📄"))
            action = "Edited" if name == "edit_file" else "Created"
            title = f"{action} {badge} {basename}"
            detail = path_str
        elif name == "search_web":
            icon = "search"
            q = str(args.get("query", ""))
            title = f"Searched {q[:35]}"
            detail = q
        elif name == "ask_question":
            icon = "question"
            title = "Pergunta do Antigravity"
            detail = "Escolha uma opção para responder"
        else:
            title = str(summary)[:60]
            detail = json.dumps(args)[:200]

        return {
            "name": name,
            "title": title,
            "icon": icon,
            "detail": detail,
            "args": args,
            "questions": args.get("questions") if name == "ask_question" else None
        }

    def get_conversation_transcript(self, conversation_id: str) -> Dict[str, Any]:
        """Lê os passos da conversa a partir do arquivo transcript.jsonl / transcript_full.jsonl de forma rápida e completa."""
        brain_dir = self.paths.BRAIN_DIR / conversation_id
        logs_dir = brain_dir / ".system_generated" / "logs"
        transcript_file = logs_dir / "transcript_full.jsonl"
        if not transcript_file.exists():
            transcript_file = logs_dir / "transcript.jsonl"
        
        messages = []
        is_active = False
        if transcript_file.exists():
            try:
                # Verificar se o arquivo foi modificado nos últimos 20 segundos
                mtime = transcript_file.stat().st_mtime
                if (datetime.datetime.now().timestamp() - mtime) < 20:
                    is_active = True

                with open(transcript_file, "r", encoding="utf-8") as f:
                    all_lines = f.readlines()
                    # Ler até as últimas 150 linhas para resposta instantânea no mobile
                    target_lines = all_lines[-150:] if len(all_lines) > 150 else all_lines

                prev_time = None
                for line in target_lines:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        step = json.loads(line)
                        step_type = step.get("type")
                        created_at = step.get("created_at")

                        duration_s = 5
                        if created_at and prev_time:
                            try:
                                t1 = datetime.datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                                t0 = datetime.datetime.fromisoformat(prev_time.replace("Z", "+00:00"))
                                duration_s = max(1, int((t1 - t0).total_seconds()))
                            except Exception:
                                pass
                        prev_time = created_at
                        
                        if step_type == "USER_INPUT":
                            raw_content = step.get("content", "")
                            clean_text = self.clean_message_content(raw_content)
                            media_list = []
                            for m in step.get("media", []):
                                uri_path = m.get("uri", "")
                                media_list.append({
                                    "mime_type": m.get("mime_type", "image/png"),
                                    "filename": Path(uri_path).name,
                                    "url": f"/api/conversations/{conversation_id}/media/{Path(uri_path).name}"
                                })
                            if clean_text or media_list:
                                messages.append({
                                    "role": "user",
                                    "step_index": step.get("step_index", 0),
                                    "created_at": created_at,
                                    "content": clean_text,
                                    "media": media_list,
                                    "type": "user_message"
                                })
                        elif step_type == "PLANNER_RESPONSE":
                            content = step.get("content", "")
                            thinking = step.get("thinking", "")
                            tool_calls = step.get("tool_calls", [])
                            
                            # 1. Raciocínio interno (Thought for Xs)
                            if thinking and thinking.strip():
                                messages.append({
                                    "role": "assistant",
                                    "step_index": step.get("step_index", 0),
                                    "created_at": created_at,
                                    "thinking": thinking.strip(),
                                    "thought_duration": f"{duration_s}s",
                                    "thought_label": f"Thought for {duration_s}s",
                                    "type": "thought_step"
                                })

                            # 2. Chamadas de ferramentas com badges
                            if tool_calls:
                                for tc in tool_calls:
                                    formatted_tc = self.format_tool_call(tc)
                                    messages.append({
                                        "role": "assistant",
                                        "step_index": step.get("step_index", 0),
                                        "created_at": created_at,
                                        "tool_call": formatted_tc,
                                        "type": "tool_step"
                                    })

                            # 3. Resposta textual final
                            if content and content.strip():
                                messages.append({
                                    "role": "assistant",
                                    "step_index": step.get("step_index", 0),
                                    "created_at": created_at,
                                    "content": content.strip(),
                                    "type": "assistant_message"
                                })
                        # GENERIC: Saídas brutas de ferramentas não geram balões soltos
                    except json.JSONDecodeError:
                        continue
            except Exception as e:
                print(f"Erro ao ler transcrição: {e}")

        artifacts = self.list_artifacts(conversation_id)

        return {
            "conversation_id": conversation_id,
            "messages": messages,
            "artifacts": artifacts,
            "is_active": is_active
        }

    def list_artifacts(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Lista os artefatos gerados na pasta brain da conversa."""
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
        """Lê o conteúdo de um arquivo ou artefato com proteção path traversal."""
        brain_dir = self.paths.BRAIN_DIR / conversation_id
        target = (brain_dir / filename).resolve()
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

    def execute_turn_stream(
        self,
        conversation_id: Optional[str],
        prompt: str,
        on_line: Callable[[str], None],
        model: Optional[str] = None,
        project_id: Optional[str] = None
    ):
        """Executa um turno completo no Antigravity CLI (agy.exe) transmitindo a saída em tempo real."""
        cmd = [
            str(self.paths.AGY_EXE),
            "-p", prompt,
            "--mode", "auto",
            "--dangerously-skip-permissions",
            "--output-format", "stream-json"
        ]

        if conversation_id:
            cmd.extend(["--conversation", conversation_id])
        if model:
            cmd.extend(["--model", model])
        if project_id:
            cmd.extend(["--project", project_id])

        # Definir diretório de trabalho adequado
        cwd = None
        if project_id:
            for p in self.list_projects():
                if p["id"] == project_id and p.get("folder_path"):
                    cwd = p["folder_path"]
                    break

        print(f"[AGY] Executando turno: {' '.join(cmd[:4])} ...")
        process = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace"
        )

        for line in process.stdout:
            line_str = line.strip()
            if line_str:
                on_line(line_str)

        process.wait()

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
        """Cria novo projeto e pasta."""
        path_obj = Path(folder_path)
        path_obj.mkdir(parents=True, exist_ok=True)
        
        project_id = str(uuid.uuid4())
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
        """Atualiza campos em config.json."""
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
