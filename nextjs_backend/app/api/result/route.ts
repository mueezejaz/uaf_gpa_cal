process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

const BASE_URL = "https://lms.uaf.edu.pk/course/uaf_student_result.php";
const LOGIN_URL = "https://lms.uaf.edu.pk/login/index.php";

const ALLOWED_ORIGINS = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://mueezejaz.github.io",
];

function corsHeaders(req: NextRequest): Record<string, string> {
    const origin = req.headers.get("origin") ?? "";
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

export async function OPTIONS(req: NextRequest) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

type QpEntry = [number, number];
type QpTable = Record<number, QpEntry[]>;

function buildQpTable(): QpTable {
    const table: QpTable = {};

    const t20: QpEntry[] = [
        [8, 1], [9, 1.5], [10, 2], [11, 2.33], [12, 2.67], [13, 3], [14, 3.33], [15, 3.67],
    ];
    for (let m = 16; m <= 20; m++) t20.push([m, 4.0]);
    table[20] = t20;

    const t40: QpEntry[] = [
        [16, 2], [17, 2.5], [18, 3], [19, 3.5], [20, 4], [21, 4.33], [22, 4.67], [23, 5],
        [24, 5.33], [25, 5.67], [26, 6], [27, 6.33], [28, 6.67], [29, 7], [30, 7.33], [31, 7.67],
    ];
    for (let m = 32; m <= 40; m++) t40.push([m, 8.0]);
    table[40] = t40;

    const t60: QpEntry[] = [
        [24, 3], [25, 3.5], [26, 4], [27, 4.5], [28, 5], [29, 5.5], [30, 6], [31, 6.33],
        [32, 6.67], [33, 7], [34, 7.33], [35, 7.67], [36, 8], [37, 8.33], [38, 8.67],
        [39, 9], [40, 9.33], [41, 9.67], [42, 10], [43, 10.33], [44, 10.67], [45, 11], [46, 11.33], [47, 11.67],
    ];
    for (let m = 48; m <= 60; m++) t60.push([m, 12.0]);
    table[60] = t60;

    const t80: QpEntry[] = [
        [32, 4], [33, 4.5], [34, 5], [35, 5.5], [36, 6], [37, 6.5], [38, 7], [39, 7.5],
        [40, 8], [41, 8.33], [42, 8.67], [43, 9], [44, 9.33], [45, 9.67], [46, 10],
        [47, 10.33], [48, 10.67], [49, 11], [50, 11.33], [51, 11.67], [52, 12], [53, 12.33],
        [54, 12.67], [55, 13], [56, 13.33], [57, 13.67], [58, 14], [59, 14.33], [60, 14.67],
        [61, 15], [62, 15.33], [63, 15.67],
    ];
    for (let m = 64; m <= 80; m++) t80.push([m, 16.0]);
    table[80] = t80;

    const t100: QpEntry[] = [
        [40, 5], [41, 5.5], [42, 6], [43, 6.5], [44, 7], [45, 7.5], [46, 8], [47, 8.5],
        [48, 9], [49, 9.5], [50, 10], [51, 10.33], [52, 10.67], [53, 11], [54, 11.33],
        [55, 11.67], [56, 12], [57, 12.33], [58, 12.67], [59, 13], [60, 13.33], [61, 13.67],
        [62, 14], [63, 14.33], [64, 14.67], [65, 15], [66, 15.33], [67, 15.67], [68, 16],
        [69, 16.33], [70, 16.67], [71, 17], [72, 17.33], [73, 17.67], [74, 18], [75, 18.33],
        [76, 18.67], [77, 19], [78, 19.33], [79, 19.67],
    ];
    for (let m = 80; m <= 100; m++) t100.push([m, 20.0]);
    table[100] = t100;

    return table;
}

const QP_TABLE = buildQpTable();

function getGradeFromPct(pct: number): string {
    if (pct >= 80) return "A";
    if (pct >= 65) return "B";
    if (pct >= 50) return "C";
    if (pct >= 40) return "D";
    return "F";
}

function getQp(obtained: number, maxMarks: number): number {
    const supported = [20, 40, 60, 80, 100];
    const nearest = supported.reduce((prev, curr) =>
        Math.abs(curr - maxMarks) < Math.abs(prev - maxMarks) ? curr : prev
    );
    const entries = QP_TABLE[nearest] ?? [];
    let qp = 0.0;
    for (const [mark, points] of entries) {
        if (obtained >= mark) qp = points;
    }
    return qp;
}

function getGradeFromQp(obtained: number, maxMarks: number): string {
    if (maxMarks <= 0) return "F";
    return getGradeFromPct((obtained / maxMarks) * 100);
}

function parseCredits(ch: string): number {
    const m = String(ch).trim().match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
}

function parseFloat_(val: string | undefined): number | null {
    if (val === undefined || val === null) return null;
    const n = parseFloat(String(val).trim());
    return isNaN(n) ? null : n;
}

function semesterSortKey(semName: string): [number, number] {
    const lower = semName.toLowerCase();
    const season = lower.includes("spring") ? 1 : lower.includes("fall") ? 2 : 0;
    const rangeMatch = semName.match(/(\d{4})-(\d{2,4})/);
    let year = 0;
    if (rangeMatch) {
        const startYear = parseInt(rangeMatch[1], 10);
        const endPart = rangeMatch[2];
        year = endPart.length === 2
            ? parseInt(String(startYear).slice(0, 2) + endPart, 10)
            : parseInt(endPart, 10);
    } else {
        const single = semName.match(/(\d{4})/);
        year = single ? parseInt(single[1], 10) : 0;
    }
    return [year, season];
}

function buildCookieHeader(jar: Map<string, string>): string {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function getToken(cookieJar: Map<string, string>): Promise<{ token: string; moodleSession: string }> {
    const resp = await fetch(LOGIN_URL, { method: "GET", redirect: "follow" });
    if (!resp.ok) throw new Error(`Login page fetch failed: ${resp.status}`);

    const setCookie = resp.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookie) {
        const [pair] = cookie.split(";");
        const [key, value] = pair.split("=");
        if (key && value) cookieJar.set(key.trim(), value.trim());
    }

    const html = await resp.text();

    const tokenMatch =
        html.match(/document\.getElementById\(['"](logintoken|token)['"]\)\.value\s*=\s*['"]([a-f0-9]+)['"]/) ??
        html.match(/name="logintoken"\s+value="([a-f0-9]+)"/) ??
        html.match(/<input[^>]+name="logintoken"[^>]+value="([a-f0-9]+)"/) ??
        html.match(/value="([a-f0-9]{32,})"/);

    if (!tokenMatch) throw new Error("Token not found on login page");
    const token = tokenMatch[tokenMatch.length - 1];

    const moodleSession = cookieJar.get("MoodleSession");
    if (!moodleSession) throw new Error("MoodleSession cookie missing");

    return { token, moodleSession };
}

async function fetchResultHtml(
    register: string,
    token: string,
    cookieJar: Map<string, string>
): Promise<string> {
    const body = new URLSearchParams({ token, Register: register });
    const resp = await fetch(BASE_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Referer: LOGIN_URL,
            Cookie: buildCookieHeader(cookieJar),
        },
        body: body.toString(),
        redirect: "follow",
    });
    if (!resp.ok) throw new Error(`Result fetch failed: ${resp.status}`);
    return resp.text();
}

type CourseRow = Record<string, string> & {
    _excluded?: boolean;
    _repeat_note?: string;
    _computed_grade?: string;
    _qp?: number;
};

function parseHtml(html: string): { studentInfo: Record<string, string>; courses: CourseRow[] } {
    const $ = cheerio.load(html);
    const studentInfo: Record<string, string> = {};
    const courses: CourseRow[] = [];

    $("table").each((_, table) => {
        const rows = $(table).find("tr").toArray();
        if (rows.length < 2) return;

        const headers = $(rows[0])
            .find("th, td")
            .toArray()
            .map((el) => $(el).text().trim());

        if (headers.includes("Grade") || headers.includes("Course Code")) {
            rows.slice(1).forEach((row) => {
                const cells = $(row).find("th, td").toArray().map((el) => $(el).text().trim());
                if (!cells.some(Boolean)) return;
                while (cells.length < headers.length) cells.push("");
                const entry: CourseRow = {};
                headers.forEach((h, i) => (entry[h] = cells[i] ?? ""));
                courses.push(entry);
            });
        } else if (headers.length === 2) {
            rows.forEach((row) => {
                const cells = $(row).find("th, td").toArray().map((el) => $(el).text().trim());
                if (cells.length === 2) studentInfo[cells[0]] = cells[1];
            });
        }
    });

    return { studentInfo, courses };
}

function calculateGpas(courses: CourseRow[]): {
    semGpas: Record<string, number>;
    cgpa: number;
    totalCr: number;
} {
    const codeAttempts = new Map<string, number[]>();
    courses.forEach((c, i) => {
        const code = (c["Course Code"] ?? "").trim();
        if (!code) return;
        if (!codeAttempts.has(code)) codeAttempts.set(code, []);
        codeAttempts.get(code)!.push(i);
    });

    const excludedIndices = new Set<number>();
    for (const [, indices] of codeAttempts) {
        if (indices.length < 2) continue;
        indices.slice(0, -1).forEach((idx) => {
            const grade = (courses[idx]["Grade"] ?? "").trim();
            if (grade === "F" || grade === "D" || grade === "") {
                courses[idx]._excluded = true;
                courses[idx]._repeat_note = "Repeated in a later semester";
                excludedIndices.add(idx);
            }
        });
    }

    const semData = new Map<string, { qp: number; cr: number }>();
    let totalQp = 0.0;
    let totalCr = 0;

    courses.forEach((c, i) => {
        const cr = parseCredits(c["Credit Hours"] ?? "0");
        if (cr === 0) return;

        const existingGrade = (c["Grade"] ?? "").trim().toUpperCase();

        if (existingGrade === "P") {
            c._computed_grade = "P";
            c._qp = 0.0;
            return;
        }

        if (existingGrade === "F") {
            c._computed_grade = "F";
            c._qp = 0.0;
            if (!excludedIndices.has(i)) {
                const sem = c["Semester"];
                if (!semData.has(sem)) semData.set(sem, { qp: 0, cr: 0 });
                semData.get(sem)!.cr += cr;
                totalCr += cr;
            }
            return;
        }

        const maxMarks = cr * 20;
        let obtained = parseFloat_(c["Total"] ?? "");

        if (obtained === null) {
            const mid = parseFloat_(c["Mid"]) ?? 0;
            const asgn = parseFloat_(c["Assignment"]) ?? 0;
            const final = parseFloat_(c["Final"]) ?? 0;
            const prac = parseFloat_(c["Practical"]) ?? 0;
            obtained = mid + asgn + final + prac;
        }

        if (obtained <= 0) return;

        const qp = getQp(obtained, maxMarks);
        const grade = getGradeFromQp(obtained, maxMarks);
        c._computed_grade = grade;
        c._qp = qp;

        if (excludedIndices.has(i)) return;

        const sem = c["Semester"];
        if (!semData.has(sem)) semData.set(sem, { qp: 0, cr: 0 });
        semData.get(sem)!.qp += qp;
        semData.get(sem)!.cr += cr;
        totalQp += qp;
        totalCr += cr;
    });

    const semGpas: Record<string, number> = {};
    for (const [sem, d] of semData) {
        if (d.cr > 0) semGpas[sem] = Math.round((d.qp / d.cr) * 100) / 100;
    }

    const cgpa = totalCr > 0 ? Math.round((totalQp / totalCr) * 100) / 100 : 0.0;
    return { semGpas, cgpa, totalCr };
}

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    const register: string = (body.register ?? "").trim();

    if (!register) {
        return NextResponse.json(
            { error: "Registration number is required" },
            { status: 400, headers: corsHeaders(req) }
        );
    }

    if (!/^\d{4}-ag-\d+$/i.test(register)) {
        return NextResponse.json(
            { error: "Invalid registration number format" },
            { status: 400, headers: corsHeaders(req) }
        );
    }

    try {
        const cookieJar = new Map<string, string>();
        const { token, moodleSession } = await getToken(cookieJar);
        cookieJar.set("MoodleSession", moodleSession);

        const html = await fetchResultHtml(register, token, cookieJar);
        const { studentInfo, courses } = parseHtml(html);

        if (courses.length === 0) {
            return NextResponse.json(
                { error: "No result found for this registration number" },
                { status: 404, headers: corsHeaders(req) }
            );
        }

        const { semGpas, cgpa, totalCr } = calculateGpas(courses);

        const semesterOrder = [...new Map(courses.map((c) => [c["Semester"], true])).keys()];
        semesterOrder.sort((a, b) => {
            const [ay, as_] = semesterSortKey(a);
            const [by, bs] = semesterSortKey(b);
            return by !== ay ? by - ay : bs - as_;
        });

        const semesterList = semesterOrder.map((sem) => ({
            name: sem,
            gpa: semGpas[sem] ?? 0,
            courses: courses
                .filter((c) => c["Semester"] === sem)
                .map((c) => ({
                    sr: c["Sr"] ?? "",
                    code: c["Course Code"] ?? "",
                    title: c["Course Title"] ?? "",
                    credit_hours: c["Credit Hours"] ?? "",
                    mid: c["Mid"] ?? "",
                    assignment: c["Assignment"] ?? "",
                    final: c["Final"] ?? "",
                    practical: c["Practical"] ?? "",
                    total: c["Total"] ?? "",
                    qp: Math.round((c._qp ?? 0) * 100) / 100,
                    grade: (c["Grade"] ?? "").trim() || (c._computed_grade ?? ""),
                    excluded: c._excluded ?? false,
                    repeat_note: c._repeat_note ?? "",
                })),
        }));

        return NextResponse.json(
            { student_info: studentInfo, semesters: semesterList, cgpa, total_credit_hours: totalCr },
            { headers: corsHeaders(req) }
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
            { error: message },
            { status: 500, headers: corsHeaders(req) }
        );
    }
}