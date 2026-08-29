import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  Train, 
  Calendar, 
  ClipboardList, 
  Megaphone, 
  Brain, 
  ScrollText, 
  Users,
  LogOut,
  Menu,
  X,
  FileBarChart
} from 'lucide-react';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';

export default function AppLayout() {
  const { user, profile, signOut, isRole } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, requiredRole: 'read_only' },
    { name: 'Fleet Management', path: '/fleet', icon: Train, requiredRole: 'read_only' },
    { name: 'Schedule', path: '/schedule', icon: Calendar, requiredRole: 'read_only' },
    { name: 'Job Cards', path: '/jobcards', icon: ClipboardList, requiredRole: 'operator' },
    { name: 'Branding Tracker', path: '/branding', icon: Megaphone, requiredRole: 'operator' },
    { name: 'ML Insights', path: '/ml', icon: Brain, requiredRole: 'supervisor' },
    { name: 'Reports', path: '/reports', icon: FileBarChart, requiredRole: 'read_only' },
    { name: 'Audit Log', path: '/audit', icon: ScrollText, requiredRole: 'supervisor' },
    { name: 'Admin', path: '/admin', icon: Users, requiredRole: 'supervisor' },
  ];

  const visibleNavItems = navItems.filter(item => isRole(item.requiredRole));

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/80 md:hidden" 
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-indigo-950 text-white transition-transform duration-300 ease-in-out md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b border-indigo-900">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <span className="text-2xl">🚇</span>
            <span className="bg-gradient-to-r from-indigo-200 to-white bg-clip-text text-transparent">
              KMRL InductPlan
            </span>
          </div>
          <button className="md:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-6 w-6 text-indigo-200" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-2">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-indigo-600 text-white" 
                    : "text-indigo-200 hover:bg-indigo-900 hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {item.name}
              </NavLink>
            ))}
          </nav>
        </div>
        
        <div className="border-t border-indigo-900 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 bg-indigo-800 text-indigo-100">
              <AvatarFallback>{profile?.name?.substring(0, 2).toUpperCase() || 'U'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {profile?.name || user?.email}
              </p>
              <Badge variant="secondary" className="bg-indigo-900 text-indigo-200 text-[10px] px-1.5 h-4 mt-0.5 border-none">
                {profile?.role?.toUpperCase() || 'USER'}
              </Badge>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="flex h-16 items-center justify-between border-b bg-white px-4 md:px-6 md:justify-end shadow-sm z-10">
          <div className="flex items-center md:hidden gap-2">
            <button onClick={() => setSidebarOpen(true)} className="text-slate-500 hover:text-slate-700">
              <Menu className="h-6 w-6" />
            </button>
            <span className="font-semibold text-lg text-slate-800">KMRL</span>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-slate-600 hover:text-slate-900">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-slate-50/50 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
