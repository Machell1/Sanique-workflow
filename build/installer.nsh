; Custom NSIS hooks for Sanique's workspace.

!macro customHeader
  RequestExecutionLevel user
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\Sanique\Workspace" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\Sanique\Workspace" "Version" "${VERSION}"
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Sanique\Workspace"
!macroend

!macro customWelcomePage
!macroend
