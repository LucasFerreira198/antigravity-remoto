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
                
                is_req_feedback = bool(
                    meta_info.get("RequestFeedback", meta_info.get("requestFeedback", False))
                    or ("plan" in item.name.lower())
                )
                artifacts.append({
                    "name": item.name,
                    "size": item.stat().st_size,
                    "modified_at": datetime.datetime.fromtimestamp(item.stat().st_mtime).isoformat(),
                    "summary": meta_info.get("Summary", meta_info.get("summary", "")),
                    "user_facing": meta_info.get("UserFacing", meta_info.get("userFacing", True)),
                    "is_markdown": item.suffix.lower() in [".md", ".markdown", ".txt"],
                    "is_image": item.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp", ".svg"],
                    "request_feedback": is_req_feedback
                })
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
        """Descobre tarefas executadas em segundo plano e monitora status/logs."""
        brain_dir = self.paths.BRAIN_DIR / conversation_id
        tasks_dir = brain_dir / ".system_generated" / "tasks"
        transcript_file = brain_dir / ".system_generated" / "logs" / "transcript.jsonl"
        
        tasks: Dict[str, Dict[str, Any]] = {}
        
        # 1. Parse do transcript para mapear descrições e comandos
        if transcript_file.exists():
            try:
                with open(transcript_file, "r", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        if not line.strip():
                            continue
                        try:
                            d = json.loads(line)
                            content = d.get("content", "")
                            if "Tool is running as a background task with task id:" in content:
                                m = re.search(r"task id:\s*([^\r\n]+)", content)
                                desc = re.search(r"Task Description:\s*([^\r\n]+)", content)
                                if m:
                                    tid = m.group(1).split("\n")[0].split("\r")[0].strip()
                                    simple_id = tid.split("/")[-1].split("\\")[-1]
                                    clean_desc = desc.group(1).split("\n")[0].split("\r")[0].strip() if desc else "Comando em segundo plano"
                                    tasks[simple_id] = {
                                        "task_id": simple_id,
                                        "full_id": tid,
                                        "description": clean_desc,
                                        "created_at": d.get("created_at"),
                                        "status": "running",
                                        "is_daemon": "IsDaemon" in content or "uvicorn" in content or "server" in content,
                                        "tool_name": "run_command"
                                    }
                            elif "finished with result:" in content:
                                m = re.search(r"sender=([^\s\r\n]+)", content)
                                if m:
                                    tid = m.group(1).split("\n")[0].split("\r")[0].strip().split("/")[-1].split("\\")[-1]
                                    if tid in tasks:
                                        tasks[tid]["status"] = "completed"
                        except Exception:
                            continue
            except Exception as e:
                print(f"Erro ao ler transcript para tarefas: {e}")

        # 2. Ler arquivos de logs em tasks_dir para atualizar tarefas ou encontrar logs
        if tasks_dir.exists():
            for lf in tasks_dir.glob("task-*.log"):
                simple_id = lf.stem
                if simple_id not in tasks:
                    tasks[simple_id] = {
                        "task_id": simple_id,
                        "full_id": f"{conversation_id}/{simple_id}",
                        "description": f"Tarefa {simple_id}",
                        "created_at": datetime.datetime.fromtimestamp(lf.stat().st_ctime).isoformat(),
                        "status": "completed",
                        "is_daemon": False,
                        "tool_name": "background_task"
                    }
                
                try:
                    log_size = lf.stat().st_size
                    tasks[simple_id]["log_size"] = log_size
                    if log_size > 0:
                        with open(lf, "r", encoding="utf-8", errors="replace") as lg:
                            lines = lg.readlines()
                            tasks[simple_id]["log_tail"] = "".join(lines[-40:])
                    else:
                        tasks[simple_id]["log_tail"] = "(Aguardando saída de log...)"
                except Exception:
                    tasks[simple_id]["log_tail"] = ""

        task_list = list(tasks.values())
        task_list.sort(key=lambda t: (0 if t.get("status") == "running" else 1, t.get("task_id", "")), reverse=False)
        return task_list

    def stop_background_task(self, conversation_id: str, task_id: str) -> bool:
        """Encerra um processo em segundo plano."""
        try:
            subprocess.run(["powershell", "-Command", f"Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -like '*{task_id}*' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }}"], timeout=5)
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
        """Descobre todas as skills instaladas no computador com categorias e descrições."""
        skills: List[Dict[str, Any]] = []
        
        search_dirs = [
            (self.paths.ANTIGRAVITY_DIR / "builtin" / "skills", "Antigravity"),
            (self.paths.CONFIG_DIR / "plugins" / "chrome-devtools-plugin" / "skills", "Chrome DevTools"),
            (self.paths.CONFIG_DIR / "plugins" / "firebase" / "skills", "Firebase"),
            (self.paths.CONFIG_DIR / "plugins" / "gemini-api" / "skills", "Gemini AI"),
        ]

        plugins_root = self.paths.CONFIG_DIR / "plugins"
        if plugins_root.exists():
            for plugin_dir in plugins_root.iterdir():
                if plugin_dir.is_dir() and plugin_dir.name not in ["chrome-devtools-plugin", "firebase", "gemini-api"]:
                    sk_dir = plugin_dir / "skills"
                    if sk_dir.exists():
                        search_dirs.append((sk_dir, plugin_dir.name.replace("-", " ").title()))

        seen_names = set()
        for base_dir, category in search_dirs:
            if not base_dir.exists():
                continue
            for skill_path in base_dir.iterdir():
                if not skill_path.is_dir():
                    continue
                skill_md = skill_path / "SKILL.md"
                if not skill_md.exists():
                    continue
                
                skill_name = skill_path.name
                if skill_name in seen_names:
                    continue
                seen_names.add(skill_name)

                desc = ""
                try:
                    with open(skill_md, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read(2048)
                        m = re.search(r"description:\s*([^\n\r]+)", content)
                        if m:
                            desc = m.group(1).strip()
                        name_m = re.search(r"^name:\s*([^\n\r]+)", content, re.MULTILINE)
                        if name_m:
                            skill_name = name_m.group(1).strip()
                except Exception:
                    pass

                skills.append({
                    "name": skill_name,
                    "folder_name": skill_path.name,
                    "description": desc or f"Habilidade {skill_name} para o assistente Antigravity.",
                    "category": category,
                    "path": str(skill_md.resolve())
                })

        skills.sort(key=lambda s: (s["category"], s["name"]))
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
