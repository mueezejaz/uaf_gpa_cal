# UAF Result Portal

A web application that fetches and displays student results from the University of Agriculture Faisalabad LMS.

## UAF Agent frontend

The GitHub Pages workflow now builds and deploys the AI chat frontend from
`frontend_agent/`. It streams requests to the deployed `uaf-agent` backend in
production and uses `http://localhost:3000/api/agent` during local development.

```bash
cd frontend_agent
npm install
npm run dev    # http://localhost:5500
npm run build  # static output in frontend_agent/dist/
```

The original result-calculator frontend remains in `frontend/` for the Flask
application in `backend/`.

## Clone the Repository

```bash
git clone https://github.com/mueezejaz/uafgpacal.git
cd uafgpacal
```

---

## Running Locally

The project has two parts: a Python backend and a JavaScript frontend. You need to run both.

To build the frontend into static files:

```bash
cd frontend
npm install
npm run build
```

The built files will be output to `frontend/dist/`. The Flask backend serves these files directly, so after building you only need to run the backend:

```bash
cd backend
python app.py
```

Then open `http://localhost:5000` in your browser.

---

## Running with Docker

If you have Docker installed, you can build and run the entire application in a single container.

```bash
docker build -t uaf-result-portal .
docker run -p 5000:5000 uaf-result-portal
```

Open `http://localhost:5000` in your browser.
