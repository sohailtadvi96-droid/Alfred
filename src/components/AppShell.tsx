import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { IntroChoreography } from './IntroChoreography';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { isKnownGround } from '@/theme/grounds';
import { supabase } from '@/lib/supabase';

const COLLAPSE_KEY = 'alfred-sidebar-collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { user } = useAuth();
  const { ground, setGround } = useTheme();
  const pulled = useRef(false);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Pull the owner's saved ground once, after sign-in.
  useEffect(() => {
    if (!user || pulled.current) return;
    pulled.current = true;
    supabase
      .from('profiles')
      .select('ground')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.ground && isKnownGround(data.ground) && data.ground !== ground) {
          setGround(data.ground);
        }
      })
      .then(undefined, () => {
        /* profiles table may not be migrated yet — ignore */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Push ground changes back to the profile.
  useEffect(() => {
    if (!user || !pulled.current) return;
    void supabase
      .from('profiles')
      .update({ ground })
      .eq('id', user.id)
      .then(undefined, () => {
        /* ignore */
      });
  }, [ground, user]);

  return (
    <IntroChoreography>
      <div className="app" data-collapsed={collapsed ? 'true' : 'false'}>
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </IntroChoreography>
  );
}
