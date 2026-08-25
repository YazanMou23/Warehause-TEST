' LogiFlow Windows Printer Connector — Silent Background Runner
' Runs the connector without showing a command prompt or terminal window.
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
strLocalNode = strScriptDir & "\node.exe"
strProgramFilesNode = "C:\Program Files\nodejs\node.exe"
strProgramFiles86Node = "C:\Program Files (x86)\nodejs\node.exe"

If fso.FileExists(strLocalNode) Then
    strNode = """" & strLocalNode & """"
ElseIf fso.FileExists(strProgramFilesNode) Then
    strNode = """" & strProgramFilesNode & """"
ElseIf fso.FileExists(strProgramFiles86Node) Then
    strNode = """" & strProgramFiles86Node & """"
Else
    strNode = "node.exe"
End If

strCommand = strNode & " """ & strScriptDir & "\index.js"""

' 0 = Hide window, False = don't wait for return
WshShell.Run strCommand, 0, False
