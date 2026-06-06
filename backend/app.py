from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import re
import urllib3
import os
from collections import defaultdict

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(
    __name__,
    template_folder="../frontend/dist",
    static_folder="../frontend/dist",
    static_url_path="" 
)

CORS(app, origins=[
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://mueezejaz.github.io",
])

BASE_URL  = "https://lms.uaf.edu.pk/course/uaf_student_result.php"
LOGIN_URL = "https://lms.uaf.edu.pk/login/index.php"

@app.route("/")
def home():
    return render_template("index.html")

def _build_qp_table():
    table = {}

    t20 = [(8,1),(9,1.5),(10,2),(11,2.33),(12,2.67),(13,3),(14,3.33),(15,3.67)]
    for m in range(16,21): t20.append((m,4.0))
    table[20] = sorted(t20)

    t40 = [(16,2),(17,2.5),(18,3),(19,3.5),(20,4),(21,4.33),(22,4.67),(23,5),
           (24,5.33),(25,5.67),(26,6),(27,6.33),(28,6.67),(29,7),(30,7.33),(31,7.67)]
    for m in range(32,41): t40.append((m,8.0))
    table[40] = sorted(t40)

    t60 = [(24,3),(25,3.5),(26,4),(27,4.5),(28,5),(29,5.5),(30,6),(31,6.33),
           (32,6.67),(33,7),(34,7.33),(35,7.67),(36,8),(37,8.33),(38,8.67),
           (39,9),(40,9.33),(41,9.67),(42,10),(43,10.33),(44,10.67),(45,11),(46,11.33),(47,11.67)]
    for m in range(48,61): t60.append((m,12.0))
    table[60] = sorted(t60)

    t80 = [(32,4),(33,4.5),(34,5),(35,5.5),(36,6),(37,6.5),(38,7),(39,7.5),
           (40,8),(41,8.33),(42,8.67),(43,9),(44,9.33),(45,9.67),(46,10),
           (47,10.33),(48,10.67),(49,11),(50,11.33),(51,11.67),(52,12),(53,12.33),
           (54,12.67),(55,13),(56,13.33),(57,13.67),(58,14),(59,14.33),(60,14.67),
           (61,15),(62,15.33),(63,15.67)]
    for m in range(64,81): t80.append((m,16.0))
    table[80] = sorted(t80)

    t100 = [(40,5),(41,5.5),(42,6),(43,6.5),(44,7),(45,7.5),(46,8),(47,8.5),
            (48,9),(49,9.5),(50,10),(51,10.33),(52,10.67),(53,11),(54,11.33),
            (55,11.67),(56,12),(57,12.33),(58,12.67),(59,13),(60,13.33),(61,13.67),
            (62,14),(63,14.33),(64,14.67),(65,15),(66,15.33),(67,15.67),(68,16),
            (69,16.33),(70,16.67),(71,17),(72,17.33),(73,17.67),(74,18),(75,18.33),
            (76,18.67),(77,19),(78,19.33),(79,19.67)]
    for m in range(80,101): t100.append((m,20.0))
    table[100] = sorted(t100)

    return table

QP_TABLE = _build_qp_table()


def get_grade_from_pct(pct):
    if   pct >= 80: return "A"
    elif pct >= 65: return "B"
    elif pct >= 50: return "C"
    elif pct >= 40: return "D"
    else:           return "F"


def get_qp(obtained, max_marks):
    supported = [20, 40, 60, 80, 100]
    nearest = min(supported, key=lambda x: abs(x - max_marks))
    entries = QP_TABLE.get(nearest, [])
    qp = 0.0  
    for (mark, points) in entries:
        if obtained >= mark:
            qp = points
    return qp


def get_grade_from_qp(obtained, max_marks):
    if max_marks <= 0:
        return "F"
    pct = (obtained / max_marks) * 100
    return get_grade_from_pct(pct)


def parse_credits(ch):
    m = re.match(r"(\d+)", str(ch).strip())
    return int(m.group(1)) if m else 0


def parse_float(val):
    try:
        return float(str(val).strip())
    except (ValueError, TypeError):
        return None


def make_session():
    s = requests.Session()
    s.verify = False
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": LOGIN_URL,
    })
    return s


def get_token(session):
    resp = session.get(LOGIN_URL, verify=False, timeout=30)
    resp.raise_for_status()
    m = re.search(
        r"document\.getElementById\(['\"]token['\"]\)\.value\s*=\s*['\"]([a-f0-9]+)['\"]",
        resp.text,
    )
    if not m:
        raise ValueError("Token not found on login page")
    moodle = session.cookies.get("MoodleSession")
    if not moodle:
        raise ValueError("MoodleSession cookie missing")
    return m.group(1), moodle


def fetch_html(session, register, token):
    resp = session.post(
        BASE_URL,
        data={"token": token, "Register": register},
        timeout=30,
        allow_redirects=True,
    )
    resp.raise_for_status()
    return resp.text


