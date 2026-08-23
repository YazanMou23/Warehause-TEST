' LogiFlow Windows Printer Connector — Silent Background Runner
' Runs the connector without showing a command prompt or terminal window.
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
strCommand = "node """ & strScriptDir & "\index.js"""

' 0 = Hide window, False = don't wait for return
WshShell.Run strCommand, 0, False
