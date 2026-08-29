import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Plus, Search, Filter, Wrench, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { formatDate, getPriorityColor } from '@/lib/utils';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function JobCardsPage() {
  const { isRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);

  const [formData, setFormData] = useState({
    trainset_id: '',
    maximo_ref: '',
    description: '',
    category: 'Electrical',
    priority: 'normal',
    status: 'open',
    estimated_hours: 4
  });

  // 1. Fetch Fleet to get trainset options
  const { data: fleet = [] } = useQuery({
    queryKey: ['fleet'],
    queryFn: () => api.get('/api/fleet'),
  });

  // 2. Fetch Job Cards from live backend
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobcards'],
    queryFn: () => api.get('/api/jobcards'),
  });

  // 3. Create Job Card Mutation
  const addMutation = useMutation({
    mutationFn: (data) => api.post('/api/jobcards', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobcards'] });
      queryClient.invalidateQueries({ queryKey: ['fleet'] });
      setIsAddOpen(false);
      toast({
        title: 'Job Card Created',
        description: 'New work order logged and synced with trainset fitness constraints.',
      });
      setFormData({
        trainset_id: '',
        maximo_ref: '',
        description: '',
        category: 'Electrical',
        priority: 'normal',
        status: 'open',
        estimated_hours: 4
      });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create job card',
        description: err.response?.data?.detail || err.message,
      });
    }
  });

  // 4. Update Status Mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.put(`/api/jobcards/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobcards'] });
      queryClient.invalidateQueries({ queryKey: ['fleet'] });
      toast({
        title: 'Job Card Updated',
        description: 'Work order status updated.',
      });
    }
  });

  // 5. Import CSV Mutation
  const importMutation = useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', file);
      return api.postForm('/api/jobcards/import', form);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['jobcards'] });
      queryClient.invalidateQueries({ queryKey: ['fleet'] });
      setIsImportOpen(false);
      toast({
        title: 'IBM Maximo Sync Complete',
        description: `Imported ${res?.imported_count || 'work orders'} successfully.`,
      });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Import Failed',
        description: err.response?.data?.detail || 'Ensure valid CSV format with WO_Number, Description, Priority, Status columns.',
      });
    }
  });

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formData.trainset_id || !formData.description) {
      toast({ variant: 'destructive', title: 'Missing Information', description: 'Please select a trainset and description.' });
      return;
    }
    const maxRef = formData.maximo_ref || `WO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    addMutation.mutate({
      ...formData,
      maximo_ref: maxRef,
      estimated_hours: Number(formData.estimated_hours)
    });
  };

  const handleImportSubmit = (e) => {
    e.preventDefault();
    if (!importFile) {
      toast({ variant: 'destructive', title: 'No file selected', description: 'Please choose a Maximo CSV export file.' });
      return;
    }
    importMutation.mutate(importFile);
  };

  const trainsetMap = Object.fromEntries(fleet.map(t => [t.id, t]));

  const filteredJobs = jobs.filter(job => {
    const ts = trainsetMap[job.trainset_id] || {};
    const matchesSearch = 
      (job.maximo_ref || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (job.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ts.number || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || job.priority === priorityFilter;
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesSearch && matchesPriority && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Job Cards & Maximo Work Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Directly feed work orders into the CP-SAT induction constraint solver.</p>
        </div>
        
        <div className="flex items-center gap-2.5">
          <Button variant="outline" onClick={() => setIsImportOpen(true)} className="bg-white">
            <Upload className="mr-2 h-4 w-4 text-slate-600" /> Import Maximo CSV
          </Button>
          {isRole('operator') && (
            <Button onClick={() => setIsAddOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="mr-2 h-4 w-4" /> Log New Job Card
            </Button>
          )}
        </div>
      </div>

      <Card className="bg-white border-slate-200/80 shadow-xs">
        <CardContent className="p-3.5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search by WO reference, description, or train number (e.g. KM-05)..." 
                className="pl-9 bg-slate-50 border-slate-200"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-[180px]">
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="critical">Critical (Blocks Induction)</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-[180px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="closed">Closed / Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-slate-200/80 shadow-xs">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Maximo Ref</TableHead>
                  <TableHead>Trainset</TableHead>
                  <TableHead className="w-[35%]">Description & Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status Action</TableHead>
                  <TableHead className="text-right">Opened Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.length > 0 ? (
                  filteredJobs.map((job) => {
                    const ts = trainsetMap[job.trainset_id] || {};
                    return (
                      <TableRow key={job.id}>
                        <TableCell className="font-mono font-bold text-xs text-slate-800">
                          {job.maximo_ref || `WO-${job.id.slice(0, 8)}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-bold text-indigo-700 bg-indigo-50 border-indigo-200 text-xs">
                            {ts.number || 'KM Rake'}
                          </Badge>
                          <div className="text-[10px] text-slate-400 mt-0.5">{ts.name || ''}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-900 text-xs">{job.description}</div>
                          <div className="text-[10px] text-slate-500 uppercase mt-0.5 tracking-wider font-semibold">
                            {job.category || 'General'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            job.priority === 'critical' ? 'bg-red-100 text-red-700 border-none font-bold text-[10px]' :
                            job.priority === 'high' ? 'bg-amber-100 text-amber-800 border-none font-semibold text-[10px]' :
                            'bg-slate-100 text-slate-700 border-none text-[10px]'
                          }>
                            {job.priority?.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={job.status} 
                            onValueChange={(newStatus) => statusMutation.mutate({ id: job.id, status: newStatus })}
                          >
                            <SelectTrigger className="w-[130px] h-7 text-xs font-semibold bg-slate-50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">⚠️ Open</SelectItem>
                              <SelectItem value="in_progress">⚙️ In Progress</SelectItem>
                              <SelectItem value="closed">✅ Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right text-slate-500 text-xs font-mono">
                          {formatDate(job.opened_at || job.created_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-14 text-center text-slate-500">
                      <Wrench className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-medium text-slate-700 text-xs">No job cards match your filter</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Click "Log New Job Card" or import a Maximo CSV export.</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Job Card Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Log Maintenance Job Card</DialogTitle>
            <DialogDescription>
              Record an open work order against a trainset to enforce induction constraints.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label>Target Trainset</Label>
              <Select value={formData.trainset_id} onValueChange={(id) => setFormData({...formData, trainset_id: id})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Trainset (KM-01 to KM-25)" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {fleet.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.number} — {t.name || 'Metro Rake'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="maximo_ref">Maximo WO # (Optional)</Label>
                <Input 
                  id="maximo_ref" 
                  placeholder="e.g. WO-2026-9021" 
                  value={formData.maximo_ref}
                  onChange={(e) => setFormData({...formData, maximo_ref: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={(cat) => setFormData({...formData, category: cat})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Electrical">Electrical / Traction</SelectItem>
                    <SelectItem value="Mechanical">Mechanical / Bogie</SelectItem>
                    <SelectItem value="HVAC">HVAC & Climate</SelectItem>
                    <SelectItem value="Telecom">Signalling & Telecom</SelectItem>
                    <SelectItem value="Pneumatics">Brakes & Pneumatics</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desc">Fault Description</Label>
              <Input 
                id="desc" 
                placeholder="e.g. Brake pad wear exceeding threshold on axle 2" 
                required
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority Level</Label>
                <Select value={formData.priority} onValueChange={(p) => setFormData({...formData, priority: p})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">🚨 Critical (Hard Block for Induction)</SelectItem>
                    <SelectItem value="high">⚠️ High Priority</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="est-hrs">Est. Downtime (Hours)</Label>
                <Input 
                  id="est-hrs" 
                  type="number"
                  value={formData.estimated_hours}
                  onChange={(e) => setFormData({...formData, estimated_hours: e.target.value})}
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {addMutation.isPending ? 'Logging...' : 'Create Work Order'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Maximo CSV Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Import IBM Maximo Work Orders (CSV)</DialogTitle>
            <DialogDescription>
              Upload exported CSV files from IBM Maximo. The platform will automatically parse and map work orders to trainsets.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleImportSubmit} className="space-y-4 py-2">
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:bg-slate-50 transition-colors">
              <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
              <input 
                type="file" 
                accept=".csv" 
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {importFile && (
                <p className="text-xs text-emerald-600 font-semibold mt-2">Selected: {importFile.name}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsImportOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={importMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {importMutation.isPending ? 'Importing...' : 'Upload & Sync Maximo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
