"""End-to-end API checks against a real Postgres and the real face models.

Run: docker run -d --name rollcall-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rollcall -p 5433:5432 postgres:17-alpine
     FACE_DIR=<dir with one distinct face per jpeg> pytest tests/test_api.py
"""
import base64
import os
import sys
from pathlib import Path

import psycopg
import pytest

TEST_DB = os.getenv("TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/rollcall")
os.environ.update(DATABASE_URL=TEST_DB, SECRET_KEY="test-secret", FRONTEND_ORIGIN="https://site.example")
sys.path.insert(0, str(Path(__file__).parent.parent))

FACE_DIR = Path(os.environ["FACE_DIR"])
FACE_FILES = sorted(FACE_DIR.glob("*.jp*g"))
PW = "correct-horse"


def image(index):
    return "data:image/jpeg;base64," + base64.b64encode(FACE_FILES[index].read_bytes()).decode()


@pytest.fixture(scope="module")
def client():
    with psycopg.connect(TEST_DB, autocommit=True) as conn:
        conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    import app as server
    return server.app.test_client()


@pytest.fixture(autouse=True)
def reset_limits():
    import app as server
    server._hits.clear()


class User:
    def __init__(self, client, name, role):
        self.client = client
        res = client.post("/api/signup", json={"name": name, "email": f"{name}@x.io", "password": PW, "role": role})
        assert res.status_code == 201, res.json
        self.token, self.user = res.json["token"], res.json["user"]
        self.id = self.user["id"]

    def call(self, method, path, **kw):
        return getattr(self.client, method)(path, headers={"Authorization": f"Bearer {self.token}"}, **kw)


def test_signup_validates_and_rejects_duplicates(client):
    assert client.post("/api/signup", json={"name": "A", "email": "bad", "password": PW, "role": "student"}).status_code == 400
    assert client.post("/api/signup", json={"name": "A", "email": "a@x.io", "password": "short", "role": "student"}).status_code == 400
    assert client.post("/api/signup", json={"name": "A", "email": "a@x.io", "password": PW, "role": "admin"}).status_code == 400
    User(client, "dupe", "student")
    res = client.post("/api/signup", json={"name": "A", "email": "DUPE@x.io", "password": PW, "role": "teacher"})
    assert res.status_code == 409


def test_signin_and_token_rules(client):
    user = User(client, "signer", "teacher")
    assert client.post("/api/signin", json={"email": "signer@x.io", "password": "wrong-pass"}).status_code == 401
    assert client.post("/api/signin", json={"email": "SIGNER@x.io", "password": PW}).status_code == 200
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Bearer forged"}).status_code == 401
    assert user.call("get", "/api/me").json["user"]["email"] == "signer@x.io"
    # Old tokens stop working after a password change.
    res = user.call("post", "/api/me/password", json={"currentPassword": PW, "newPassword": "another-pass-1"})
    assert res.status_code == 200
    assert user.call("get", "/api/me").status_code == 401
    user.token = res.json["token"]
    assert user.call("get", "/api/me").status_code == 200


def test_signin_is_rate_limited(client):
    User(client, "limited", "student")
    codes = [client.post("/api/signin", json={"email": "limited@x.io", "password": "nope-nope"}).status_code for _ in range(11)]
    assert codes[:10] == [401] * 10 and codes[10] == 429


def test_cors_only_allows_the_site(client):
    allowed = client.get("/health", headers={"Origin": "https://site.example"})
    denied = client.get("/health", headers={"Origin": "https://evil.example"})
    assert allowed.headers.get("Access-Control-Allow-Origin") == "https://site.example"
    assert "Access-Control-Allow-Origin" not in denied.headers


