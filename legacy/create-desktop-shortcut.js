const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Create Windows Desktop Shortcut ───
// Run: node create-desktop-shortcut.js

const appDir = __dirname;
const desktopPath = path.join(os.homedir(), 'Desktop');
const shortcutPath = path.join(desktopPath, 'CLAW.lnk');

// Use VBScript to create a proper Windows .lnk shortcut
const vbsScript = `
Set WshShell = WScript.CreateObject("WScript.Shell")
Set oLink = WshShell.CreateShortcut("${shortcutPath.replace(/\\/g, '\\\\')}")
oLink.TargetPath = "${path.join(appDir, 'run.bat').replace(/\\/g, '\\\\')}"
oLink.WorkingDirectory = "${appDir.replace(/\\/g, '\\\\')}"
oLink.Description = "CLAW - Commonwealth Legal Automation Workflow"
oLink.IconLocation = "${path.join(appDir, 'dist', 'claw-logo.svg').replace(/\\/g, '\\\\')}"
oLink.WindowStyle = 1
oLink.Save
Set oLink = Nothing
Set WshShell = Nothing
WScript.Echo "Shortcut created successfully!"
`;

const vbsPath = path.join(appDir, 'create-shortcut-temp.vbs');
fs.writeFileSync(vbsPath, vbsScript, 'utf8');

const { execSync } = require('child_process');
try {
    execSync(`cscript //NoLogo "${vbsPath}"`, { stdio: 'inherit' });
    fs.unlinkSync(vbsPath);
    console.log('\nShortcut created on your Desktop: CLAW.lnk');
    console.log('You can now launch CLAW from your Desktop!');
} catch (err) {
    fs.unlinkSync(vbsPath);
    console.error('Failed to create shortcut. You can still run CLAW using run.bat');
}
