import os
import sys
import json
import base64
import time
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

# Ensure root directory is on PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from server.main import app
from server.config import API_KEY
from server.antigravity_service import AntigravityService

client = TestClient(app)
auth_headers = {"X-API-Key": API_KEY}

def test_01_api_status_and_health():
    """Testa se a API responde ao status e fornece metadados do servidor."""
    res = client.get("/api/status", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert "hostname" in data
    assert "cpu_percent" in data
    assert "ram_percent" in data
    assert "desktop_cdp_available" in data

def test_02_conversations_list_filters_ghost_cli_sessions():
    """Testa se a listagem de conversas exclui sessões CLI vazias e sem título."""
    res = client.get("/api/conversations?limit=50", headers=auth_headers)
    assert res.status_code == 200
    convos = res.json()
    assert isinstance(convos, list)
    for c in convos:
        # Nenhuma conversa deve ter título vazio ou ser CORTEX_TRAJECTORY_SOURCE_CLI
        assert c["title"] is not None and c["title"].strip() != "", f"Conversa com título vazio encontrada: {c['id']}"
        assert c.get("source") != "CORTEX_TRAJECTORY_SOURCE_CLI", f"Conversa CLI interna vazada: {c['id']}"

def test_03_projects_listing():
    """Testa se os projetos configurados no computador são listados com seus IDs e caminhos."""
    res = client.get("/api/projects", headers=auth_headers)
    assert res.status_code == 200
    projects = res.json()
    assert isinstance(projects, list)
    assert len(projects) > 0
    project_names = [p["name"] for p in projects]
    assert any("antigravity" in n.lower() or "jogos" in n.lower() or "video" in n.lower() for n in project_names)

def test_04_attach_image_png():
    """Testa anexar uma imagem PNG: upload base64, salvamento no .user_uploaded e link Markdown."""
    # Criar 1x1 PNG válido em base64
    tiny_png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    target_cid = "b14ec5fe-c49d-4125-9b6a-cb61543c64c0"
    
    payload = {
        "prompt": "Teste de envio de imagem PNG",
        "image_base64": tiny_png_b64,
        "image_filename": "screen_test.png"
    }
    res = client.post(f"/api/conversations/{target_cid}/messages", headers=auth_headers, json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["has_attachment"] is True
    
    # Verificar se o arquivo foi fisicamente salvo no diretório .user_uploaded
    service = AntigravityService()
    upload_dir = service.paths.BRAIN_DIR / target_cid / ".user_uploaded"
    assert upload_dir.exists()
    assert any("screen_test" in f.name or "media_" in f.name for f in upload_dir.glob("*.png"))

def test_05_attach_document_pdf():
    """Testa anexar um documento PDF/texto: upload base64, salvamento no .user_uploaded e link Markdown."""
    dummy_pdf_b64 = base64.b64encode(b"%PDF-1.4 test document content for antigravity").decode("utf-8")
    target_cid = "b14ec5fe-c49d-4125-9b6a-cb61543c64c0"
    
    payload = {
        "prompt": "Teste de envio de documento PDF",
        "file_base64": dummy_pdf_b64,
        "file_filename": "relatorio_teste.pdf"
    }
    res = client.post(f"/api/conversations/{target_cid}/messages", headers=auth_headers, json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["has_attachment"] is True
    
    service = AntigravityService()
    upload_file = service.paths.BRAIN_DIR / target_cid / ".user_uploaded" / "relatorio_teste.pdf"
    assert upload_file.exists()
    assert upload_file.read_bytes().startswith(b"%PDF-1.4")

def test_06_attach_apk_binary():
    """Testa anexar um arquivo APK Android: upload binário base64, verificação de integridade e persistência."""
    # Simular binário de APK (ZIP header PK\x03\x04)
    dummy_apk_bytes = b"PK\x03\x04\x14\x00\x08\x00\x08\x00android_app_test_package_content"
    dummy_apk_b64 = base64.b64encode(dummy_apk_bytes).decode("utf-8")
    target_cid = "b14ec5fe-c49d-4125-9b6a-cb61543c64c0"
    
    payload = {
        "prompt": "Teste de anexo de APK",
        "file_base64": dummy_apk_b64,
        "file_filename": "AntigravityRemote-test.apk"
    }
    res = client.post(f"/api/conversations/{target_cid}/messages", headers=auth_headers, json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["has_attachment"] is True
    
    service = AntigravityService()
    upload_file = service.paths.BRAIN_DIR / target_cid / ".user_uploaded" / "AntigravityRemote-test.apk"
    assert upload_file.exists()
    assert upload_file.read_bytes().startswith(b"PK\x03\x04")

def test_07_empty_prompt_with_attachment_graceful_fallback():
    """Testa envio de anexo sem prompt digitado: o sistema deve prover prompt automático sem falhar."""
    dummy_code_b64 = base64.b64encode(b"print('hello world')").decode("utf-8")
    target_cid = "b14ec5fe-c49d-4125-9b6a-cb61543c64c0"
    
    payload = {
        "prompt": "",  # Usuário não digitou nada
        "file_base64": dummy_code_b64,
        "file_filename": "script_auto.py"
    }
    res = client.post(f"/api/conversations/{target_cid}/messages", headers=auth_headers, json=payload)
    assert res.status_code == 200
    assert res.json()["has_attachment"] is True

def test_08_skills_catalog_and_rea_integration():
    """Testa se o catálogo de skills do servidor expõe as categorias e a skill REA com ferramentas de engenharia reversa."""
    service = AntigravityService()
    skills = service.list_installed_skills()
    assert isinstance(skills, list)
    assert len(skills) > 0
    rea_skills = [s for s in skills if s.get("id") == "rea" or "engenharia" in s.get("category", "").lower()]
    assert len(rea_skills) > 0, "Skill REA deve estar registrada no catálogo do servidor"

def test_09_background_tasks_and_models():
    """Testa se as tarefas em segundo plano e a lista de modelos de IA estão operacionais."""
    target_cid = "b14ec5fe-c49d-4125-9b6a-cb61543c64c0"
    res_tasks = client.get(f"/api/conversations/{target_cid}/background-tasks", headers=auth_headers)
    assert res_tasks.status_code == 200
    assert "tasks" in res_tasks.json()

    res_models = client.get("/api/models", headers=auth_headers)
    assert res_models.status_code == 200
    models_data = res_models.json()
    assert "available_models" in models_data
    assert "current_model" in models_data
    model_names = [m["name"] for m in models_data["available_models"]]
    assert any("flash" in n.lower() or "sonnet" in n.lower() for n in model_names)

def test_10_delete_conversation_endpoint():
    """Testa o endpoint DELETE /api/conversations/{id} para excluir conversas com segurança."""
    # Criar uma conversa temporária de teste
    test_id = "test-delete-temp-" + str(int(time.time()))
    service = AntigravityService()
    temp_dir = service.paths.BRAIN_DIR / test_id
    temp_dir.mkdir(parents=True, exist_ok=True)
    (temp_dir / "test.txt").write_text("temp", encoding="utf-8")
    
    res = client.delete(f"/api/conversations/{test_id}", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "deleted"
    assert not temp_dir.exists()
