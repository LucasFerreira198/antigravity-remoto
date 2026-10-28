Set FSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
RepoDir = FSO.GetParentFolderName(ScriptDir)
WshShell.CurrentDirectory = RepoDir
WshShell.Run "pythonw.exe """ & RepoDir & "\server\run_daemon.py""", 0, False
