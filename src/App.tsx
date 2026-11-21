import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './lib/firebase';
import { LandingPage } from './components/LandingPage';
import { AuthModal } from './components/AuthModal';
import { UserDashboard } from './components/UserDashboard';
import { UpgradeModal } from './components/UpgradeModal';
import { AdminPortal } from './components/AdminPortal';
import type { UserProfile } from './types';

export default function App() {
  const [route, setRoute] = useState<'landing' | 'dashboard' | 'admin'>(() => {
    if (window.location.pathname.startsWith('/admin')) return 'admin';
    return 'landing';
  });

  const [user, setUser] = useState<UserProfile | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  // Sync URL navigation cleanly
  const navigateTo = (target: 'landing' | 'dashboard' | 'admin') => {
    setRoute(target);
    const nextPath = target === 'admin' ? '/admin' : '/';
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  };

  useEffect(() => {
    const handlePop = () => {
      if (window.location.pathname.startsWith('/admin')) {
        setRoute('admin');
      } else {
        setRoute((prev) => (prev === 'admin' ? (user ? 'dashboard' : 'landing') : prev));
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [user]);

  // Restore Firebase Google session if already signed in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && !authToken) {
        try {
          const idToken = await fbUser.getIdToken();
          const resp = await fetch('/api/auth/sync-google', {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (resp.ok) {
            const data = await resp.json();
            setUser(data.user);
            setAuthToken(idToken);
          }
        } catch {
          // ignore silent sync error
        }
      }
    });
    return () => unsub();
  }, [authToken]);

  const handleAuthSuccess = (loggedUser: UserProfile, token: string) => {
    setUser(loggedUser);
    setAuthToken(token);
    setRoute('dashboard');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    setUser(null);
    setAuthToken(null);
    navigateTo('landing');
  };

  if (route === 'admin') {
    return <AdminPortal onExitAdmin={() => navigateTo(user ? 'dashboard' : 'landing')} />;
  }

  if (route === 'dashboard' && user && authToken) {
    return (
      <>
        <UserDashboard
          user={user}
          authToken={authToken}
          onUserUpdated={setUser}
          onOpenUpgrade={() => setUpgradeModalOpen(true)}
          onLogout={handleLogout}
          onBackToLanding={() => navigateTo('landing')}
          onOpenAdmin={() => navigateTo('admin')}
        />
        <UpgradeModal
          open={upgradeModalOpen}
          currentPlan={user.plan}
          authToken={authToken}
          onClose={() => setUpgradeModalOpen(false)}
          onUpgraded={(updatedUser) => setUser(updatedUser)}
        />
      </>
    );
  }

  return (
    <>
      <LandingPage
        user={user}
        onOpenAuth={(mode) => {
          setAuthMode(mode);
          setAuthModalOpen(true);
        }}
        onEnterDashboard={() => navigateTo('dashboard')}
        onOpenAdmin={() => navigateTo('admin')}
      />
      <AuthModal
        open={authModalOpen}
        initialMode={authMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}
