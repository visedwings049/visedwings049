; Inno Setup script - build with: ISCC installer.iss  (or run build_installer.bat)
[Setup]
AppName=JFFJ Card Generator
AppVersion=1.0
AppPublisher=Slumber Realms
DefaultDirName={autopf}\JFFJ
DefaultGroupName=JFFJ
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=installer
OutputBaseFilename=JFFJ_Setup
SetupIconFile=assets\jffj.ico
UninstallDisplayIcon={app}\JFFJ.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "dist\JFFJ\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
; settings (Gmail app password, watch folder); only written if missing, so a reinstall/update
; never wipes out a password someone already entered through the app itself
Source: ".env"; DestDir: "{userdocs}\JFFJ"; Flags: onlyifdoesntexist uninsneveruninstall

[Icons]
Name: "{group}\JFFJ Card Generator"; Filename: "{app}\JFFJ.exe"; IconFilename: "{app}\JFFJ.exe"
Name: "{autodesktop}\JFFJ Card Generator"; Filename: "{app}\JFFJ.exe"; IconFilename: "{app}\JFFJ.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\JFFJ.exe"; Description: "Launch JFFJ Card Generator"; Flags: nowait postinstall skipifsilent

[Code]
function InitializeSetup(): Boolean;
var
  LibraryDir, BackupDir: string;
begin
  Result := True;
  LibraryDir := ExpandConstant('{userdocs}\JFFJ\Library');
  if DirExists(LibraryDir) then
  begin
    BackupDir := ExpandConstant('{userdocs}\JFFJ\Library_Backup_') + GetDateTimeString('yyyymmdd_hhnnss', #0, #0);
    RenameFile(LibraryDir, BackupDir);
  end;
end;
