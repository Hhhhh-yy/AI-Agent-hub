' ============================================================
'  Hidden launcher: no console window, logs to state\server.log
'  Double-click to start the hub in the background.
'  Does NOT run at boot. Does NOT open a browser.
'  Then open http://127.0.0.1:8787/ yourself.
' ============================================================
Option Explicit
Dim fso, sh, here
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
' 0 = hidden window, False = do not wait
sh.Run "cmd /c """ & here & "\launch-lan.cmd""", 0, False