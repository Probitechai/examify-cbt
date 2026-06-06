@echo off
echo Starting Examify...
start cmd /k "cd apps/api && npm run dev"
start cmd /k "cd apps/web && npm run dev"
echo Both servers starting in separate windows!