def parse_html(html):
    soup = BeautifulSoup(html, "html.parser")
    student_info, courses = {}, []
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        headers = [c.get_text(strip=True) for c in rows[0].find_all(["th", "td"])]
        if "Grade" in headers or "Course Code" in headers:
            for row in rows[1:]:
                cells = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]
                if not any(cells):
                    continue
                while len(cells) < len(headers):
                    cells.append("")
                courses.append(dict(zip(headers, cells)))
        elif len(headers) == 2:
            for row in rows:
                cells = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]
                if len(cells) == 2:
                    student_info[cells[0]] = cells[1]
    return student_info, courses


def calculate_gpas(courses):
    from collections import defaultdict
    code_attempts = defaultdict(list)
    for i, c in enumerate(courses):
        code = c.get("Course Code", "").strip()
        if code:
            code_attempts[code].append(i)

    excluded_indices = set()
    for code, indices in code_attempts.items():
        if len(indices) < 2:
            continue
        for idx in indices[:-1]:  
            grade = courses[idx].get("Grade", "").strip()
            if grade in ("F", "D", ""):
                courses[idx]["_excluded"] = True
                courses[idx]["_repeat_note"] = f"Repeated in a later semester"
                excluded_indices.add(idx)

    sem_data = defaultdict(lambda: {"qp": 0.0, "cr": 0})
    total_qp, total_cr = 0.0, 0

    for i, c in enumerate(courses):
        cr = parse_credits(c.get("Credit Hours", "0"))
        if cr == 0:
            continue

        existing_grade = c.get("Grade", "").strip().upper()
        if existing_grade == "P":
            c["_computed_grade"] = "P"
            c["_qp"] = 0.0
            continue  
        if existing_grade == "F":
            c["_computed_grade"] = "F"
            c["_qp"] = 0.0
            if i not in excluded_indices:
                sem_data[c["Semester"]]["qp"] += 0.0
                sem_data[c["Semester"]]["cr"] += cr
                total_qp += 0.0
                total_cr += cr
            continue
        max_marks = cr * 20
        total_str = c.get("Total", "").strip()
        obtained = parse_float(total_str)

        if obtained is None:
            mid   = parse_float(c.get("Mid", "")) or 0
            asgn  = parse_float(c.get("Assignment", "")) or 0
            final = parse_float(c.get("Final", "")) or 0
            prac  = parse_float(c.get("Practical", "")) or 0
            obtained = mid + asgn + final + prac

        if obtained <= 0:
            continue

        qp = get_qp(obtained, max_marks)
        if qp is None:
            qp = 0.0

        grade = get_grade_from_qp(obtained, max_marks)
        c["_computed_grade"] = grade
        c["_qp"] = qp

        if i in excluded_indices:
            continue

        sem_data[c["Semester"]]["qp"] += qp
        sem_data[c["Semester"]]["cr"] += cr
        total_qp += qp
        total_cr += cr

    sem_gpas = {
        s: round(d["qp"] / d["cr"], 2)
        for s, d in sem_data.items()
        if d["cr"] > 0
    }
    cgpa = round(total_qp / total_cr, 2) if total_cr > 0 else 0.0
    return sem_gpas, cgpa, total_cr


@app.route("/api/result", methods=["POST"])
def get_result():
    print("get")
    data = request.get_json()
    register = data.get("register", "").strip()

    if not register:
        return jsonify({"error": "Registration number is required"}), 400

    if not re.match(r"^\d{4}-ag-\d+$", register, re.IGNORECASE):
        return jsonify({"error": "Invalid registration number format"}), 400

    try:
        session = make_session()
        token, moodle = get_token(session)
        session.cookies.set("MoodleSession", moodle, domain="lms.uaf.edu.pk")

        html = fetch_html(session, register, token)
        student_info, courses = parse_html(html)

        if not courses:
            return jsonify({"error": "No result found for this registration number"}), 404

        sem_gpas, cgpa, total_cr = calculate_gpas(courses)

        semesters = list(dict.fromkeys(c["Semester"] for c in courses))
        semester_list = []
        for sem in semesters:
            sem_courses = []
            for c in courses:
                if c["Semester"] != sem:
                    continue
                sem_courses.append({
                    "sr": c.get("Sr", ""),
                    "code": c.get("Course Code", ""),
                    "title": c.get("Course Title", ""),
                    "credit_hours": c.get("Credit Hours", ""),
                    "mid": c.get("Mid", ""),
                    "assignment": c.get("Assignment", ""),
                    "final": c.get("Final", ""),
                    "practical": c.get("Practical", ""),
                    "total": c.get("Total", ""),
                    "qp": round(c.get("_qp", 0.0), 2),
                    "grade": c.get("Grade", "").strip() or c.get("_computed_grade", ""),
                    "excluded": c.get("_excluded", False),          # NEW
                    "repeat_note": c.get("_repeat_note", ""),        # NEW
})
            semester_list.append({
                "name": sem,
                "courses": sem_courses,
                "gpa": sem_gpas.get(sem, 0),
            })

        return jsonify({
            "student_info": student_info,
            "semesters": semester_list,
            "cgpa": cgpa,
            "total_credit_hours": total_cr,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)