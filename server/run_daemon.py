import os
import sys
import asyncio
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

LOG_FILE = ROOT_DIR / "server" / "bridge_daemon.log"
try:
    log_fp = open(LOG_FILE, "a", encoding="utf-8", buffering=1)
    sys.stdout = log_fp
    sys.stderr = log_fp
except Exception:
    pass

import uvicorn
from server.main import app

async def main():
    print(f"\n[DAEMON] Iniciando Antigravity Remote Bridge na porta 8765...")
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=8765,
        log_level="info",
        access_log=False
    )
    server = uvicorn.Server(config)
    # Evitar que sinais do console vazio interrompam o loop no Windows
    server.install_signal_handlers = lambda: None
    await server.serve()

if __name__ == "__main__":
    asyncio.run(main())
