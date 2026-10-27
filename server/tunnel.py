import os
import sys
import re
import io
import time
import json
import socket
import shutil
import hashlib
import urllib.request
import urllib.error
import subprocess
import threading
import qrcode
from pathlib import Path
from typing import Optional, Callable
import psutil

class TunnelManager:
    def __init__(self, local_port: int = 8765):
        self.local_port = local_port
        self.process: Optional[subprocess.Popen] = None
        self.public_url: Optional[str] = None
        self.api_key: Optional[str] = None
        self.bridge_id: Optional[str] = None
        self.bin_dir = Path(__file__).resolve().parent / "bin"
        self.cloudflared_path = self._resolve_cloudflared()
        self.url_file = Path(__file__).resolve().parent / "last_tunnel_url.txt"
        self.log_file = Path(__file__).resolve().parent / "cloudflared.log"
        self.should_stop = False
        self.consecutive_health_failures = 0
        self.watchdog_thread: Optional[threading.Thread] = None

    def _resolve_cloudflared(self) -> Path:
        """Localiza ou prepara o executável cloudflared."""
        system_bin = shutil.which("cloudflared")
        if system_bin:
            return Path(system_bin)
        local_bin = self.bin_dir / "cloudflared.exe"
        return local_bin

    def kill_existing_cloudflared(self, exclude_pid: Optional[int] = None):
        """Finaliza processos cloudflared órfãos para evitar conflitos de túnel."""
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                name = proc.info.get('name') or ''
                pid = proc.info.get('pid')
                if 'cloudflared' in name.lower() and pid != exclude_pid:
                    proc.kill()
            except Exception:
                pass

    def ensure_cloudflared_installed(self, on_progress: Optional[Callable[[str], None]] = None) -> bool:
        """Garante que o executável do cloudflared esteja baixado e disponível."""
        if self.cloudflared_path.exists():
            return True

        self.bin_dir.mkdir(parents=True, exist_ok=True)
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        target = self.bin_dir / "cloudflared.exe"
        
        msg = "Baixando Cloudflare Tunnel (cloudflared.exe) para acesso remoto seguro..."
        if on_progress:
            on_progress(msg)
        else:
            print(f"[Tunnel] {msg}")

        try:
            urllib.request.urlretrieve(url, target)
            print(f"[Tunnel] Download concluído com sucesso em {target}")
            self.cloudflared_path = target
            return True
        except Exception as e:
            print(f"[Tunnel] Erro ao baixar cloudflared: {e}")
            return False

    def get_local_ip(self) -> str:
        """Retorna o IP da rede local da máquina (ex: 192.168.x.x)."""
        local_ip = "127.0.0.1"
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except Exception:
            pass
        return local_ip

    def _is_url_alive(self, url: str, timeout: int = 8) -> bool:
        """Verifica se a URL remota responde e está associada a um host ativo."""
        try:
            req = urllib.request.Request(
                f"{url.rstrip('/')}/api/status",
                headers={"User-Agent": "AntigravityTunnelCheck/1.0"}
            )
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.status in (200, 401, 403, 404)
        except Exception:
            return False

    def _is_cloudflared_running(self) -> bool:
        """Verifica se há algum processo cloudflared em execução no sistema."""
        try:
            for proc in psutil.process_iter(['name']):
                name = proc.info.get('name')
                if name and 'cloudflared' in name.lower():
                    return True
        except Exception:
            pass
        return False

    def publish_rendezvous(self):
        """Publica o endereço ativo na ponte em nuvem (ntfy.sh) para reconexão sem QR Code."""
        if not self.bridge_id or not self.public_url:
            return

        now = time.time()
        # Previne spam e bloqueio HTTP 429: só publica se a URL mudou ou após 10 minutos
        if getattr(self, "_last_published_url", None) == self.public_url:
            if now - getattr(self, "_last_published_time", 0) < 600:
                return

        self._last_published_url = self.public_url
        self._last_published_time = now

        payload = json.dumps({
            "bridge_id": self.bridge_id,
            "remote_url": self.public_url,
            "local_url": f"http://{self.get_local_ip()}:{self.local_port}",
            "hostname": socket.gethostname(),
            "timestamp": int(now),
            "status": "online",
            "version": "1.0.22"
        }).encode("utf-8")

        topic = f"agbridge_{self.bridge_id}"
        endpoint = f"https://ntfy.sh/{topic}"

        try:
            req = urllib.request.Request(
                endpoint,
                data=payload,
                headers={
                    "Title": "Antigravity Bridge Heartbeat",
                    "Tags": "computer,satellite"
                }
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    pass
        except Exception:
            pass

    def start_tunnel(self, api_key: Optional[str] = None, on_url_ready: Optional[Callable[[str], None]] = None) -> Optional[str]:
        """Inicia o túnel Cloudflare e extrai a URL pública https://*.trycloudflare.com."""
        self.should_stop = False
        self.consecutive_health_failures = 0
        if api_key:
            self.api_key = api_key
            self.bridge_id = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:24]

        # 1. Verificar se já existe um túnel REALMENTE ativo e respondendo
        if self.url_file.exists():
            try:
                saved = self.url_file.read_text().strip()
                if saved.startswith("https://") and "trycloudflare.com" in saved:
                    if self._is_cloudflared_running():
                        self.public_url = saved
                        print(f"\n[Tunnel] Reutilizando túnel ativo em execução: {self.public_url}\n")
                        self.publish_rendezvous()
                        self._start_watchdog()
                        if on_url_ready:
                            on_url_ready(self.public_url)
                        return self.public_url
                    else:
                        print(f"[Tunnel] Túnel anterior ({saved}) não está ativo no sistema. Renovando...")
                        self.kill_existing_cloudflared()
            except Exception:
                pass

        if not self.ensure_cloudflared_installed():
            print("[Tunnel] Não foi possível obter o cloudflared. Iniciando apenas em modo rede local.")
            return None

        self._spawn_process(on_url_ready)
        self._start_watchdog()
        return self.public_url

    def _spawn_process(self, on_url_ready: Optional[Callable[[str], None]] = None):
        """Inicia o executável do cloudflared com log em arquivo e extrai a URL gerada."""
        self.should_stop = False
        self.consecutive_health_failures = 0
        self.kill_existing_cloudflared()

        # Limpar arquivo de log anterior do túnel
        try:
            if self.log_file.exists():
                self.log_file.unlink(missing_ok=True)
        except Exception:
            pass

        cmd = [
            str(self.cloudflared_path),
            "tunnel",
            "--url",
            f"http://127.0.0.1:{self.local_port}",
            "--protocol",
            "http2",
            "--no-autoupdate",
            "--logfile",
            str(self.log_file)
        ]

        print(f"[Tunnel] Iniciando novo túnel Cloudflare para porta {self.local_port}...")
        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        )

        url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
        self.public_url = None

        def monitor_logfile():
            start_t = time.time()
            while not self.should_stop and not self.public_url and (time.time() - start_t < 35):
                if self.log_file.exists():
                    try:
                        content = self.log_file.read_text(encoding="utf-8", errors="ignore")
                        match = url_pattern.search(content)
                        if match and not self.public_url:
                            self.public_url = match.group(0)
                            try:
                                self.url_file.write_text(self.public_url, encoding="utf-8")
                            except Exception:
                                pass
                            print(f"\n=======================================================")
                            print(f"🚀 TÚNEL REMOTO ATIVO: {self.public_url}")
                            print(f"=======================================================\n")
                            self.publish_rendezvous()
                            if on_url_ready:
                                on_url_ready(self.public_url)
                            break
                    except Exception:
                        pass
                if self.process and self.process.poll() is not None:
                    print(f"[Tunnel] cloudflared.exe encerrou com código {self.process.returncode}")
                    break
                time.sleep(0.3)

        thread = threading.Thread(target=monitor_logfile, daemon=True)
        thread.start()

        # Aguardar até 25 segundos pela extração da URL
        start_wait = time.time()
        while not self.public_url and time.time() - start_wait < 25:
            if self.process.poll() is not None:
                break
            time.sleep(0.5)

    def _start_watchdog(self):
        """Inicia o watchdog em background para manter a ponte ativa 24/7."""
        if self.watchdog_thread and self.watchdog_thread.is_alive():
            return

        def watchdog_loop():
            while not self.should_stop:
                time.sleep(20)
                if self.should_stop:
                    break

                # 1. Verificar se o processo cloudflared encerrou
                if not self.process or self.process.poll() is not None:
                    print("[Watchdog] Processo cloudflared encerrou inesperadamente. Reiniciando túnel...")
                    self._spawn_process()

                # 2. Publicar heartbeat periódico na nuvem para manter o tópico ntfy sempre atualizado
                if self.public_url:
                    self.publish_rendezvous()

        self.watchdog_thread = threading.Thread(target=watchdog_loop, daemon=True)
        self.watchdog_thread.start()

    def print_pairing_qr(self, api_key: str):
        """Imprime o QR Code de pareamento no terminal para escanear com o celular."""
        hostname = socket.gethostname()
        local_ip = self.get_local_ip()
        bridge_id = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:24]

        pairing_data = {
            "v": 2,
            "name": f"Antigravity PC ({hostname})",
            "remote_url": self.public_url or f"http://{local_ip}:{self.local_port}",
            "local_url": f"http://{local_ip}:{self.local_port}",
            "api_key": api_key,
            "bridge_id": bridge_id
        }
        
        payload = json.dumps(pairing_data)

        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=1,
            border=2,
        )
        qr.add_data(payload)
        qr.make(fit=True)

        print("\n" + "="*50)
        print("📱 ESCANEIE NO APLICATIVO DO CELULAR PARA PAREAR:")
        print("="*50)
        try:
            f = io.StringIO()
            qr.print_ascii(out=f, invert=True)
            print(f.getvalue())
        except Exception:
            pass
        
        print(f"URL Remota:  {pairing_data['remote_url']}")
        print(f"URL Local:   {pairing_data['local_url']}")
        print(f"Ponte ID:    {bridge_id}")
        print(f"API Token:   {api_key}")
        print("="*50 + "\n")

    def stop_tunnel(self):
        """Finaliza o processo do túnel."""
        self.should_stop = True
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None
        self.kill_existing_cloudflared()
        print("[Tunnel] Túnel Cloudflare encerrado.")

