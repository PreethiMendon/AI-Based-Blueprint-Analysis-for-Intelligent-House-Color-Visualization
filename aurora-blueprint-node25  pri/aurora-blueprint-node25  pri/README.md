# AuroraBlueprint (Node v25 compatible)

This ZIP contains a full frontend + backend + python project, tuned to run on Node v25.

## Quick Start (Windows PowerShell)

### Backend
cd backend
npm install
mkdir uploads
node server.js

### Python
cd python
python -m venv venv
# activate venv:
# PowerShell: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt

### Frontend (Node v25)
cd frontend
# clean first if needed
if (Test-Path node_modules) { Remove-Item node_modules -Recurse -Force }
if (Test-Path package-lock.json) { Remove-Item package-lock.json -Force }
npm cache clean --force
npm install --force
npm run dev

Notes:
- Using --force for npm install on Node v25 to bypass strict peer dependency checks.
- If you prefer using Node LTS, install Node 18/20 and run `npm install` (without --force).