def test_full_attendance_flow(client):
    teacher = User(client, "teach", "teacher")
    alice, bob = User(client, "alice", "student"), User(client, "bob", "student")

    class_id = teacher.call("post", "/api/classes", json={"name": "CS101", "subject": "Algorithms"}).json["id"]
    code = teacher.call("get", f"/api/classes/{class_id}").json["klass"]["joinCode"]
    assert alice.call("post", "/api/student/classes/join", json={"code": "NOPE99"}).status_code == 404
    assert alice.call("post", "/api/student/classes/join", json={"code": code.lower()}).status_code == 200
    assert bob.call("post", "/api/student/classes/join", json={"code": code}).status_code == 200

    # Enrolment needs consent, five photos, and one face per photo.
    five = [image(0)] * 5
    assert alice.call("post", "/api/me/face", json={"images": five}).status_code == 400
    assert alice.call("post", "/api/me/face", json={"images": five[:4], "consent": True}).status_code == 400
    res = alice.call("post", "/api/me/face", json={"images": five, "consent": True})
    assert res.status_code == 200, res.json
    assert res.json["user"]["faceEnrolledAt"]
    # Mixed people in one enrolment are refused.
    res = bob.call("post", "/api/me/face", json={"images": [image(1)] * 4 + [image(2)], "consent": True})
    assert res.status_code == 422 and res.json["shot"] == 4
    # Someone else's face can't be enrolled on a second account.
    assert bob.call("post", "/api/me/face", json={"images": five, "consent": True}).status_code == 409
    assert bob.call("post", "/api/me/face", json={"images": [image(1)] * 5, "consent": True}).status_code == 200

    check = alice.call("post", "/api/me/face/check", json={"image": image(0)}).json
    assert check["match"]["recognized"] is True
    assert alice.call("post", "/api/me/face/check", json={"image": image(1)}).json["match"]["recognized"] is False

    # Start: a second start returns the same open session.
    session_id = teacher.call("post", f"/api/classes/{class_id}/sessions", json={"topic": "Graphs"}).json["id"]
    assert teacher.call("post", f"/api/classes/{class_id}/sessions", json={}).json["id"] == session_id

    url = f"/api/sessions/{session_id}/recognize"
    first = teacher.call("post", url, json={"image": image(0)}).json["faces"][0]
    assert first["status"] == "marked" and first["studentId"] == alice.id
    assert teacher.call("post", url, json={"image": image(0)}).json["faces"][0]["status"] == "already"
    # A stranger's face marks nobody.
    assert teacher.call("post", url, json={"image": image(3)}).json["faces"][0]["status"] == "unknown"

    roster = {s["id"]: s for s in teacher.call("get", f"/api/sessions/{session_id}").json["students"]}
    assert roster[alice.id]["present"] and roster[alice.id]["method"] == "face"
    assert not roster[bob.id]["present"]

    # Finished sessions stay hidden from the student's history until they end.
    assert alice.call("get", "/api/student/attendance").json["records"] == []
    assert teacher.call("post", f"/api/sessions/{session_id}/end", json={}).status_code == 200
    assert teacher.call("post", url, json={"image": image(0)}).status_code == 409

    alice_records = alice.call("get", "/api/student/attendance").json["records"]
    bob_records = bob.call("get", "/api/student/attendance").json["records"]
    assert [r["present"] for r in alice_records] == [True]
    assert [r["present"] for r in bob_records] == [False]
    assert alice.call("get", "/api/student/classes").json["classes"][0]["present"] == 1

    # Teacher can correct a finished session by hand.
    put = f"/api/sessions/{session_id}/students/{bob.id}"
    assert teacher.call("put", put, json={"present": True}).status_code == 200
    assert bob.call("get", "/api/student/attendance").json["records"][0]["method"] == "manual"
    assert teacher.call("put", put, json={"present": False}).status_code == 200

    report = teacher.call("get", f"/api/classes/{class_id}/report").json
    assert report["marks"] == [{"sessionId": session_id, "studentId": alice.id}]

    # Filters on the history.
    assert alice.call("get", "/api/student/attendance?from=2999-01-01").json["records"] == []
    assert alice.call("get", "/api/student/attendance?from=nonsense").status_code == 400


