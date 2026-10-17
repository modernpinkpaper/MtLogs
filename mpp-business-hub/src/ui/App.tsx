import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './hubContext';
import { Layout } from './Layout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Clock } from './pages/Clock';
import { MyWork } from './pages/MyWork';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { Review } from './pages/Review';
import { Notifications } from './pages/Notifications';
import { Journal } from './pages/Journal';
import { Resources } from './pages/Resources';
import { PrintMyStats } from './pages/PrintMyStats';
import { OwnerOverview } from './pages/OwnerOverview';
import { OwnerPrintWeekly } from './pages/OwnerPrintWeekly';
import { OwnerTeam } from './pages/OwnerTeam';
import { OwnerOtherWork } from './pages/OwnerOtherWork';
import { OwnerInsights } from './pages/OwnerInsights';
import { OwnerDataIntake } from './pages/OwnerDataIntake';
import { Settings } from './pages/Settings';
import { DemoOperations } from './pages/DemoOperations';
import { StatusPage } from './pages/StatusPage';

export function App() {
  const { uid, toasts } = useSession();
  return (
    <HashRouter>
      <a className="skip" href="#main">Skip to content</a>
      <Routes>
        <Route path="/login" element={<Login />} />
        {uid ? (
          <Route element={<Layout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/clock" element={<Clock />} />
            <Route path="/my-work" element={<MyWork />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<ProjectDetail />} />
            <Route path="/projects/:projectId/steps/:stepId" element={<ProjectDetail />} />
            <Route path="/review" element={<Review />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/print/my-stats" element={<PrintMyStats />} />
            <Route path="/owner/overview" element={<OwnerOverview />} />
            <Route path="/owner/print-weekly" element={<OwnerPrintWeekly />} />
            <Route path="/owner/team" element={<OwnerTeam />} />
            <Route path="/owner/other-work" element={<OwnerOtherWork />} />
            <Route path="/owner/insights" element={<OwnerInsights />} />
            <Route path="/owner/data-intake" element={<OwnerDataIntake />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/demo/operations" element={<DemoOperations />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
      <div className="toasts" aria-live="polite" role="status">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.msg}</div>)}
      </div>
    </HashRouter>
  );
}
