Option Explicit

Dim fso, shell, nodeFound, nodeExe, httpRequest, url, port, nodePath
Dim WshShell

' Get the script directory
Set fso = CreateObject("Scripting.FileSystemObject")
Dim scriptDir
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Create Shell object
Set shell = CreateObject("WScript.Shell")
Set WshShell = CreateObject("WScript.Shell")

' Set port from settings (should match webserver.port in settings.js)
' Read port from settings.js
Dim settingsFile, settingsContent, portMatch
Set settingsFile = fso.OpenTextFile(scriptDir & "\settings.js", 1)
settingsContent = settingsFile.ReadAll
settingsFile.Close

' Simple regex to find port number after "webserverPort:"
Set portMatch = New RegExp
portMatch.Pattern = "webserver\s*=\s*\{[^}]*webserverPort:\s*(\d+)"
portMatch.Global = False

If portMatch.Test(settingsContent) Then
    port = portMatch.Execute(settingsContent)(0).SubMatches(0)
Else
	MsgBox "Kein webserverPort definiert in settings.js", vbExclamation, "IZARchiv - Error"
    WScript.Quit
End If

' URL for version check
url = "http://localhost:" & port & "/izarchiv-version"

' Find node.exe
nodeFound = False
nodePath = ""

' Check in node* subfolders for node.exe
Dim folder, subfolder
Set folder = fso.GetFolder(scriptDir)
For Each subfolder in folder.SubFolders
    If Left(subfolder.Name, 4) = "node" Then
        If fso.FileExists(subfolder.Path & "\node.exe") Then
            nodePath = subfolder.Path & "\node.exe"
            nodeFound = True
            Exit For
        End If
    End If
Next

' Check if node was found
If Not nodeFound Then
    MsgBox "NodeJS Ordner nicht gefunden. Bitte installieren Sie NodeJS in einem 'node*' Ordner um IZARchiv zu starten.", vbExclamation, "IZARchiv - Error"
    WScript.Quit
End If

' Check if server is already running
On Error Resume Next
Set httpRequest = CreateObject("MSXML2.XMLHTTP")
httpRequest.open "GET", url, False
httpRequest.send

If httpRequest.status = 200 Then
    Dim response
    response = httpRequest.responseText
    
    If Left(response, 8) <> "IZARchiv" Then
        MsgBox "Port " & port & " ist bereits von einer anderen Anwendung belegt! IZARchiv kann nicht gestartet werden.", vbExclamation, "IZARchiv - Error"
		WScript.Quit
    End If
    
    ' Open browser anyway
    shell.Run "http://localhost:" & port, 1, False
    WScript.Quit
End If
On Error Goto 0

' Start the Node.js server
Dim indexPath
indexPath = fso.BuildPath(scriptDir, "index.js")

' Run node with index.js as a sibling process
shell.Run """" & nodePath & """ """ & indexPath & """", 0, False

' Wait a bit for the server to start
WScript.Sleep 1000

' Open browser
shell.Run "http://localhost:" & port, 1, False

' Exit script
WScript.Quit 