def test_data_is_scoped_to_its_owner(client):
    owner, stranger = User(client, "owner", "teacher"), User(client, "stranger", "teacher")
    student = User(client, "scoped", "student")
    class_id = owner.call("post", "/api/classes", json={"name": "Private"}).json["id"]
    code = owner.call("get", f"/api/classes/{class_id}").json["klass"]["joinCode"]
    student.call("post", "/api/student/classes/join", json={"code": code})
    session_id = owner.call("post", f"/api/classes/{class_id}/sessions", json={}).json["id"]

    for method, path, kw in [
        ("get", f"/api/classes/{class_id}", {}),
        ("delete", f"/api/classes/{class_id}", {}),
        ("get", f"/api/classes/{class_id}/report", {}),
        ("patch", f"/api/classes/{class_id}/students/{student.id}", {"json": {"name": "Hacked"}}),
        ("post", f"/api/classes/{class_id}/sessions", {"json": {}}),
        ("get", f"/api/sessions/{session_id}", {}),
        ("post", f"/api/sessions/{session_id}/end", {"json": {}}),
        ("put", f"/api/sessions/{session_id}/students/{student.id}", {"json": {"present": True}}),
    ]:
        assert stranger.call(method, path, **kw).status_code == 404, path

    # Students can't reach teacher routes, or mark themselves present.
    assert student.call("get", "/api/classes").status_code == 403
    assert student.call("get", f"/api/sessions/{session_id}").status_code == 403
    assert student.call("put", f"/api/sessions/{session_id}/students/{student.id}", json={"present": True}).status_code == 403
    assert owner.call("post", "/api/me/face", json={}).status_code == 403
    # A teacher can't edit someone outside their class.
    assert owner.call("patch", f"/api/classes/{class_id}/students/{stranger.id}", json={"name": "X"}).status_code == 404


def test_only_class_members_can_match(client):
    teacher = User(client, "teach2", "teacher")
    outsider = User(client, "outsider", "student")
    assert outsider.call("post", "/api/me/face", json={"images": [image(4)] * 5, "consent": True}).status_code == 200
    class_id = teacher.call("post", "/api/classes", json={"name": "Empty"}).json["id"]
    session_id = teacher.call("post", f"/api/classes/{class_id}/sessions", json={}).json["id"]
    face = teacher.call("post", f"/api/sessions/{session_id}/recognize", json={"image": image(4)}).json["faces"][0]
    assert face["status"] == "unknown"


def test_no_embedding_ever_leaves_the_server(client):
    student = User(client, "private", "student")
    assert student.call("post", "/api/me/face", json={"images": [image(5)] * 5, "consent": True}).status_code == 200
    teacher = User(client, "teach3", "teacher")
    class_id = teacher.call("post", "/api/classes", json={"name": "C"}).json["id"]
    code = teacher.call("get", f"/api/classes/{class_id}").json["klass"]["joinCode"]
    student.call("post", "/api/student/classes/join", json={"code": code})
    session_id = teacher.call("post", f"/api/classes/{class_id}/sessions", json={}).json["id"]
    for res in [
        student.call("get", "/api/me"),
        teacher.call("get", f"/api/classes/{class_id}"),
        teacher.call("get", f"/api/sessions/{session_id}"),
        teacher.call("get", f"/api/classes/{class_id}/report"),
    ]:
        assert "embedding" not in res.get_data(as_text=True)
        assert "password" not in res.get_data(as_text=True)


def test_bad_images_and_delete_account(client):
    student = User(client, "deleter", "student")
    for bad in ["", "not-base64!!", base64.b64encode(b"not an image").decode()]:
        assert student.call("post", "/api/me/face/check", json={"image": bad}).status_code == 400
    assert student.call("delete", "/api/me", json={"password": "wrong-pass"}).status_code == 403
    assert student.call("delete", "/api/me", json={"password": PW}).status_code == 200
    assert student.call("get", "/api/me").status_code == 401
    assert client.post("/api/signin", json={"email": "deleter@x.io", "password": PW}).status_code == 401
