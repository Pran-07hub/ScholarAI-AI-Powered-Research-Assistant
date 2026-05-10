@echo off
echo Starting ScholarAI Backend...
cd backend
set PYTHONPATH=.
python -m uvicorn main:app --reload --port 8000
pause
