import os
import sys
import time
import socket
import psutil
import subprocess
from pathlib import Path

# Garantir UTF-8 na saída do console do Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

REPO_ROOT = Path(__file__).resolve().parent.parent
STARTUP_DIR = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
VBS_PATH = REPO_ROOT / "server" / "start_background.vbs"
TASK_NAME = "AntigravityRemoteBridge"

def get_python_exe() -> str:
    """Retorna o caminho completo do executável python.exe."""
    py = Path(sys.executable)
    if py.name.lower() == "pythonw.exe":
        normal_py = py.parent / "python.exe"
        if normal_py.exists():
            return str(normal_py)
    return str(py)

def create_vbs_script():
    """Gera o script VBS para inicialização 100% invisível sem janelas de terminal."""
    python_exe = get_python_exe()
    run_daemon_path = REPO_ROOT / "server" / "run_daemon.py"
    content = f'''Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "{REPO_ROOT}"
WshShell.Run """{python_exe}"" ""{run_daemon_path}""", 0, False
'''
    VBS_PATH.write_text(content, encoding="utf-8")
    return VBS_PATH

def is_port_in_use(port: int = 8765) -> bool:
    """Verifica se a porta do servidor está em escuta."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex(('127.0.0.1', port)) == 0

def get_server_process():
    """Encontra o processo do servidor Antigravity."""
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline = proc.info.get('cmdline') or []
            cmd_str = ' '.join(cmdline).lower()
            if 'server.main:app' in cmd_str or 'run_daemon.py' in cmd_str:
                return proc
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return None

def start_daemon():
    """Inicia o servidor em segundo plano de forma silenciosa e persistente."""
    if is_port_in_use(8765):
        proc = get_server_process()
        print(f"[OK] O servidor já está rodando em segundo plano (Porta 8765, PID {proc.pid if proc else 'N/A'}).")
        return True

    python_exe = get_python_exe()
    run_daemon_path = str(REPO_ROOT / "server" / "run_daemon.py")
    
    print("[Iniciando] Executando Antigravity Remote Bridge em segundo plano...")
    try:
        # Usar WMI Win32_Process.Create para garantir desacoplamento total da sessão do terminal
        cmd = f'cmd.exe /c "cd /d {REPO_ROOT} && ""{python_exe}"" ""{run_daemon_path}"""'
        ps_cmd = f"Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{{CommandLine = '{cmd}'}}"
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        # Fallback para Popen com flags detached
        DETACHED = 0x00000008 | 0x00000200 | 0x08000000
        subprocess.Popen(
            [python_exe, run_daemon_path],
            cwd=str(REPO_ROOT),
            creationflags=DETACHED,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

    # Aguardar até 8 segundos para a porta abrir
    start_time = time.time()
    while time.time() - start_time < 8:
        if is_port_in_use(8765):
            proc = get_server_process()
            print(f"[Sucesso] Servidor iniciado silenciosamente em segundo plano (PID {proc.pid if proc else 'ativo'})!")
            return True
        time.sleep(0.5)

    print("[Aviso] O comando foi disparado. Verifique o status com 'python server/service_manager.py status'.")
    return False

def stop_daemon():
    """Finaliza o servidor e os túneis associados."""
    killed = 0
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            name = (proc.info.get('name') or '').lower()
            cmdline = ' '.join(proc.info.get('cmdline') or []).lower()
            if 'server.main' in cmdline or 'run_daemon.py' in cmdline or ('cloudflared' in name and ':8765' in cmdline):
                proc.kill()
                killed += 1
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    if killed > 0:
        print(f"[OK] {killed} processo(s) do servidor e túnel foram finalizados.")
    else:
        print("[Info] Nenhum processo ativo encontrado para finalizar.")

def check_status():
    """Exibe o estado detalhado do serviço e o endereço da ponte em nuvem."""
    in_use = is_port_in_use(8765)
    proc = get_server_process()
    
    url_file = REPO_ROOT / "server" / "last_tunnel_url.txt"
    tunnel_url = url_file.read_text().strip() if url_file.exists() else "Não disponível"
    
    auth_file = REPO_ROOT / "server" / "server_auth.json"
    api_key = "N/A"
    bridge_id = "N/A"
    if auth_file.exists():
        import json, hashlib
        try:
            data = json.loads(auth_file.read_text(encoding="utf-8"))
            api_key = data.get("api_key", "N/A")
            bridge_id = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:24]
        except Exception:
            pass

    print("\n" + "="*50)
    print("STATUS DO ANTIGRAVITY REMOTE BRIDGE")
    print("="*50)
    print(f"Estado Local:       {'[ONLINE] RODANDO (Porta 8765)' if in_use else '[PARADO] Servidor desligado'}")
    if proc:
        try:
            mem = proc.memory_info().rss / (1024 * 1024)
            print(f"Processo Python:    PID {proc.pid} ({mem:.1f} MB RAM)")
        except Exception:
            pass
    print(f"URL do Tunel:       {tunnel_url}")
    print(f"Ponte Nuvem ID:     {bridge_id}")
    print(f"Topico Rendezvous:  https://ntfy.sh/agbridge_{bridge_id}")
    
    # Verificar Startup
    startup_vbs = STARTUP_DIR / "AntigravityRemoteBridge.vbs"
    startup_active = startup_vbs.exists()
    print(f"Auto-inicio Windows: {'[ATIVADO] Inicializa automaticamente com o PC' if startup_active else '[DESATIVADO]'}")
    print("="*50 + "\n")

