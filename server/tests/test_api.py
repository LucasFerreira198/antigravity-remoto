import pytest
from fastapi.testclient import TestClient
from server.main import app
from server.config import API_KEY

client = TestClient(app)

def test_public_index():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "Antigravity Remote Bridge"

def test_pairing_info():
    response = client.get("/api/pairing-info")
    assert response.status_code == 200
    data = response.json()
    assert "api_key" in data
    assert "local_url" in data

def test_auth_protection():
    # Sem token -> 401 Unauthorized
    response = client.get("/api/conversations")
    assert response.status_code == 401

def test_auth_success():
    # Com Bearer token -> 200 OK
    headers = {"Authorization": f"Bearer {API_KEY}"}
    response = client.get("/api/conversations", headers=headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_status_endpoint():
    headers = {"X-API-Key": API_KEY}
    response = client.get("/api/status", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "cpu_percent" in data
    assert "ram_percent" in data

def test_projects_endpoint():
    headers = {"X-API-Key": API_KEY}
    response = client.get("/api/projects", headers=headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_models_endpoint():
    headers = {"X-API-Key": API_KEY}
    response = client.get("/api/models", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "current_model" in data
    assert "available_models" in data

def test_skills_endpoint():
    headers = {"X-API-Key": API_KEY}
    response = client.get("/api/skills", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "skills" in data
    assert len(data["skills"]) > 0
