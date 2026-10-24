import os
import sys
import re
import io
import time
import shutil
import urllib.request
import subprocess
import threading
import qrcode
from pathlib import Path
from typing import Optional, Callable

class TunnelManager:
    def __init__(self, local_port: int = 8765):
        self.local_port = local_port
        self.process: Optional[subprocess.Popen] = None
        self.public_url: Optional[str] = None
        self.bin_dir = Path(__file__).resolve().parent / "bin"
        self.cloudflared_path = self._resolve_cloudflared()

    def _resolve_cloudflared(self) -> Path:
        """Localiza ou prepara o executável cloudflared."""
        # 1. Verificar no PATH
        system_bin = shutil.which("cloudflared")
        if system_bin:
            return Path(system_bin)

        # 2. Verificar na pasta local bin/
        local_bin = self.bin_dir / "cloudflared.exe"
        return local_bin

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

    def start_tunnel(self, on_url_ready: Optional[Callable[[str], None]] = None) -> Optional[str]:
        """Inicia o túnel Cloudflare e extrai a URL pública https://*.trycloudflare.com."""
        url_file = Path(__file__).resolve().parent / "last_tunnel_url.txt"
        
        # 1. Verificar se já existe um túnel ativo reutilizável
        if url_file.exists():
            try:
                saved = url_file.read_text().strip()
                if saved.startswith("https://") and "trycloudflare.com" in saved:
                    self.public_url = saved
                    print(f"\n[Tunnel] Reutilizando túnel ativo: {self.public_url}\n")
                    if on_url_ready:
                        on_url_ready(self.public_url)
                    return self.public_url
            except Exception:
                pass

        if not self.ensure_cloudflared_installed():
            print("[Tunnel] Não foi possível obter o cloudflared. Iniciando apenas em modo rede local.")
            return None

        cmd = [
            str(self.cloudflared_path),
            "tunnel",
            "--url",
            f"http://127.0.0.1:{self.local_port}",
            "--no-autoupdate"
        ]

        print(f"[Tunnel] Iniciando túnel para porta {self.local_port}...")
        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        )

        url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
        
        def monitor_output():
            for line in self.process.stdout:
                match = url_pattern.search(line)
                if match and not self.public_url:
                    self.public_url = match.group(0)
                    try:
                        url_file.write_text(self.public_url)
                    except Exception:
                        pass
                    print(f"\n=======================================================")
                    print(f"🚀 TÚNEL REMOTO ATIVO: {self.public_url}")
                    print(f"=======================================================\n")
                    if on_url_ready:
                        on_url_ready(self.public_url)

        thread = threading.Thread(target=monitor_output, daemon=True)
        thread.start()

        # Aguardar até 20 segundos pela URL
        start_time = time.time()
        while not self.public_url and time.time() - start_time < 20:
            time.sleep(0.5)

        return self.public_url

    def print_pairing_qr(self, api_key: str):
        """Imprime o QR Code de pareamento no terminal para escanear com o celular."""
        import socket
        hostname = socket.gethostname()
        local_ip = "127.0.0.1"
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except Exception:
            pass

        pairing_data = {
            "v": 1,
            "name": f"Antigravity PC ({hostname})",
            "remote_url": self.public_url or f"http://{local_ip}:{self.local_port}",
            "local_url": f"http://{local_ip}:{self.local_port}",
            "api_key": api_key
        }
        
        import json
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
            # Imprime QR code no terminal
            f = io.StringIO()
            qr.print_ascii(out=f, invert=True)
            print(f.getvalue())
        except Exception:
            pass
        
        print(f"URL Remota: {pairing_data['remote_url']}")
        print(f"URL Local:  {pairing_data['local_url']}")
        print(f"API Token:  {api_key}")
        print("="*50 + "\n")

    def stop_tunnel(self):
        """Finaliza o processo do túnel."""
        if self.process:
            self.process.terminate()
            self.process = None
            self.public_url = None
            print("[Tunnel] Túnel Cloudflare encerrado.")
