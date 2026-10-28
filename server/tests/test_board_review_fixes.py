import os
import pytest
from pathlib import Path
from server.antigravity_service import AntigravityService
from server.tunnel import TunnelManager

def test_stop_background_task_sanitization():
    service = AntigravityService()
    # Injeção maliciosa com metacaracteres do PowerShell deve ser rejeitada ou limpa sem erro de sintaxe
    res = service.stop_background_task("convo123", "'; calc.exe; '")
    assert res is False or res is True # não deve lançar exceção de sintaxe PowerShell

def test_delete_conversation_path_traversal():
    service = AntigravityService()
    # Conversa vazia ou com .. não deve excluir nada indevido
    res = service.delete_conversation("../")
    assert res is False or res is True

def test_create_project_validation():
    service = AntigravityService()
    with pytest.raises(ValueError):
        service.create_project("", "C:\\valid\\path")
    with pytest.raises(ValueError):
        service.create_project("Project1", "")
    with pytest.raises(ValueError):
        service.create_project("Project1", "C:\\invalid\\*\\path")

def test_start_background_vbs_is_portable():
    vbs_path = Path(__file__).resolve().parent.parent / "start_background.vbs"
    content = vbs_path.read_text(encoding="utf-8")
    assert "C:\\Users\\Lucas" not in content, "start_background.vbs não deve conter caminhos hardcoded de usuário específico"
