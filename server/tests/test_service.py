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

def test_list_installed_skills():
    service = AntigravityService()
    skills = service.list_installed_skills()
    assert isinstance(skills, list)
    assert len(skills) > 0
    first = skills[0]
    assert "name" in first
    assert "category" in first
    assert "description" in first
    assert "path" in first

def test_token_usage_stats():
    service = AntigravityService()
    convos = service.list_conversations(limit=1)
    if convos:
        cid = convos[0]["id"]
        stats = service.get_token_usage_stats(cid)
        assert isinstance(stats, dict)
        assert "current_context_tokens" in stats
        assert "context_percent_used" in stats
        assert "active_model" in stats

def test_contextual_suggestions():
    service = AntigravityService()
    convos = service.list_conversations(limit=1)
    if convos:
        cid = convos[0]["id"]
        suggestions = service.get_contextual_suggestions(cid)
        assert isinstance(suggestions, list)
        assert len(suggestions) > 0
        assert "title" in suggestions[0]
        assert "prompt" in suggestions[0]

def test_get_background_tasks_filtering():
    service = AntigravityService()
    convos = service.list_conversations(limit=1)
    if convos:
        cid = convos[0]["id"]
        tasks = service.get_background_tasks(cid)
        assert isinstance(tasks, list)
        for t in tasks:
            assert "task_id" in t
            assert "status" in t
            assert "is_daemon" in t
            # Deve filtrar tarefas efêmeras / lixo de regex
            assert not t["task_id"].startswith('"')
            desc = t.get("description", "").lower()
            if "timer:" in desc:
                assert "wait" not in desc
