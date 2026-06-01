import { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { useProjectStore } from './store/projectStore';
import SplashScreen from './components/SplashScreen';
import EditorLayout from './components/EditorLayout';
import Dashboard from './components/Dashboard';
import { registerGlobalShortcuts } from './engine/KeyboardShortcuts';
import ShortcutsModal from './components/ShortcutsModal';
import './App.css';

export default function App() {
  const { user, session, isLoading, initialize } = useAuthStore();
  const { loadProjects } = useProjectStore();
  const { currentProject } = useProjectStore();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Initialize auth
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Auto-detect session
  useEffect(() => {
    if (session && user) {
      setIsAuthenticated(true);
    }
  }, [session, user]);

  // Load projects after auth
  useEffect(() => {
    if (!isAuthenticated) return;
    loadProjects();
  }, [isAuthenticated, loadProjects]);

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    if (!isAuthenticated || !currentProject) return;

    const cleanup = registerGlobalShortcuts(() => {
      setShowShortcutsHelp(true);
    });
    return cleanup;
  }, [isAuthenticated, currentProject]);

  // ── Loading ──
  if (isLoading && !session) {
    return (
      <div className="app-loading">
        <div className="spinner lg" />
      </div>
    );
  }

  // ── Auth Gate ──
  if (!isAuthenticated) {
    return <SplashScreen onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return (
    <>
      {currentProject ? <EditorLayout /> : <Dashboard />}
      {showShortcutsHelp && (
        <ShortcutsModal onClose={() => setShowShortcutsHelp(false)} />
      )}
    </>
  );
}
