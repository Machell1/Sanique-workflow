; CLAW custom NSIS hooks
; Brand the installer with Court of Appeal styling.

!macro customHeader
  RequestExecutionLevel user
!macroend

!macro customInstall
  ; Register the application in the Windows registry for clean uninstall
  WriteRegStr HKCU "Software\\CourtOfAppealJamaica\\CLAW" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\\CourtOfAppealJamaica\\CLAW" "Version" "${VERSION}"
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\\CourtOfAppealJamaica\\CLAW"
!macroend

!macro customWelcomePage
  ; Default welcome page with our branding is fine
!macroend
