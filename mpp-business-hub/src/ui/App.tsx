import { useMe } from './hubContext';
import { OwnerOnly } from './guard';
import { Errors } from './pages/Errors';
import { PrintVerification } from './pages/PrintVerification';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './hubContext';
import { Layout } from './Layout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Clock } from './pages/Clock';
import { EmployeeHome } from './pages/EmployeeHome';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { Review } from './pages/Review';
import { Notifications } from './pages/Notifications';
import { Journal } from './pages/Journal';
import { Resources } from './pages/Resources';
import { PrintMyStats } from './pages/PrintMyStats';
import { OwnerOverview } from './pages/OwnerOverview';
import { TeamPrint } from './pages/TeamPrint';
import { OwnerAI, FindingDetail } from './pages/OwnerAI';
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
            <Route path="/my-work" element={<EmployeeHome />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<ProjectDetail />} />
            <Route path="/projects/:projectId/steps/:stepId" element={<ProjectDetail />} />
            <Route path="/review" element={<Review />} />
            <Route path="/notifications" element={<Navigate to="/home" replace />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/errors" element={<ErrorsRoute />} />
            <Route path="/print-verification" element={<PrintVerificationRoute />} />
            <Route path="/print/my-stats" element={<PrintMyStats />} />
            {/* Owner screens. Old addresses still work and send you to the new place. */}
            <Route path="/owner/overview" element={<Navigate to="/home" replace />} />
            <Route path="/owner/ai" element={<OwnerOnly><OwnerAI /></OwnerOnly>} />
            <Route path="/owner/ai/:id" element={<OwnerOnly><FindingDetail /></OwnerOnly>} />
            <Route path="/owner/team" element={<OwnerOnly><TeamPrint /></OwnerOnly>} />
            <Route path="/owner/print-weekly" element={<Navigate to="/owner/team?tab=print" replace />} />
            <Route path="/owner/other-work" element={<Navigate to="/owner/team?tab=other" replace />} />
            <Route path="/owner/insights" element={<Navigate to="/owner/team?tab=ideas" replace />} />
            <Route path="/owner/data-intake" element={<OwnerOnly><OwnerDataIntake /></OwnerOnly>} />
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

/** Customer service people use /errors. Dalia sees the same screen as a tab inside Team & Print. */
function ErrorsRoute() {
  const { me } = useMe();
  return me.role === 'OWNER' ? <Navigate to="/owner/team?tab=errors" replace /> : <Errors />;
}

/** Customer service people use /print-verification. Dalia sees it as a tab in Team & Print. */
function PrintVerificationRoute() {
  const { me } = useMe();
  return me.role === 'OWNER' ? <Navigate to="/owner/team?tab=verify" replace /> : <PrintVerification />;
}
