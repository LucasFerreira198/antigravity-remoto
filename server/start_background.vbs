Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Lucas\Documents\GitHub\antigravity-remoto"
WshShell.Run """C:\Users\Lucas\AppData\Local\Programs\Python\Python314\python.exe"" ""C:\Users\Lucas\Documents\GitHub\antigravity-remoto\server\run_daemon.py""", 0, False
