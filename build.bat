@echo off
go build -mod=vendor -trimpath -ldflags "-s -w -H windowsgui" -o UpupuCalc.exe .
if errorlevel 1 (echo Build failed & pause) else (echo Done: UpupuCalc.exe)
