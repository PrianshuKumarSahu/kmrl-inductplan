import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, UserPlus, CheckCircle2, XCircle, Users, Mail, Building, Key } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    employee_id: '',
    department: 'Rolling Stock & Operations',
    role: 'operator',
    password: ''
  });

  // 1. Fetch live users from Supabase / Backend API
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: async () => {
      try {
        return await api.get('/api/auth/users');
      } catch (err) {
        // Fallback directly via Supabase query if needed
        const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        return data || [];
      }
    }
  });

  // 2. Update user mutation (role or status)
  const updateUserMutation = useMutation({
    mutationFn: ({ userId, updates }) => api.put(`/api/auth/users/${userId}`, updates),
    onSuccess: (_, { updates }) => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      toast({
        title: 'User Profile Updated',
        description: updates.role ? `Role updated to ${updates.role}` : 'User active status changed.',
      });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: err.response?.data?.detail || err.message,
      });
    }
  });

  // 3. Create / Invite user mutation
  const inviteMutation = useMutation({
    mutationFn: async (userData) => {
      // Create user in Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password || 'Password@123',
        options: {
          data: {
            name: userData.name,
            employee_id: userData.employee_id || `EMP-${Date.now().toString().slice(-4)}`,
            department: userData.department,
            role: userData.role
          }
        }
      });
      if (authErr) throw authErr;

      // Upsert profile record
      if (authData?.user) {
        await supabase.from('profiles').upsert({
          id: authData.user.id,
          name: userData.name,
          employee_id: userData.employee_id || `EMP-${authData.user.id.slice(0, 6).toUpperCase()}`,
          department: userData.department,
          role: userData.role,
          is_active: true
        });
      }
      return authData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setIsInviteOpen(false);
      toast({
        title: 'Employee Registered',
        description: `${inviteForm.name} (${inviteForm.email}) has been granted ${inviteForm.role} access.`,
      });
      setInviteForm({
        name: '',
        email: '',
        employee_id: '',
        department: 'Rolling Stock & Operations',
        role: 'operator',
        password: ''
      });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Registration failed',
        description: err.message || 'Could not register employee.',
      });
    }
  });

  const handleRoleChange = (userId, newRole) => {
    updateUserMutation.mutate({ userId, updates: { role: newRole } });
  };

  const handleToggleStatus = (user) => {
    updateUserMutation.mutate({
      userId: user.id,
      updates: { is_active: !user.is_active }
    });
  };

  const handleInviteSubmit = (e) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.password) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Please provide email and password.' });
      return;
    }
    inviteMutation.mutate(inviteForm);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">User Administration & RBAC</h1>
          <p className="text-sm text-slate-500 mt-1">Manage KMRL employee role-based access control, security policies, and permissions.</p>
        </div>
        <Button onClick={() => setIsInviteOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <UserPlus className="mr-2 h-4 w-4" /> Register / Invite User
        </Button>
      </div>

      <Card className="bg-white border-slate-200/80 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-900">Registered Platform Users</CardTitle>
          <CardDescription>All authorized KMRL accounts and their current role assignments in the system.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User Name</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role Assignment</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length > 0 ? (
                  users.map((user) => (
                    <TableRow key={user.id} className={!user.is_active ? 'opacity-60 bg-slate-50' : ''}>
                      <TableCell className="font-semibold text-slate-900">
                        {user.name || 'KMRL Staff'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {user.employee_id || `EMP-${user.id.slice(0, 6).toUpperCase()}`}
                      </TableCell>
                      <TableCell className="text-slate-600 text-xs">
                        {user.department || 'Operations'}
                      </TableCell>
                      <TableCell>
                        {user.is_active !== false ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none text-[11px]">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500 border-slate-300 text-[11px]">
                            <XCircle className="w-3 h-3 mr-1" /> Deactivated
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={user.role || 'read_only'} 
                          onValueChange={(newRole) => handleRoleChange(user.id, newRole)}
                          disabled={!user.is_active}
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs font-medium">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="supervisor">Supervisor (Full Access)</SelectItem>
                            <SelectItem value="operator">Operator (Work Orders)</SelectItem>
                            <SelectItem value="read_only">Read Only (View Only)</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        {user.is_active !== false ? (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleToggleStatus(user)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs h-8"
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleToggleStatus(user)}
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 text-xs h-8"
                          >
                            Reactivate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-slate-500 text-xs">
                      No additional users registered yet. Click "Register / Invite User" above to add new staff.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      <div className="flex gap-3.5 items-start p-4 bg-indigo-50/80 text-indigo-900 border border-indigo-200/80 rounded-xl">
        <ShieldAlert className="h-5 w-5 mt-0.5 text-indigo-600 flex-shrink-0" />
        <div className="text-xs space-y-1">
          <p className="font-bold text-sm text-indigo-950">KMRL Role Hierarchy & Access Matrix</p>
          <p className="text-slate-600">
            <span className="font-semibold text-indigo-900">Supervisor:</span> Full CP-SAT schedule generation, What-If simulation, ML retraining, user access controls, and final schedule approval.
          </p>
          <p className="text-slate-600">
            <span className="font-semibold text-indigo-900">Operator:</span> Update Maximo work order statuses, log branding exposure hours, record train mileage.
          </p>
          <p className="text-slate-600">
            <span className="font-semibold text-indigo-900">Read-Only:</span> View live dashboards, reports, and approved induction orders.
          </p>
        </div>
      </div>

      {/* Invite / Register User Dialog */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Register New KMRL Employee</DialogTitle>
            <DialogDescription>
              Create credentials and assign role permissions for operations staff.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Full Name</Label>
              <Input 
                id="inv-name" 
                placeholder="e.g. Anjali Menon" 
                required
                value={inviteForm.name}
                onChange={(e) => setInviteForm({...inviteForm, name: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-email">Work Email</Label>
                <Input 
                  id="inv-email" 
                  type="email"
                  placeholder="anjali@kmrl.co.in" 
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({...inviteForm, email: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-emp">Employee ID</Label>
                <Input 
                  id="inv-emp" 
                  placeholder="e.g. EMP-KMRL44" 
                  value={inviteForm.employee_id}
                  onChange={(e) => setInviteForm({...inviteForm, employee_id: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-dept">Department</Label>
                <Input 
                  id="inv-dept" 
                  value={inviteForm.department}
                  onChange={(e) => setInviteForm({...inviteForm, department: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-role">Assigned Role</Label>
                <Select value={inviteForm.role} onValueChange={(role) => setInviteForm({...inviteForm, role})}>
                  <SelectTrigger id="inv-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="read_only">Read Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-pass">Initial Password</Label>
              <Input 
                id="inv-pass" 
                type="password"
                placeholder="Min 6 characters (e.g. Password@123)" 
                required
                value={inviteForm.password}
                onChange={(e) => setInviteForm({...inviteForm, password: e.target.value})}
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={inviteMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {inviteMutation.isPending ? 'Registering...' : 'Create Account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