def install_startup():
    """Configura o servidor para iniciar automaticamente em segundo plano ao ligar o computador."""
    create_vbs_script()
    
    # 1. Copiar para a pasta Inicializar (Startup) do Windows
    if STARTUP_DIR.exists():
        startup_vbs = STARTUP_DIR / "AntigravityRemoteBridge.vbs"
        startup_vbs.write_text(VBS_PATH.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"[OK] Atalho silencioso instalado na pasta Inicializar do Windows:\n     {startup_vbs}")

    # 2. Registrar no Agendador de Tarefas do Windows (Task Scheduler)
    try:
        wscript = "wscript.exe"
        cmd = [
            "schtasks", "/create",
            "/tn", TASK_NAME,
            "/tr", f'"{wscript}" "{VBS_PATH}"',
            "/sc", "onlogon",
            "/f"
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode == 0:
            print("[OK] Tarefa agendada do Windows registrada com sucesso (executa no logon).")
        else:
            print(f"[Info] Registro de tarefa agendada: {res.stdout.strip() or res.stderr.strip()}")
    except Exception as e:
        print(f"[Aviso] Não foi possível registrar tarefa no schtasks: {e}")

    # 3. Iniciar o servidor imediatamente
    start_daemon()
    print("\n[SUCESSO] Antigravity Remote Bridge configurado com sucesso para iniciar sempre com o Windows!")

def uninstall_startup():
    """Remove a inicialização automática do Windows."""
    startup_vbs = STARTUP_DIR / "AntigravityRemoteBridge.vbs"
    if startup_vbs.exists():
        startup_vbs.unlink(missing_ok=True)
        print("[OK] Atalho removido da pasta Inicializar do Windows.")

    try:
        subprocess.run(["schtasks", "/delete", "/tn", TASK_NAME, "/f"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("[OK] Tarefa agendada do Windows removida.")
    except Exception:
        pass

    stop_daemon()
    print("Serviço desinstalado.")

if __name__ == "__main__":
    action = sys.argv[1].lower() if len(sys.argv) > 1 else "status"
    if action == "install":
        install_startup()
    elif action == "uninstall":
        uninstall_startup()
    elif action == "start":
        start_daemon()
    elif action == "stop":
        stop_daemon()
    elif action == "status":
        check_status()
    elif action == "restart":
        stop_daemon()
        time.sleep(1)
        start_daemon()
    else:
        print("Uso: python server/service_manager.py [install | uninstall | start | stop | status | restart]")
