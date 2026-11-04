"""Rollcall API: accounts, classes, face enrolment and attendance sessions."""
import logging
import os
import re
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import date, datetime, timezone
from functools import wraps
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request
from flask_cors import CORS
from itsdangerous import BadSignature, URLSafeTimedSerializer
from psycopg.errors import UniqueViolation
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

import faces

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("rollcall")

TOKEN_MAX_AGE = 60 * 60 * 24 * 14
ENROLL_SHOTS = 5
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # No 0/O or 1/I/L: codes get read aloud.

# Public columns of a user. face_embedding is deliberately absent: it must never leave the server.
USER_COLUMNS = """id, email, name, role, department, phone, employee_id AS "employeeId", roll_no AS "rollNo",
  year, division, semester, face_enrolled_at AS "faceEnrolledAt", created_at AS "createdAt\""""
STUDENT_COLUMNS = """u.id, u.email, u.name, u.department, u.phone, u.roll_no AS "rollNo", u.year, u.division,
  u.semester, u.face_enrolled_at IS NOT NULL AS "faceEnrolled\""""

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 12 * 1024 * 1024
app.json.sort_keys = False
app.json.default = lambda o: o.isoformat() if isinstance(o, (datetime, date)) else str(o)

origins = [o.strip() for o in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",") if o.strip()]
CORS(app, origins=origins, allow_headers=["Authorization", "Content-Type"], max_age=86400)

SECRET_KEY = os.environ["SECRET_KEY"]
tokens = URLSafeTimedSerializer(SECRET_KEY, salt="rollcall-auth")

# check= revalidates connections, because Neon closes them when its compute scales to zero.
pool = ConnectionPool(
    os.environ["DATABASE_URL"],
    min_size=1,
    max_size=4,
    kwargs={"row_factory": dict_row, "autocommit": True},
    check=ConnectionPool.check_connection,
    open=True,
)
with pool.connection() as boot_conn:
    boot_conn.execute((Path(__file__).parent / "schema.sql").read_text())


class ApiError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


@app.errorhandler(ApiError)
def handle_api_error(err):
    return jsonify(error=err.message), err.status


@app.errorhandler(faces.BadImage)
def handle_bad_image(err):
    return jsonify(error=str(err)), 400


@app.errorhandler(HTTPException)
def handle_http_error(err):
    messages = {413: "That upload is too large.", 404: "Not found.", 405: "Method not allowed."}
    return jsonify(error=messages.get(err.code, err.description)), err.code


@app.errorhandler(Exception)
def handle_unexpected(err):
    log.exception("Unhandled error on %s %s", request.method, request.path)
    return jsonify(error="Something went wrong on our side. Please try again."), 500


def query(sql, *params):
    with pool.connection() as conn:
        return conn.execute(sql, params).fetchall()


def one(sql, *params):
    rows = query(sql, *params)
    return rows[0] if rows else None


def run(sql, *params):
    with pool.connection() as conn:
        return conn.execute(sql, params).rowcount


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Expected a JSON body.")
    return data


def clean(data, key, label=None, required=False, limit=120):
    value = data.get(key, "")
    value = value.strip() if isinstance(value, str) else ""
    if required and not value:
        raise ApiError(f"{label or key} is required.")
    if len(value) > limit:
        raise ApiError(f"{label or key} is too long.")
    return value


# ponytail: in-memory limiter, per process. Enough for one instance; use Redis if this ever scales out.
_hits = defaultdict(deque)
_hits_lock = threading.Lock()


def rate_limit(key, limit, window):
    now = time.monotonic()
    with _hits_lock:
        hits = _hits[key]
        while hits and now - hits[0] > window:
            hits.popleft()
        if len(hits) >= limit:
            raise ApiError("Too many attempts. Please wait a few minutes and try again.", 429)
        hits.append(now)


def issue_token(user_id, password_hash):
    # Including part of the hash signs the user out everywhere when their password changes.
    return tokens.dumps({"uid": user_id, "v": password_hash[-12:]})


