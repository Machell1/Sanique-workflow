import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { Schedule } from './pages/Schedule';
import { UploadPage } from './pages/Upload';
import { FileCabinet } from './pages/FileCabinet';
import { Agent } from './pages/Agent';
import { Verification } from './pages/Verification';
import { Workflow } from './pages/Workflow';
import { Generator } from './pages/Generator';
import { Audit } from './pages/Audit';
import { Settings } from './pages/Settings';
import { GlobalSearch } from './pages/Search';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="cabinet" element={<FileCabinet />} />
        <Route path="agent" element={<Agent />} />
        <Route path="verification" element={<Verification />} />
        <Route path="workflow" element={<Workflow />} />
        <Route path="generator" element={<Generator />} />
        <Route path="audit" element={<Audit />} />
        <Route path="search" element={<GlobalSearch />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
