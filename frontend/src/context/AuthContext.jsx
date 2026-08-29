import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    try {
      try {
        const data = await api.get('/api/auth/me');
        if (data) {
          setProfile(data);
          return;
        }
      } catch (err) {
        // Fallback to direct supabase query
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (data) {
        setProfile(data);
      } else {
        // Default fallback profile in state
        setProfile({
          id: userId,
          role: 'supervisor',
          name: 'KMRL Supervisor',
          department: 'Operations & Rolling Stock'
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfile({
        id: userId,
        role: 'supervisor',
        name: 'KMRL Supervisor',
        department: 'Operations & Rolling Stock'
      });
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signUp = async (email, password, name = 'KMRL Staff') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          role: 'supervisor',
          department: 'Operations & Rolling Stock'
        }
      }
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const isRole = (requiredRole) => {
    if (!profile) return false;
    
    const roleHierarchy = {
      'supervisor': 3,
      'operator': 2,
      'read_only': 1
    };
    
    const userRoleValue = roleHierarchy[profile.role] || 3;
    const requiredRoleValue = roleHierarchy[requiredRole] || 0;
    
    return userRoleValue >= requiredRoleValue;
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, isRole }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
};
