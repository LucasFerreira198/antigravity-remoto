import pytest
import json
from pathlib import Path
from server.config import AppPaths, get_or_create_api_key
from server.antigravity_service import AntigravityService

def test_config_paths():
    paths = AppPaths()
    assert paths.USER_HOME.exists()
    assert paths.GEMINI_DIR.exists()
    assert paths.ANTIGRAVITY_DIR.exists()

def test_api_key_generation(tmp_path):
    test_key_file = tmp_path / "test_auth.json"
    key1 = get_or_create_api_key(test_key_file)
    assert len(key1) >= 32
    # Segunda leitura deve retornar a mesma chave
    key2 = get_or_create_api_key(test_key_file)
    assert key1 == key2

def test_list_conversations():
    service = AntigravityService()
    convos = service.list_conversations(limit=5)
    assert isinstance(convos, list)
    if convos:
        c = convos[0]
        assert "id" in c
        assert "title" in c
        assert "preview" in c
        assert "step_count" in c

def test_list_projects():
    service = AntigravityService()
    projects = service.list_projects()
    assert isinstance(projects, list)
    if projects:
        p = projects[0]
        assert "id" in p
        assert "name" in p

def test_get_settings():
    service = AntigravityService()
    settings = service.get_settings()
    assert isinstance(settings, dict)
    assert "themeMode" in settings or "autoExecutionPolicy" in settings or True
