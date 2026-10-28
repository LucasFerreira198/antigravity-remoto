import os
import sys
import json
import base64
import pytest
from pathlib import Path
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from server.main import app, is_valid_image
from server.config import API_KEY
from server.cdp_controller import cdp_controller
from server.antigravity_service import AntigravityService

client = TestClient(app)
auth_headers = {"X-API-Key": API_KEY}
TEST_CID = "test-security-and-injection-convo"

@pytest.fixture(autouse=True)
def mock_cdp_desktop():
    with patch("server.main.cdp_controller.is_desktop_available", new_callable=AsyncMock) as m_avail, \
         patch("server.main.cdp_controller.send_message_to_desktop", new_callable=AsyncMock) as m_send:
        m_avail.return_value = True
        m_send.return_value = True
        yield m_send

@pytest.fixture(scope="session", autouse=True)
def cleanup_brain():
    yield
    import shutil
    service = AntigravityService()
    test_dir = service.paths.BRAIN_DIR / TEST_CID
    if test_dir.exists():
        shutil.rmtree(test_dir, ignore_errors=True)

def test_is_valid_image_strictly_allows_only_supported_formats():
    """Valida se apenas .png, .jpg, .jpeg e .webp reais são aceitos."""
    valid_png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    valid_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 20
    valid_webp = b"RIFF" + b"\x00" * 4 + b"WEBP" + b"\x00" * 20
    
    assert is_valid_image(valid_png, ".png") is True
    assert is_valid_image(valid_jpeg, ".jpg") is True
    assert is_valid_image(valid_jpeg, ".jpeg") is True
    assert is_valid_image(valid_webp, ".webp") is True

    # Formatos não suportados ou que quebram a API multimodal
    assert is_valid_image(b"GIF89a" + b"\x00" * 20, ".gif") is False
    assert is_valid_image(b"BM" + b"\x00" * 20, ".bmp") is False
    
    # Arquivos de código/texto com extensão falsa de imagem
    fake_png = b"print('this is python script')" + b"\x00" * 10
    assert is_valid_image(fake_png, ".png") is False

def test_real_image_injected_to_cdp_and_markdown_tag(mock_cdp_desktop):
    """Garante que imagem PNG real seja repassada ao CDP e marcada como imagem no prompt."""
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    png_b64 = base64.b64encode(png_bytes).decode("utf-8")

    payload = {
        "prompt": "Veja a foto",
        "attachments": [
            {"base64": png_b64, "filename": "foto_real.png", "is_image": True}
        ]
    }
    res = client.post(f"/api/conversations/{TEST_CID}/messages", headers=auth_headers, json=payload)
    assert res.status_code == 200

    # Verificar chamada ao CDP
    mock_cdp_desktop.assert_called_once()
    args, kwargs = mock_cdp_desktop.call_args
    sent_prompt = args[1]
    sent_file_paths = kwargs.get("file_paths", [])

    assert "![Imagem anexada: foto_real.png]" in sent_prompt
    assert len(sent_file_paths) == 1
    assert sent_file_paths[0].endswith("foto_real.png")

def test_code_and_text_files_never_injected_to_cdp_and_passed_as_arquivo_link(mock_cdp_desktop):
    """Arquivos de código e texto (.py, .txt, .pdf, .apk) devem estar no prompt como [Arquivo: nome](file:///...) e NUNCA no CDP."""
    py_content = b"def main():\n    print('hello world')\n"
    py_b64 = base64.b64encode(py_content).decode("utf-8")

    pdf_content = b"%PDF-1.4 header and binary pdf data..."
    pdf_b64 = base64.b64encode(pdf_content).decode("utf-8")

    apk_content = b"PK\x03\x04 android zip content"
    apk_b64 = base64.b64encode(apk_content).decode("utf-8")

    payload = {
        "prompt": "Analise estes 3 arquivos",
        "attachments": [
            {"base64": py_b64, "filename": "script.py", "is_image": False},
            {"base64": pdf_b64, "filename": "documento.pdf", "is_image": False},
            {"base64": apk_b64, "filename": "app.apk", "is_image": False}
        ]
    }
    res = client.post(f"/api/conversations/{TEST_CID}/messages", headers=auth_headers, json=payload)
    assert res.status_code == 200

    args, kwargs = mock_cdp_desktop.call_args
    sent_prompt = args[1]
    sent_file_paths = kwargs.get("file_paths", [])

    # NENHUM desses arquivos pode ser passado para o CDP
    assert len(sent_file_paths) == 0

    # Devem estar exatamente como [Arquivo: nome](file:///...)
    assert "[Arquivo: script.py](file:///" in sent_prompt
    assert "[Arquivo: documento.pdf](file:///" in sent_prompt
    assert "[Arquivo: app.apk](file:///" in sent_prompt

