import "./styles.css";

const API_URL = "https://uaf-gpa-cal.vercel.app/api/result"; // change this to "/api/result for running it localy"

function getGpaClass(gpa) {
  if (gpa >= 3.5) return "gpa-a";
  if (gpa >= 2.5) return "gpa-b";
  if (gpa >= 1.5) return "gpa-c";
  if (gpa >= 1.0) return "gpa-d";
  return "gpa-f";
}

function getGpaBarColor(gpa) {
  if (gpa >= 3.5) return "var(--grade-a)";
  if (gpa >= 2.5) return "var(--grade-b)";
  if (gpa >= 1.5) return "var(--grade-c)";
  if (gpa >= 1.0) return "var(--grade-d)";
  return "var(--grade-f)";
}

function renderStudentCard(info) {
  const fields = Object.entries(info);
  if (!fields.length) return "";
  return `
    <div class="student-card">
      ${fields.map(([k, v]) => `
        <div class="student-card-field">
          <div class="student-card-key">${k}</div>
          <div class="student-card-val">${v}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCourseRow(course) {
  const grade = course.grade || "";
  const gradeClass = `grade-${grade.toUpperCase()}`;
  const isExcluded = course.excluded;

  return `
    <tr class="${isExcluded ? 'row-excluded' : ''}">
      <td class="code">${course.code}</td>
      <td>
        ${course.title}
        ${isExcluded
      ? `<span class="repeat-badge" title="${course.repeat_note}">Repeated later — excluded from GPA</span>`
      : ''}
      </td>
      <td class="num center">${course.credit_hours}</td>
      <td class="num">${course.mid}</td>
      <td class="num">${course.assignment}</td>
      <td class="num">${course.final}</td>
      <td class="num">${course.practical}</td>
      <td class="num">${course.total}</td>
      <td class="num">${isExcluded ? '—' : (course.qp != null ? course.qp : "")}</td>
      <td class="center">
        <span class="grade-chip ${gradeClass}">${grade || "-"}</span>
      </td>
    </tr>
  `;
}

function renderSemester(sem) {
  const gpaClass = getGpaClass(sem.gpa);
  return `
    <div class="semester-block fade-in">
      <div class="semester-heading">
        <span class="semester-name">${sem.name}</span>
        <span class="semester-gpa-tag">GPA&nbsp;</span>
        <span class="semester-gpa-val ${gpaClass}">${sem.gpa.toFixed(2)}</span>
      </div>
      <div class="table-responsive">
          <table class="courses-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Course Title</th>
                <th class="center">CH</th>
                <th class="num">Mid</th>
                <th class="num">Asgn</th>
                <th class="num">Final</th>
                <th class="num">Prac</th>
                <th class="num">Total</th>
                <th class="num">QP</th>
                <th class="center">Grade</th>
              </tr>
            </thead>
            <tbody>
              ${sem.courses.map(renderCourseRow).join("")}
            </tbody>
          </table>
      </div>
    </div>
  `;
}

function renderCgpaSection(data) {
  const cgpaClass = getGpaClass(data.cgpa);
  const semGpaRows = data.semesters.map(sem => {
    const pct = Math.min((sem.gpa / 4.0) * 100, 100);
    const color = getGpaBarColor(sem.gpa);
    const gpaClass = getGpaClass(sem.gpa);
    return `
      <div class="sem-gpa-item">
        <span class="sem-gpa-name">${sem.name}</span>
        <div class="sem-gpa-bar-track">
          <div class="sem-gpa-bar-fill" style="width: ${pct}%; background: ${color};"></div>
        </div>
        <span class="sem-gpa-num ${gpaClass}">${sem.gpa.toFixed(2)}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="cgpa-section fade-in">
      <div>
        <div class="cgpa-label">Cumulative GPA</div>
        <div>
          <span class="cgpa-value ${cgpaClass}">${data.cgpa.toFixed(2)}</span>
          <span class="cgpa-scale">/ 4.00</span>
        </div>
      </div>
      <div class="cgpa-meta">
        <div class="cgpa-meta-item">
          <span class="cgpa-meta-key">Credit Hours</span>
          <span class="cgpa-meta-val">${data.total_credit_hours}</span>
        </div>
        <div class="cgpa-meta-item">
          <span class="cgpa-meta-key">Semesters</span>
          <span class="cgpa-meta-val">${data.semesters.length}</span>
        </div>
      </div>
      <div class="sem-gpa-row">
        ${semGpaRows}
      </div>
    </div>
  `;
}

function showResult(data) {
  const page = document.getElementById("result-page");
  const body = document.getElementById("result-body");

  body.innerHTML = `
    ${renderStudentCard(data.student_info)}
    ${data.semesters.map(renderSemester).join("")}
    ${renderCgpaSection(data)}
  `;

  document.getElementById("landing-page").classList.remove("active");
  page.classList.add("active");
  window.scrollTo(0, 0);
}

function showLanding() {
  document.getElementById("result-page").classList.remove("active");
  document.getElementById("landing-page").classList.add("active");

  const yearInput = document.getElementById("reg-year");
  if (yearInput) yearInput.focus();
}

function showError(msg) {
  const el = document.getElementById("error-msg");
  el.textContent = msg;
  el.classList.add("visible");
}

function clearError() {
  const el = document.getElementById("error-msg");
  el.classList.remove("visible");
}

function setLoading(on) {
  const btn = document.getElementById("submit-btn");
  btn.classList.toggle("loading", on);
  btn.disabled = on;
  if (!on) {
    btn.innerText = "Retrieve Result";
  }
}

async function submitForm() {
  clearError();
  const yearInput = document.getElementById("reg-year").value.trim();
  const numInput = document.getElementById("reg-num").value.trim();

  if (yearInput.length !== 4) {
    showError("Enter a valid 4-digit year");
    return;
  }

  if (!numInput) {
    showError("Enter the student number after -ag-");
    return;
  }

  const register = `${yearInput}-ag-${numInput}`;

  setLoading(true);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ register }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Failed to fetch result");
      return;
    }

    showResult(data);
  } catch {
    showError("Connection failed. Please try again.");
  } finally {
    setLoading(false);
  }
}

