import os
import re
import json
import sqlite3
import subprocess
import uuid
import datetime
import threading
import time
import psutil
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable

from .config import AppPaths

class AntigravityService:
    def __init__(self):
        self.paths = AppPaths()
        self._skills_cache: Optional[List[Dict[str, Any]]] = None
        self._skills_cache_time: float = 0.0

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
            return match.group(1).strip()

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

        path = str(args.get("Path", ""))
        target = str(args.get("Target", "")) if "Target" in args else None
        replacement = str(args.get("Replacement", "")) if "Replacement" in args else None
        content = str(args.get("Content", "")) if "Content" in args else None
        command = str(args.get("CommandLine", "")) if "CommandLine" in args else None
        start_line = args.get("StartLine")
        end_line = args.get("EndLine")

        if name == "read_file":
            path_str = path
            basename = Path(path_str).name or path_str
            start_l = start_line
            end_l = end_line
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
            cmd = command or str(args.get("CommandLine", ""))
            tool_sum = args.get("toolSummary")
            if tool_sum:
                title = f"Ran {tool_sum}"
            else:
                title = f"Ran {cmd[:30]}..." if len(cmd) > 30 else f"Ran {cmd}"
            detail = cmd
        elif name in ["edit_file", "write_file"]:
            path_str = path
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

        questions = None
        if name == "ask_question":
            raw_q = args.get("questions")
            if isinstance(raw_q, str):
                try:
                    questions = json.loads(raw_q)
                except Exception:
                    questions = []
            elif isinstance(raw_q, list):
                questions = raw_q

        return {
            "name": name,
            "title": title,
            "icon": icon,
            "detail": detail,
            "path": path if path else None,
            "target": target,
            "replacement": replacement,
            "content": content,
            "command": command,
            "start_line": start_line,
            "end_line": end_line,
            "args": args,
            "questions": questions
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
                with open(transcript_file, "r", encoding="utf-8") as f:
                    all_lines = f.readlines()
                    # Ler até 500 linhas garantindo múltiplos turnos e todas as mensagens do usuário
                    target_lines = all_lines[-500:] if len(all_lines) > 500 else all_lines

                # Determinar com precisão se o agente está trabalhando:
                # O turno permanece ativo enquanto o último passo não for uma resposta final com conteúdo
                for l in reversed(target_lines[-10:] if len(target_lines) > 10 else target_lines):
                    l = l.strip()
                    if not l:
                        continue
                    try:
                        s_data = json.loads(l)
                        st = s_data.get("type")
                        cnt = s_data.get("content")
                        if st in ("USER_INPUT", "GENERIC"):
                            is_active = True
                            break
                        elif st == "PLANNER_RESPONSE":
                            tool_calls = s_data.get("tool_calls", [])
                            # Se a ferramenta for ask_question, o agente está aguardando resposta do usuário (não está executando)
                            has_ask_question = any(tc.get("name") == "ask_question" for tc in tool_calls)
                            if has_ask_question:
                                is_active = False
                                break
                            has_tools = bool(tool_calls)
                            if has_tools:
                                is_active = True
                                break
                            elif cnt and cnt.strip():
                                is_active = False
                                break
                            else:
                                is_active = True
                                break
                    except Exception:
                        continue

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
        queued_messages = self.get_queued_messages(conversation_id)

        return {
            "conversation_id": conversation_id,
            "messages": messages,
            "artifacts": artifacts,
            "is_active": is_active,
            "queued_messages": queued_messages
        }

    def get_queued_messages(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Lê mensagens na fila de espera do Antigravity (mensagens do PC ainda não processadas)."""
        brain_dir = self.paths.BRAIN_DIR / conversation_id
        msg_dir = brain_dir / ".system_generated" / "messages"
        if not msg_dir.exists():
            return []
        read_file = msg_dir / "read.json"
        read_ids = set()
        if read_file.exists():
            try:
                with open(read_file, "r", encoding="utf-8") as rf:
                    read_ids = set(json.load(rf).keys())
            except Exception:
                pass
        queued = []
        for f in sorted(msg_dir.glob("*.json"), key=lambda x: x.stat().st_mtime):
            if f.name == "read.json":
                continue
            if f.stem not in read_ids:
                try:
                    with open(f, "r", encoding="utf-8") as mf:
                        data = json.load(mf)
                        step_p = data.get("stepPayload", {})
                        content = step_p.get("content", "")
                        if content:
                            clean_c = self.clean_message_content(content)
                            if clean_c:
                                queued.append({
                                    "id": data.get("id", f.stem),
                                    "content": clean_c,
                                    "sender": data.get("sender", "user"),
                                    "timestamp": data.get("timestamp", ""),
                                    "source": "pc"
                                })
                except Exception:
                    pass
        return queued

    def list_artifacts(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Lista os artefatos gerados na pasta brain da conversa, identificando se algum plano ainda aguarda Proceed."""
        brain_dir = self.paths.BRAIN_DIR / conversation_id
        if not brain_dir.exists():
            return []
        
        # 1. Obter timestamp da última mensagem enviada pelo usuário
        last_user_time = 0.0
        transcript_file = brain_dir / ".system_generated" / "logs" / "transcript.jsonl"
        if transcript_file.exists():
            try:
                with open(transcript_file, "r", encoding="utf-8", errors="replace") as tf:
                    for line in reversed(tf.readlines()):
                        if '"type": "USER_INPUT"' in line or '"type":"USER_INPUT"' in line:
                            data = json.loads(line)
                            created_at = data.get("created_at")
                            if created_at:
                                dt = datetime.datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                                last_user_time = dt.timestamp()
                                break
            except Exception:
                pass

        artifacts = []
        raw_items = []
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
                
                art_mtime = item.stat().st_mtime
                meta_updated = meta_info.get("updatedAt", meta_info.get("updated_at"))
                if meta_updated:
                    try:
                        dt_meta = datetime.datetime.fromisoformat(meta_updated.replace("Z", "+00:00"))
                        art_mtime = max(art_mtime, dt_meta.timestamp())
                    except Exception:
                        pass

                is_plan = "plan" in item.name.lower() or "plano" in item.name.lower()
                explicit_req_feedback = bool(meta_info.get("RequestFeedback", meta_info.get("requestFeedback", False)))
                
                raw_items.append({
                    "item": item,
                    "meta_info": meta_info,
                    "art_mtime": art_mtime,
                    "is_plan": is_plan,
                    "explicit_req_feedback": explicit_req_feedback
                })

        # Identificar o plano mais recente
        plan_items = [r for r in raw_items if r["is_plan"] or r["explicit_req_feedback"]]
        latest_plan_item = max(plan_items, key=lambda x: x["art_mtime"]) if plan_items else None

        for r in raw_items:
            item = r["item"]
            meta_info = r["meta_info"]
            art_mtime = r["art_mtime"]
            is_plan = r["is_plan"]

            # Um plano SÓ aguarda feedback (Proceed) se:
            # 1. For o plano MAIS RECENTE da conversa
            # 2. Foi criado ou atualizado APÓS o último input do usuário (margem de 1s)
            # 3. Teve flag de feedback ou é um documento de plano
            is_pending = False
            if latest_plan_item and r == latest_plan_item:
                if (r["explicit_req_feedback"] or is_plan) and (art_mtime > (last_user_time + 1.0)):
                    is_pending = True

            artifacts.append({
                "name": item.name,
                "size": item.stat().st_size,
                "modified_at": datetime.datetime.fromtimestamp(art_mtime).isoformat(),
                "summary": meta_info.get("Summary", meta_info.get("summary", "")),
                "user_facing": meta_info.get("UserFacing", meta_info.get("userFacing", True)),
                "is_markdown": item.suffix.lower() in [".md", ".markdown", ".txt"],
                "is_image": item.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp", ".svg"],
                "request_feedback": is_pending,
                "is_plan": is_plan,
                "is_executed": not is_pending if is_plan else False
            })

        artifacts.sort(key=lambda a: a["modified_at"], reverse=True)
        return artifacts

    def get_artifact_content(self, conversation_id: str, filename: str) -> Optional[Dict[str, Any]]:
        """Lê o conteúdo de um arquivo ou artefato com proteção path traversal."""
        brain_dir = self.paths.BRAIN_DIR / conversation_id
        target = (brain_dir / filename).resolve()
        if not str(target).startswith(str(brain_dir.resolve())) or not target.exists():
            return None
        
        meta_file = brain_dir / f"{target.name}.metadata.json"
        meta_info = {}
        if meta_file.exists():
            try:
                with open(meta_file, "r", encoding="utf-8") as mf:
                    meta_info = json.load(mf)
            except Exception:
                pass
        is_req_feedback = bool(
            meta_info.get("RequestFeedback", meta_info.get("requestFeedback", False))
            or ("plan" in target.name.lower())
        )

        is_binary = target.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp", ".exe", ".bin"]
        if is_binary:
            with open(target, "rb") as f:
                import base64
                return {
                    "filename": filename,
                    "is_binary": True,
                    "base64_data": base64.b64encode(f.read()).decode("ascii"),
                    "request_feedback": is_req_feedback,
                    "summary": meta_info.get("Summary", meta_info.get("summary", ""))
                }
        else:
            with open(target, "r", encoding="utf-8", errors="replace") as f:
                return {
                    "filename": filename,
                    "is_binary": False,
                    "content": f.read(),
                    "request_feedback": is_req_feedback,
                    "summary": meta_info.get("Summary", meta_info.get("summary", ""))
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

    def get_background_tasks(self, conversation_id: str) -> List[Dict[str, Any]]:
        """
        Descobre servidores e processos em segundo plano relevantes (Uvicorn, Python, Cloudflare, dev servers).
        Filtra tarefas efêmeras desnecessárias (como timers, pytest, tsc, git) mantendo apenas o que realmente importa.
        """
        brain_dir = self.paths.BRAIN_DIR / conversation_id
        tasks_dir = brain_dir / ".system_generated" / "tasks"
        transcript_file = brain_dir / ".system_generated" / "logs" / "transcript.jsonl"

        RELEVANT_PATTERNS = [
            'uvicorn', 'python -m uvicorn', 'fastapi', 'flask', 'django',
            'http.server', 'server.main', 'cloudflared', 'tunnel',
            'npm run dev', 'npm start', 'yarn dev', 'pnpm dev', 'vite', 'next dev',
            'expo start', 'node server', 'python '
        ]

        EXCLUDE_PATTERNS = [
            'timer:', 'schedule', 'prompt: wait', 'npx tsc', 'pytest',
            'get-childitem', 'select-string', 'asar', 'git ', 'read_file',
            'write_file', 'inspect_page'
        ]

        def is_relevant_server(desc: str) -> bool:
            if not desc:
                return False
            d = desc.lower().strip()
            if any(ex in d for ex in EXCLUDE_PATTERNS):
                return False
            return any(pat in d for pat in RELEVANT_PATTERNS)

        def get_friendly_name(desc: str, tool_summary: str = '') -> str:
            d = (desc or '').lower()
            s = (tool_summary or '').lower()
            if 'uvicorn' in d or 'server.main' in d or 'uvicorn' in s:
                return 'Servidor Uvicorn (FastAPI Python)'
            if 'cloudflared' in d or 'tunnel' in d:
                return 'Tunel Cloudflare (Acesso Remoto)'
            if 'vite' in d:
                return 'Vite Dev Server'
            if 'expo' in d or 'metro' in d:
                return 'Expo Metro Bundler'
            if 'http.server' in d:
                return 'Servidor HTTP Local (Python)'
            if 'python' in d:
                return 'Processo Python em Background'
            return tool_summary or 'Servidor em Segundo Plano'

        # 1. Parse do transcript para encontrar tarefas ativas do Antigravity
        active_tasks_map: Dict[str, Dict[str, Any]] = {}
        if transcript_file.exists():
            try:
                with open(transcript_file, "r", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        if not line.strip():
                            continue
                        try:
                            d = json.loads(line)
                            c = d.get("content", "")
                            if "background task(s) currently running:" in c:
                                m = re.search(r"\[\s*\{.*\}\s*\]", c, re.DOTALL)
                                if m:
                                    raw_tasks = json.loads(m.group(0))
                                    active_tasks_map = {
                                        t["taskId"].split("/")[-1]: t for t in raw_tasks if "taskId" in t
                                    }
                            elif "No background tasks are currently running" in c:
                                active_tasks_map = {}
                            elif "# Running Background Tasks" in c:
                                m = re.search(r"# Running Background Tasks[^{]*(\{.*\}|\[.*\])", c, re.DOTALL)
                                if m:
                                    raw = m.group(1).strip()
                                    if raw.startswith("["):
                                        active_tasks_map = {
                                            t["taskId"].split("/")[-1]: t for t in json.loads(raw) if "taskId" in t
                                        }
                                    elif raw.startswith("{"):
                                        t = json.loads(raw)
                                        if "taskId" in t:
                                            active_tasks_map = {t["taskId"].split("/")[-1]: t}
                            elif "finished with result:" in c:
                                m = re.search(r"sender=([^\s\r\n]+)", c)
                                if m:
                                    finished_id = m.group(1).split("\n")[0].split("\r")[0].strip().split("/")[-1].split("\\")[-1]
                                    if finished_id in active_tasks_map:
                                        active_tasks_map.pop(finished_id, None)
                        except Exception:
                            continue
            except Exception as e:
                print(f"Erro ao ler transcript para tarefas: {e}")

        # 2. Inspecionar processos reais no Sistema Operacional (Windows) com psutil
        os_uvicorn_pid = None
        os_uvicorn_cmd = None
        os_uvicorn_mem = 0
        os_cloudflared_pid = None

        try:
            for p in psutil.process_iter(['pid', 'name']):
                try:
                    cmd_list = p.cmdline() if p.is_running() else []
                    cmd_str = ' '.join(cmd_list)
                    cmd_lower = cmd_str.lower()
                    if 'uvicorn' in cmd_lower and 'server.main' in cmd_lower:
                        os_uvicorn_pid = p.pid
                        os_uvicorn_cmd = cmd_str
                        try:
                            os_uvicorn_mem = round(p.memory_info().rss / (1024 * 1024), 1)
                        except Exception:
                            os_uvicorn_mem = 0
                    elif 'cloudflared' in p.name().lower() and '--url' in cmd_lower:
                        os_cloudflared_pid = p.pid
                except (psutil.AccessDenied, psutil.NoSuchProcess):
                    pass
        except Exception as e:
            print(f"Erro ao verificar processos psutil: {e}")

        # 3. Construir lista limpa de tarefas
        result = []
        matched_uvicorn = False

        for tid, tinfo in active_tasks_map.items():
            # Validar ID para evitar lixo de regex
            if not tid or not re.match(r"^task-\d+$", tid):
                continue

            desc = tinfo.get("description", "")
            if not is_relevant_server(desc):
                continue

            # Ler log da tarefa
            log_tail = ""
            log_size = 0
            lf = tasks_dir / f"{tid}.log"
            if lf.exists():
                try:
                    log_size = lf.stat().st_size
                    with open(lf, "r", encoding="utf-8", errors="replace") as f:
                        lines = f.readlines()
                        log_tail = "".join(lines[-60:])
                except Exception:
                    pass

            pid = None
            if "uvicorn" in desc.lower() and os_uvicorn_pid:
                pid = os_uvicorn_pid
                matched_uvicorn = True

            result.append({
                "task_id": tid,
                "full_id": tinfo.get("taskId", f"{conversation_id}/{tid}"),
                "name": get_friendly_name(desc, tinfo.get("toolSummary", "")),
                "description": desc,
                "created_at": tinfo.get("startTime") or datetime.datetime.now().isoformat(),
                "status": "running",
                "is_daemon": tinfo.get("isDaemon", True),
                "tool_name": tinfo.get("toolName", "run_command"),
                "pid": pid,
                "port": 8765 if "8765" in desc else None,
                "memory_mb": os_uvicorn_mem if pid else None,
                "log_size": log_size,
                "log_tail": log_tail or "(Servidor em execução)"
            })

        # Se o Uvicorn estiver ativo no SO e não foi capturado do transcript
        if os_uvicorn_pid and not matched_uvicorn:
            # Procurar se existe algum log recente de uvicorn em tasks_dir
            u_log_tail = "Servidor Uvicorn ativo na porta 8765."
            u_log_size = 0
            if tasks_dir.exists():
                logs = sorted(tasks_dir.glob("task-*.log"), key=lambda x: x.stat().st_mtime, reverse=True)
                for l in logs:
                    try:
                        with open(l, "r", encoding="utf-8", errors="replace") as f:
                            snippet = f.read(2048)
                            if "Uvicorn running" in snippet or "Started server process" in snippet:
                                f.seek(0)
                                u_log_lines = f.readlines()
                                u_log_tail = "".join(u_log_lines[-60:])
                                u_log_size = l.stat().st_size
                                break
                    except Exception:
                        pass

            result.append({
                "task_id": "uvicorn-server",
                "full_id": f"{conversation_id}/uvicorn-server",
                "name": "Servidor Uvicorn (FastAPI Python)",
                "description": os_uvicorn_cmd or "python -m uvicorn server.main:app --host 0.0.0.0 --port 8765",
                "created_at": datetime.datetime.now().isoformat(),
                "status": "running",
                "is_daemon": True,
                "tool_name": "uvicorn",
                "pid": os_uvicorn_pid,
                "port": 8765,
                "memory_mb": os_uvicorn_mem,
                "log_size": u_log_size,
                "log_tail": u_log_tail
            })

        # Se o tunel Cloudflare estiver ativo no SO
        if os_cloudflared_pid:
            result.append({
                "task_id": "cloudflare-tunnel",
                "full_id": f"{conversation_id}/cloudflare-tunnel",
                "name": "Tunel Cloudflare (Acesso Remoto)",
                "description": "cloudflared tunnel --url http://127.0.0.1:8765",
                "created_at": datetime.datetime.now().isoformat(),
                "status": "running",
                "is_daemon": True,
                "tool_name": "cloudflared",
                "pid": os_cloudflared_pid,
                "port": None,
                "memory_mb": None,
                "log_size": 0,
                "log_tail": "Tunel seguro Cloudflare ativo conectando o aplicativo ao computador."
            })

        return result

    def stop_background_task(self, conversation_id: str, task_id: str) -> bool:
        """Encerra um processo em segundo plano de forma segura e eficaz."""
        try:
            stopped = False
            for p in psutil.process_iter(['pid', 'name']):
                try:
                    cmd_list = p.cmdline() if p.is_running() else []
                    cmd_str = ' '.join(cmd_list).lower()
                    if task_id in cmd_str or (task_id.startswith("task-") and "uvicorn" in cmd_str) or ("server.main:app" in cmd_str and "8765" in cmd_str):
                        p.terminate()
                        stopped = True
                    elif task_id in ("cloudflared", "cloudflare-tunnel") and "cloudflared" in p.name().lower():
                        p.terminate()
                        stopped = True
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            if not stopped:
                subprocess.run(
                    ["powershell", "-Command", f"Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -like '*{task_id}*' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }}"],
                    timeout=5
                )
            return True
        except Exception as e:
            print(f"Erro ao parar tarefa {task_id}: {e}")
            return False

    def get_token_usage_stats(self, conversation_id: str) -> Dict[str, Any]:
        """Calcula métricas detalhadas de consumo de tokens (input, cache, output, janela)."""
        brain_dir = self.paths.BRAIN_DIR / conversation_id
        transcript_file = brain_dir / ".system_generated" / "logs" / "transcript.jsonl"
        
        latest_input = 0
        latest_cache = 0
        latest_output = 0
        total_output_sum = 0
        steps_count = 0
        model_name = "Gemini 3.8 Flash High"

        if transcript_file.exists():
            try:
                with open(transcript_file, "r", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        if not line.strip():
                            continue
                        try:
                            d = json.loads(line)
                            steps_count += 1
                            if "input_tokens" in d:
                                latest_input = d.get("input_tokens", 0)
                                latest_cache = d.get("cache_read_tokens", 0)
                                out = d.get("output_tokens", 0)
                                latest_output = out
                                total_output_sum += out
                            if "model" in d:
                                model_name = d.get("model")
                        except Exception:
                            continue
            except Exception as e:
                print(f"Erro ao ler transcript para tokens: {e}")

        context_window = 1048576  # 1M tokens context window
        current_context = latest_input + latest_cache
        pct = round((current_context / context_window) * 100, 2) if context_window > 0 else 0.0
        cache_savings = round((latest_cache / current_context * 100), 1) if current_context > 0 else 0.0

        return {
            "conversation_id": conversation_id,
            "steps_count": steps_count,
            "current_context_tokens": current_context,
            "context_window_size": context_window,
            "context_percent_used": pct,
            "latest_input_tokens": latest_input,
            "latest_cache_read_tokens": latest_cache,
            "latest_output_tokens": latest_output,
            "total_output_tokens": total_output_sum,
            "cache_savings_percent": cache_savings,
            "active_model": model_name
        }

    def list_installed_skills(self) -> List[Dict[str, Any]]:
        """Descobre todas as skills instaladas no computador (builtin, plugins, custom e community em ~/.agents/skills) com cache."""
        now = time.time()
        if self._skills_cache is not None and (now - self._skills_cache_time) < 60.0:
            return self._skills_cache

        skills: List[Dict[str, Any]] = []
        search_dirs = [
            (self.paths.ANTIGRAVITY_DIR / "builtin" / "skills", "Antigravity"),
            (self.paths.ANTIGRAVITY_DIR / "skills", "Antigravity Custom"),
            (self.paths.CONFIG_DIR / "plugins" / "chrome-devtools-plugin" / "skills", "Chrome DevTools"),
            (self.paths.CONFIG_DIR / "plugins" / "firebase" / "skills", "Firebase"),
            (self.paths.CONFIG_DIR / "plugins" / "gemini-api" / "skills", "Gemini AI"),
            (Path.home() / ".agents" / "skills", "Community"),
            (Path.home() / ".agent" / "skills", "Community"),
        ]

        plugins_root = self.paths.CONFIG_DIR / "plugins"
        if plugins_root.exists():
            for plugin_dir in plugins_root.iterdir():
                if plugin_dir.is_dir() and plugin_dir.name not in ["chrome-devtools-plugin", "firebase", "gemini-api"]:
                    sk_dir = plugin_dir / "skills"
                    if sk_dir.exists():
                        search_dirs.append((sk_dir, plugin_dir.name.replace("-", " ").title()))

        def categorize(name: str, base_cat: str) -> str:
            if base_cat != "Community":
                return base_cat
            n = name.lower()
            if any(k in n for k in ["ai", "claude", "gemini", "gpt", "agent", "llm", "prompt", "reasoning", "orchestrat"]):
                return "Agentes & IA"
            if any(k in n for k in ["test", "qa", "jest", "pytest", "cypress", "playwright", "audit", "security", "exploit", "pentest"]):
                return "Testes & Segurança"
            if any(k in n for k in ["code", "dev", "react", "vue", "backend", "frontend", "typescript", "python", "node", "api", "clean-code", "refactor"]):
                return "Desenvolvimento"
            if any(k in n for k in ["cloud", "aws", "azure", "docker", "k8s", "linux", "windows", "devops", "deploy"]):
                return "DevOps & Cloud"
            if any(k in n for k in ["design", "ui", "ux", "css", "tailwind", "figma", "theme"]):
                return "Design & UI"
            if any(k in n for k in ["seo", "marketing", "youtube", "article", "copy", "blog", "social"]):
                return "Marketing & Conteúdo"
            return "Comunidade"

        seen_names = set()
        for base_dir, default_cat in search_dirs:
            if not base_dir.exists():
                continue
            for skill_path in base_dir.iterdir():
                if not skill_path.is_dir():
                    continue
                skill_md = skill_path / "SKILL.md"
                if not skill_md.exists():
                    continue
                
                folder_name = skill_path.name
                if folder_name in seen_names:
                    continue
                seen_names.add(folder_name)

                desc = ""
                display_name = folder_name
                try:
                    with open(skill_md, "r", encoding="utf-8", errors="replace") as f:
                        header = f.read(1500)
                        m_desc = re.search(r"description:\s*([^\n\r]+)", header)
                        if m_desc:
                            desc = m_desc.group(1).strip().strip('"\'')
                        m_name = re.search(r"^name:\s*([^\n\r]+)", header, re.MULTILINE)
                        if m_name:
                            display_name = m_name.group(1).strip().strip('"\'')
                except Exception:
                    pass

                cat = categorize(display_name, default_cat)
                skills.append({
                    "name": display_name,
                    "folder_name": folder_name,
                    "description": desc or f"Habilidade {display_name} para o assistente Antigravity.",
                    "category": cat,
                    "path": str(skill_md.resolve())
                })

        skills.sort(key=lambda s: (s["category"], s["name"]))
        self._skills_cache = skills
        self._skills_cache_time = now
        return skills

    def get_skill_details(self, skill_name: str) -> Optional[Dict[str, Any]]:
        """Retorna o conteúdo completo de um SKILL.md."""
        all_skills = self.list_installed_skills()
        for s in all_skills:
            if s["name"].lower() == skill_name.lower() or s["folder_name"].lower() == skill_name.lower():
                p = Path(s["path"])
                if p.exists():
                    with open(p, "r", encoding="utf-8", errors="replace") as f:
                        return {
                            **s,
                            "content": f.read()
                        }
        return None

    async def stop_conversation(self, conversation_id: str) -> bool:
        """Para a geração/execução atual no Antigravity desktop via CDP."""
        from .cdp_controller import cdp_controller
        return await cdp_controller.stop_execution(conversation_id)

    async def get_models(self) -> Dict[str, Any]:
        """Obtém modelos disponíveis e modelo atual do Antigravity desktop via CDP."""
        from .cdp_controller import cdp_controller
        return await cdp_controller.get_models()

    async def set_model(self, model_name: str) -> bool:
        """Altera o modelo ativo no Antigravity desktop via CDP."""
        from .cdp_controller import cdp_controller
        return await cdp_controller.set_model(model_name)

    def get_contextual_suggestions(self, conversation_id: str, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Gera chips de ações inteligentes contextuais baseadas em artefatos, skills e projeto."""
        suggestions = []
        
        # 1. Se houver plano aguardando aprovação
        artifacts = self.list_artifacts(conversation_id)
        has_pending_plan = any(a.get("request_feedback") for a in artifacts)
        if has_pending_plan:
            suggestions.append({
                "id": "proceed",
                "title": "⚡ Proceed (Executar Plano)",
                "prompt": "Proceed",
                "type": "instant_execute",
                "highlight": True,
                "icon": "play"
            })

        # 2. Sugestões de desenvolvimento para React Native / Expo e Antigravity
        suggestions.extend([
            {
                "id": "apk_build",
                "title": "🚀 Gerar APK Android",
                "prompt": "cd mobile; npx expo export --platform android",
                "type": "fill_input",
                "icon": "smartphone"
            },
            {
                "id": "ts_check",
                "title": "🧪 Testar Tipos TS",
                "prompt": "cd mobile; npx tsc --noEmit",
                "type": "fill_input",
                "icon": "check-circle"
            },
            {
                "id": "a11y_audit",
                "title": "🔍 Auditar Acessibilidade",
                "prompt": "Use a skill a11y-debugging para auditar a acessibilidade das telas mobile",
                "type": "fill_input",
                "icon": "eye"
            },
            {
                "id": "lcp_perf",
                "title": "⚡ Otimizar Performance",
                "prompt": "Use a skill debug-optimize-lcp para analisar o carregamento e renderização",
                "type": "fill_input",
                "icon": "zap"
            },
            {
                "id": "compact_history",
                "title": "🧹 Compactar Contexto",
                "prompt": "/compact",
                "type": "instant_execute",
                "icon": "archive"
            },
            {
                "id": "goal_mode",
                "title": "🎯 Modo Objetivo (/goal)",
                "prompt": "/goal ",
                "type": "fill_input",
                "icon": "target"
            }
        ])
        return suggestions