def test_code_with_is_image_flag_rejected_from_cdp_injection(mock_cdp_desktop):
    """Se o cliente tentar mandar .py com is_image=True, o sistema deve detectar que não é imagem real e NÃO injetar no CDP."""
    py_code = b"import sys\nprint('tentativa de passar como imagem')\n"
    py_b64 = base64.b64encode(py_code).decode("utf-8")

    payload = {
        "prompt": "Tentativa com is_image=True falso",
        "attachments": [
            {"base64": py_b64, "filename": "malicioso.py", "is_image": True}
        ]
    }
    res = client.post(f"/api/conversations/{TEST_CID}/messages", headers=auth_headers, json=payload)
    assert res.status_code == 200

    args, kwargs = mock_cdp_desktop.call_args
    sent_prompt = args[1]
    sent_file_paths = kwargs.get("file_paths", [])

    assert len(sent_file_paths) == 0
    assert "[Arquivo: malicioso.py](file:///" in sent_prompt
    assert "![Imagem anexada:" not in sent_prompt

def test_gif_treated_as_file_not_injected_to_cdp(mock_cdp_desktop):
    """Arquivos .gif não devem ser injetados no input[type='file']."""
    gif_content = b"GIF89a" + b"\x00" * 30
    gif_b64 = base64.b64encode(gif_content).decode("utf-8")

    payload = {
        "prompt": "Olhe o gif",
        "attachments": [
            {"base64": gif_b64, "filename": "animacao.gif", "is_image": True}
        ]
    }
    res = client.post(f"/api/conversations/{TEST_CID}/messages", headers=auth_headers, json=payload)
    assert res.status_code == 200

    args, kwargs = mock_cdp_desktop.call_args
    sent_file_paths = kwargs.get("file_paths", [])
    assert len(sent_file_paths) == 0

def test_path_traversal_attachment_blocked():
    """Garante que filename com traversal (../../evil.txt) seja sanitizado e fique restrito a .user_uploaded."""
    dummy_b64 = base64.b64encode(b"teste").decode("utf-8")
    payload = {
        "prompt": "Tentativa de traversal",
        "attachments": [
            {"base64": dummy_b64, "filename": "../../../../evil.txt", "is_image": False}
        ]
    }
    res = client.post(f"/api/conversations/{TEST_CID}/messages", headers=auth_headers, json=payload)
    assert res.status_code == 200

    service = AntigravityService()
    expected_dir = service.paths.BRAIN_DIR / TEST_CID / ".user_uploaded"
    assert (expected_dir / "evil.txt").exists()
    # Não deve existir fora de .user_uploaded
    assert not (service.paths.BRAIN_DIR / "evil.txt").exists()

def test_empty_message_and_empty_attachments_returns_400():
    """Enviar mensagem vazia sem anexos deve retornar HTTP 400."""
    payload = {"prompt": "   ", "attachments": []}
    res = client.post(f"/api/conversations/{TEST_CID}/messages", headers=auth_headers, json=payload)
    assert res.status_code == 400

def test_pairing_info_security():
    """GET /api/pairing-info só entrega a API_KEY se for local e sem cabeçalhos de proxy remoto."""
    # Chamada local
    res_local = client.get("/api/pairing-info")
    assert res_local.status_code == 200
    assert "api_key" in res_local.json()

    # Chamada remota simulada via túnel Cloudflare
    res_remote = client.get("/api/pairing-info", headers={"cf-connecting-ip": "203.0.113.195"})
    assert res_remote.status_code == 200
    assert "api_key" not in res_remote.json()

def test_media_endpoint_requires_auth_and_blocks_traversal():
    """Endpoint de mídia exige autenticação e bloqueia path traversal."""
    # Sem auth -> 401
    res = client.get(f"/api/conversations/{TEST_CID}/media/foto.png")
    assert res.status_code == 401

    # Com auth, mas tentando traversal para ler arquivo de log interno -> 404
    headers = {"X-API-Key": API_KEY}
    res_traversal = client.get(f"/api/conversations/{TEST_CID}/media/..%2F.system_generated%2Flogs%2Ftranscript.jsonl", headers=headers)
    assert res_traversal.status_code == 404