def authed(role=None):
    def decorate(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                raise ApiError("Please sign in.", 401)
            try:
                claims = tokens.loads(header[7:], max_age=TOKEN_MAX_AGE)
            except BadSignature:
                raise ApiError("Your session has expired. Please sign in again.", 401)
            user = one("SELECT id, role, password_hash FROM users WHERE id = %s", claims["uid"])
            if not user or user["password_hash"][-12:] != claims["v"]:
                raise ApiError("Your session has expired. Please sign in again.", 401)
            if role and user["role"] != role:
                raise ApiError("You don't have access to this.", 403)
            g.user_id, g.role, g.password_hash = user["id"], user["role"], user["password_hash"]
            return view(*args, **kwargs)
        return wrapper
    return decorate


def current_user():
    return one(f"SELECT {USER_COLUMNS} FROM users WHERE id = %s", g.user_id)


def own_class(class_id):
    row = one("SELECT * FROM classes WHERE id = %s AND teacher_id = %s", class_id, g.user_id)
    if not row:
        raise ApiError("Class not found.", 404)
    return row


def own_session(session_id):
    row = one(
        """SELECT s.*, c.name AS class_name, c.subject FROM sessions s JOIN classes c ON c.id = s.class_id
           WHERE s.id = %s AND c.teacher_id = %s""",
        session_id, g.user_id,
    )
    if not row:
        raise ApiError("Session not found.", 404)
    return row


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------- Accounts ----------

@app.post("/api/signup")
def signup():
    data = body()
    rate_limit(("signup", request.headers.get("X-Forwarded-For", request.remote_addr)), 20, 3600)
    name = clean(data, "name", "Name", required=True)
    email = clean(data, "email", "Email", required=True, limit=254).lower()
    password = data.get("password")
    role = data.get("role")
    if not EMAIL_RE.match(email):
        raise ApiError("Enter a valid email address.")
    if not isinstance(password, str) or not 8 <= len(password) <= 200:
        raise ApiError("Password must be at least 8 characters.")
    if role not in ("student", "teacher"):
        raise ApiError("Choose whether you are a student or a teacher.")
    password_hash = generate_password_hash(password)
    try:
        row = one(
            """INSERT INTO users (email, password_hash, name, role, department, employee_id)
               VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
            email, password_hash, name, role, clean(data, "department"), clean(data, "employeeId"),
        )
    except UniqueViolation:
        raise ApiError("An account with this email already exists. Try signing in.", 409)
    g.user_id = row["id"]
    return jsonify(token=issue_token(row["id"], password_hash), user=current_user()), 201


@app.post("/api/signin")
def signin():
    data = body()
    email = clean(data, "email", "Email", required=True, limit=254).lower()
    password = data.get("password")
    rate_limit(("signin", email), 10, 300)
    user = one("SELECT id, password_hash FROM users WHERE email = %s", email)
    if not user or not isinstance(password, str) or not check_password_hash(user["password_hash"], password):
        raise ApiError("Incorrect email or password.", 401)
    g.user_id = user["id"]
    return jsonify(token=issue_token(user["id"], user["password_hash"]), user=current_user())


@app.get("/api/me")
@authed()
def me():
    return jsonify(user=current_user())


@app.patch("/api/me")
@authed()
def update_me():
    data = body()
    name = clean(data, "name", "Name", required=True)
    run(
        """UPDATE users SET name = %s, department = %s, phone = %s, employee_id = %s, roll_no = %s,
           year = %s, division = %s, semester = %s WHERE id = %s""",
        name, clean(data, "department"), clean(data, "phone", limit=30), clean(data, "employeeId"),
        clean(data, "rollNo"), clean(data, "year"), clean(data, "division"), clean(data, "semester"), g.user_id,
    )
    return jsonify(user=current_user())


@app.post("/api/me/password")
@authed()
def change_password():
    data = body()
    rate_limit(("password", g.user_id), 10, 300)
    new = data.get("newPassword")
    if not check_password_hash(g.password_hash, str(data.get("currentPassword", ""))):
        raise ApiError("Your current password is incorrect.", 403)
    if not isinstance(new, str) or not 8 <= len(new) <= 200:
        raise ApiError("New password must be at least 8 characters.")
    password_hash = generate_password_hash(new)
    run("UPDATE users SET password_hash = %s WHERE id = %s", password_hash, g.user_id)
    return jsonify(token=issue_token(g.user_id, password_hash))


@app.delete("/api/me")
@authed()
def delete_me():
    data = body()
    rate_limit(("password", g.user_id), 10, 300)
    if not check_password_hash(g.password_hash, str(data.get("password", ""))):
        raise ApiError("That password is incorrect.", 403)
    run("DELETE FROM users WHERE id = %s", g.user_id)  # Cascades to classes, sessions and attendance.
    return jsonify(ok=True)


# ---------- Student: face ----------

@app.post("/api/me/face/check")
@authed("student")
def check_face():
    """Validate one camera frame. Once enrolled, also says whether the frame matches this student."""
    img = faces.decode_image(body().get("image"))
    found = faces.detect(img)
    result = {
        "faces": [faces.box(f) for f in found],
        "frame": [img.shape[1], img.shape[0]],
    }
    row = one("SELECT face_embedding FROM users WHERE id = %s", g.user_id)
    if len(found) == 1 and row["face_embedding"]:
        score = faces.similarity(faces.embed(img, found[0]), np.array(row["face_embedding"], dtype=np.float32))
        result["match"] = {"recognized": score >= faces.MATCH_THRESHOLD, "similarity": round(score, 3)}
    return jsonify(result)


@app.post("/api/me/face")
@authed("student")
def enroll_face():
    data = body()
    if data.get("consent") is not True:
        raise ApiError("Please give your consent before enrolling your face.")
    images = data.get("images")
    if not isinstance(images, list) or len(images) != ENROLL_SHOTS:
        raise ApiError(f"Exactly {ENROLL_SHOTS} photos are required.")

    embeddings = []
    for index, image in enumerate(images, start=1):
        img = faces.decode_image(image)
        found = faces.detect(img)
        if len(found) != 1:
            problem = "No clear face was found" if not found else "More than one face was found"
            return jsonify(error=f"{problem} in photo {index}. Please retake it.", shot=index - 1), 422
        embeddings.append(faces.embed(img, found[0]))

    # Compare each photo with the average of the other four. An average that included the photo
    # itself would let a different person through, because they'd partly be matching themselves.
    for index, embedding in enumerate(embeddings):
        others = faces.centroid(embeddings[:index] + embeddings[index + 1:])
        if faces.similarity(embedding, others) < faces.MATCH_THRESHOLD:
            return jsonify(error=f"Photo {index + 1} doesn't look like the others. Please retake it.", shot=index), 422
    template = faces.centroid(embeddings)

    # One person, one account: stops a friend enrolling their face on your account to sign in for you.
    others = query("SELECT face_embedding FROM users WHERE face_embedding IS NOT NULL AND id <> %s", g.user_id)
    if others:
        stored = np.array([r["face_embedding"] for r in others], dtype=np.float32)
        if float((stored @ template).max()) >= faces.MATCH_THRESHOLD + 0.1:
            raise ApiError("This face already seems to be enrolled on another account. Ask your teacher for help.", 409)

    run(
        "UPDATE users SET face_embedding = %s, face_enrolled_at = now(), face_consent_at = now() WHERE id = %s",
        [float(v) for v in template], g.user_id,
    )
    return jsonify(user=current_user())


@app.delete("/api/me/face")
@authed("student")
def delete_face():
    run("UPDATE users SET face_embedding = NULL, face_enrolled_at = NULL, face_consent_at = NULL WHERE id = %s", g.user_id)
    return jsonify(user=current_user())


# ---------- Student: classes and attendance ----------

@app.get("/api/student/classes")
@authed("student")
def student_classes():
    rows = query(
        """SELECT c.id, c.name, c.subject, t.name AS teacher, e.joined_at AS "joinedAt",
             (SELECT count(*) FROM sessions s WHERE s.class_id = c.id AND s.started_at >= e.joined_at
                AND s.ended_at IS NOT NULL)::int AS total,
             (SELECT count(*) FROM attendance a JOIN sessions s ON s.id = a.session_id
                WHERE s.class_id = c.id AND a.student_id = e.student_id AND s.ended_at IS NOT NULL)::int AS present
           FROM enrollments e JOIN classes c ON c.id = e.class_id JOIN users t ON t.id = c.teacher_id
           WHERE e.student_id = %s ORDER BY c.name""",
        g.user_id,
    )
    return jsonify(classes=rows)


@app.post("/api/student/classes/join")
@authed("student")
def join_class():
    rate_limit(("join", g.user_id), 20, 300)
    code = clean(body(), "code", "Class code", required=True, limit=12).upper()
    row = one("SELECT id, name FROM classes WHERE join_code = %s", code)
    if not row:
        raise ApiError("No class has that code. Check it with your teacher.", 404)
    run("INSERT INTO enrollments (class_id, student_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", row["id"], g.user_id)
    return jsonify(id=row["id"], name=row["name"])


@app.delete("/api/student/classes/<int:class_id>")
@authed("student")
def leave_class(class_id):
    run("DELETE FROM enrollments WHERE class_id = %s AND student_id = %s", class_id, g.user_id)
    return jsonify(ok=True)


@app.get("/api/student/attendance")
@authed("student")
def student_attendance():
    filters, params = "", [g.user_id, g.user_id]
    if request.args.get("classId", "").isdigit():
        filters += " AND c.id = %s"
        params.append(int(request.args["classId"]))
    for arg, clause in (("from", " AND s.started_at::date >= %s"), ("to", " AND s.started_at::date <= %s")):
        value = request.args.get(arg, "")
        if value:
            try:
                params.append(date.fromisoformat(value))
            except ValueError:
                raise ApiError("Dates must look like YYYY-MM-DD.")
            filters += clause
    rows = query(
        f"""SELECT s.id, s.topic, s.started_at AS "startedAt", c.id AS "classId", c.name AS "className", c.subject,
              a.student_id IS NOT NULL AS present, a.marked_at AS "markedAt", a.method
            FROM enrollments e
            JOIN classes c ON c.id = e.class_id
            JOIN sessions s ON s.class_id = c.id AND s.started_at >= e.joined_at AND s.ended_at IS NOT NULL
            LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = %s
            WHERE e.student_id = %s{filters}
            ORDER BY s.started_at DESC LIMIT 500""",
        *params,
    )
    return jsonify(records=rows)


# ---------- Teacher: classes ----------

def new_join_code():
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


CLASS_SUMMARY = """SELECT c.id, c.name, c.subject, c.join_code AS "joinCode", c.created_at AS "createdAt",
    (SELECT count(*) FROM enrollments e WHERE e.class_id = c.id)::int AS students,
    (SELECT count(*) FROM enrollments e JOIN users u ON u.id = e.student_id
       WHERE e.class_id = c.id AND u.face_embedding IS NOT NULL)::int AS enrolled,
    (SELECT count(*) FROM sessions s WHERE s.class_id = c.id AND s.ended_at IS NOT NULL)::int AS sessions,
    (SELECT s.id FROM sessions s WHERE s.class_id = c.id AND s.ended_at IS NULL) AS "openSessionId"
  FROM classes c"""


@app.get("/api/classes")
@authed("teacher")
def list_classes():
    classes = query(f"{CLASS_SUMMARY} WHERE c.teacher_id = %s ORDER BY c.created_at DESC", g.user_id)
    recent = query(
        """SELECT s.id, s.topic, s.started_at AS "startedAt", c.name AS "className",
             (SELECT count(*) FROM attendance a WHERE a.session_id = s.id)::int AS present,
             (SELECT count(*) FROM enrollments e WHERE e.class_id = s.class_id AND e.joined_at <= s.started_at)::int AS total
           FROM sessions s JOIN classes c ON c.id = s.class_id
           WHERE c.teacher_id = %s AND s.ended_at IS NOT NULL ORDER BY s.started_at DESC LIMIT 8""",
        g.user_id,
    )
    return jsonify(classes=classes, recentSessions=recent)


@app.post("/api/classes")
@authed("teacher")
def create_class():
    data = body()
    name = clean(data, "name", "Class name", required=True)
    subject = clean(data, "subject")
    for _ in range(5):
        try:
            row = one(
                "INSERT INTO classes (teacher_id, name, subject, join_code) VALUES (%s, %s, %s, %s) RETURNING id",
                g.user_id, name, subject, new_join_code(),
            )
            return jsonify(id=row["id"]), 201
        except UniqueViolation:
            continue
    raise ApiError("Couldn't create a class code. Please try again.", 500)


@app.get("/api/classes/<int:class_id>")
@authed("teacher")
def get_class(class_id):
    own_class(class_id)
    klass = one(f"{CLASS_SUMMARY} WHERE c.id = %s", class_id)
    students = query(
        f"""SELECT {STUDENT_COLUMNS}, e.joined_at AS "joinedAt",
              (SELECT count(*) FROM sessions s WHERE s.class_id = e.class_id AND s.started_at >= e.joined_at
                 AND s.ended_at IS NOT NULL)::int AS total,
              (SELECT count(*) FROM attendance a JOIN sessions s ON s.id = a.session_id
                 WHERE s.class_id = e.class_id AND a.student_id = u.id AND s.ended_at IS NOT NULL)::int AS present
            FROM enrollments e JOIN users u ON u.id = e.student_id
            WHERE e.class_id = %s ORDER BY u.name""",
        class_id,
    )
    sessions = query(
        """SELECT s.id, s.topic, s.started_at AS "startedAt", s.ended_at AS "endedAt",
             (SELECT count(*) FROM attendance a WHERE a.session_id = s.id)::int AS present,
             (SELECT count(*) FROM enrollments e WHERE e.class_id = s.class_id AND e.joined_at <= s.started_at)::int AS total
           FROM sessions s WHERE s.class_id = %s ORDER BY s.started_at DESC LIMIT 200""",
        class_id,
    )
    return jsonify(klass=klass, students=students, sessions=sessions)


@app.patch("/api/classes/<int:class_id>")
@authed("teacher")
def update_class(class_id):
    own_class(class_id)
    data = body()
    run("UPDATE classes SET name = %s, subject = %s WHERE id = %s",
        clean(data, "name", "Class name", required=True), clean(data, "subject"), class_id)
    return jsonify(ok=True)


@app.delete("/api/classes/<int:class_id>")
@authed("teacher")
def delete_class(class_id):
    own_class(class_id)
    run("DELETE FROM classes WHERE id = %s", class_id)
    return jsonify(ok=True)


@app.get("/api/classes/<int:class_id>/report")
@authed("teacher")
def class_report(class_id):
    """Every student by every finished session, for the spreadsheet export."""
    klass = own_class(class_id)
    sessions = query(
        """SELECT id, topic, started_at AS "startedAt" FROM sessions
           WHERE class_id = %s AND ended_at IS NOT NULL ORDER BY started_at""",
        class_id,
    )
    students = query(
        """SELECT u.id, u.name, u.roll_no AS "rollNo", u.email, e.joined_at AS "joinedAt"
           FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.class_id = %s ORDER BY u.name""",
        class_id,
    )
    marks = query(
        """SELECT a.session_id AS "sessionId", a.student_id AS "studentId"
           FROM attendance a JOIN sessions s ON s.id = a.session_id WHERE s.class_id = %s""",
        class_id,
    )
    return jsonify(name=klass["name"], sessions=sessions, students=students, marks=marks)


def enrolled_student(class_id, student_id):
    row = one("SELECT 1 AS ok FROM enrollments WHERE class_id = %s AND student_id = %s", class_id, student_id)
    if not row:
        raise ApiError("That student isn't in this class.", 404)


@app.patch("/api/classes/<int:class_id>/students/<int:student_id>")
@authed("teacher")
def update_student(class_id, student_id):
    own_class(class_id)
    enrolled_student(class_id, student_id)
    data = body()
    run(
        """UPDATE users SET name = %s, roll_no = %s, department = %s, year = %s, division = %s, semester = %s,
           phone = %s WHERE id = %s AND role = 'student'""",
        clean(data, "name", "Name", required=True), clean(data, "rollNo"), clean(data, "department"),
        clean(data, "year"), clean(data, "division"), clean(data, "semester"), clean(data, "phone", limit=30),
        student_id,
    )
    return jsonify(ok=True)


@app.delete("/api/classes/<int:class_id>/students/<int:student_id>")
@authed("teacher")
def remove_student(class_id, student_id):
    own_class(class_id)
    run("DELETE FROM enrollments WHERE class_id = %s AND student_id = %s", class_id, student_id)
    return jsonify(ok=True)


# ---------- Teacher: sessions ----------

@app.post("/api/classes/<int:class_id>/sessions")
@authed("teacher")
def start_session(class_id):
    own_class(class_id)
    topic = clean(body(), "topic", "Topic")
    try:
        row = one("INSERT INTO sessions (class_id, topic) VALUES (%s, %s) RETURNING id", class_id, topic)
    except UniqueViolation:
        row = one("SELECT id FROM sessions WHERE class_id = %s AND ended_at IS NULL", class_id)
    return jsonify(id=row["id"]), 201


def session_payload(session):
    students = query(
        f"""SELECT {STUDENT_COLUMNS}, a.student_id IS NOT NULL AS present, a.marked_at AS "markedAt",
              a.method, a.similarity
            FROM enrollments e JOIN users u ON u.id = e.student_id
            LEFT JOIN attendance a ON a.session_id = %s AND a.student_id = u.id
            WHERE e.class_id = %s AND (e.joined_at <= %s OR a.student_id IS NOT NULL)
            ORDER BY u.name""",
        session["id"], session["class_id"], session["ended_at"] or datetime.now(timezone.utc),
    )
    return {
        "id": session["id"],
        "classId": session["class_id"],
        "className": session["class_name"],
        "subject": session["subject"],
        "topic": session["topic"],
        "startedAt": session["started_at"],
        "endedAt": session["ended_at"],
        "students": students,
    }


@app.get("/api/sessions/<int:session_id>")
@authed("teacher")
def get_session(session_id):
    return jsonify(session_payload(own_session(session_id)))


@app.post("/api/sessions/<int:session_id>/recognize")
@authed("teacher")
def recognize(session_id):
    session = own_session(session_id)
    if session["ended_at"]:
        raise ApiError("This session has ended.", 409)
    img = faces.decode_image(body().get("image"))
    found = faces.detect(img)
    frame = [img.shape[1], img.shape[0]]
    if not found:
        return jsonify(faces=[], frame=frame)

    # Only this class's students can match, so a stranger in the room can't be marked present.
    roster = query(
        """SELECT u.id, u.name, u.face_embedding, a.student_id IS NOT NULL AS present
           FROM enrollments e JOIN users u ON u.id = e.student_id
           LEFT JOIN attendance a ON a.session_id = %s AND a.student_id = u.id
           WHERE e.class_id = %s AND u.face_embedding IS NOT NULL""",
        session_id, session["class_id"],
    )
    by_id = {r["id"]: r for r in roster}
    candidates = [(r["id"], r["face_embedding"]) for r in roster]
    results, seen = [], set()
    for face in found:
        student_id, score = faces.identify(faces.embed(img, face), candidates)
        entry = {"box": faces.box(face), "similarity": round(score, 3), "status": "unknown"}
        if student_id is not None and student_id not in seen:
            seen.add(student_id)
            entry["studentId"], entry["name"] = student_id, by_id[student_id]["name"]
            newly = run(
                """INSERT INTO attendance (session_id, student_id, method, similarity)
                   VALUES (%s, %s, 'face', %s) ON CONFLICT DO NOTHING""",
                session_id, student_id, score,
            )
            entry["status"] = "marked" if newly else "already"
        results.append(entry)
    return jsonify(faces=results, frame=frame)


@app.put("/api/sessions/<int:session_id>/students/<int:student_id>")
@authed("teacher")
def set_attendance(session_id, student_id):
    """Manual override. Also lets a teacher correct a session after it has ended."""
    session = own_session(session_id)
    enrolled_student(session["class_id"], student_id)
    present = body().get("present")
    if present is True:
        run("""INSERT INTO attendance (session_id, student_id, method) VALUES (%s, %s, 'manual')
               ON CONFLICT DO NOTHING""", session_id, student_id)
    elif present is False:
        run("DELETE FROM attendance WHERE session_id = %s AND student_id = %s", session_id, student_id)
    else:
        raise ApiError("present must be true or false.")
    return jsonify(ok=True)


@app.post("/api/sessions/<int:session_id>/end")
@authed("teacher")
def end_session(session_id):
    own_session(session_id)
    run("UPDATE sessions SET ended_at = now() WHERE id = %s AND ended_at IS NULL", session_id)
    return jsonify(session_payload(own_session(session_id)))


@app.delete("/api/sessions/<int:session_id>")
@authed("teacher")
def delete_session(session_id):
    own_session(session_id)
    run("DELETE FROM sessions WHERE id = %s", session_id)
    return jsonify(ok=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