function buildLanding() {
  const page = document.getElementById("landing-page");
  page.innerHTML = `
    <div class="landing-bg"></div>
    <div class="grain-overlay"></div>
    <div class="landing-inner">
      <div class="university-mark">
        <div class="mark-rule"></div>
        <div class="mark-initials">University of Agriculture Faisalabad</div>
        <div class="mark-title">Result Portal</div>
        <div class="mark-subtitle">made by team mh</div>
      </div>
      <div class="input-container">
        <div class="input-label">Registration Number</div>
        <div class="reg-input-wrapper" id="reg-wrapper">
          <span id="year-mirror" class="reg-mirror"></span>
          <input
            id="reg-year"
            class="reg-input-yr"
            type="text"
            inputmode="numeric"
            placeholder="0000"
            maxlength="4"
            autocomplete="off"
            spellcheck="false"
          />
          <div class="reg-separator">-ag-</div>
          <input
            id="reg-num"
            class="reg-input-num"
            type="text"
            inputmode="numeric"
            placeholder="0000"
            maxlength="8"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div class="input-hint">e.g. 2024-ag-8952</div>
        <div id="error-msg" class="error-msg"></div>
        <button id="submit-btn" class="submit-btn" disabled>
          Retrieve Result
        </button>
      </div>
    </div>
  `;

  const yearInput = document.getElementById("reg-year");
  const numInput = document.getElementById("reg-num");
  const yearMirror = document.getElementById("year-mirror");
  const btn = document.getElementById("submit-btn");
  const regWrapper = document.getElementById("reg-wrapper");

  function updateButtonState() {
    btn.disabled = yearInput.value.length !== 4 || numInput.value.trim().length === 0;
  }

  function syncYearWidth() {
    yearMirror.textContent = yearInput.value || yearInput.placeholder;
    yearInput.style.width = `${yearMirror.getBoundingClientRect().width}px`;
  }

  yearInput.addEventListener("input", function () {
    this.value = this.value.replace(/\D/g, "");
    syncYearWidth();
    if (this.value.length === 4) {
      numInput.focus();
    }
    updateButtonState();
    clearError();
  });

  numInput.addEventListener("input", function () {
    this.value = this.value.replace(/\D/g, "");
    updateButtonState();
    clearError();
  });

  yearInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && yearInput.value.length === 4 && numInput.value.trim().length > 0) {
      submitForm();
    }
  });

  numInput.addEventListener("keydown", function (e) {
    if (e.key === "Backspace" && this.value === "") {
      yearInput.focus();
    }
    if (e.key === "Enter" && yearInput.value.length === 4 && this.value.trim().length > 0) {
      submitForm();
    }
  });

  regWrapper.addEventListener("click", function (e) {
    clearError();
    if (e.target === numInput) return;
    if (yearInput.value.length < 4) {
      yearInput.focus();
    } else {
      numInput.focus();
    }
  });

  btn.addEventListener("click", submitForm);

  // Initial Sync
  setTimeout(syncYearWidth, 0);
  yearInput.focus();
}

function buildResultPage() {
  const page = document.getElementById("result-page");
  page.innerHTML = `
    <div class="result-header">
      <span class="result-header-brand">UAF Result Portal</span>
      <button class="back-btn" id="back-btn">Back</button>
    </div>
    <div class="result-body" id="result-body"></div>
  `;

  document.getElementById("back-btn").addEventListener("click", showLanding);
}

function init() {
  const root = document.getElementById("app");
  root.innerHTML = `
    <div id="landing-page" class="page active"></div>
    <div id="result-page" class="page"></div>
  `;

  buildLanding();
  buildResultPage();
}

document.addEventListener("DOMContentLoaded", init);