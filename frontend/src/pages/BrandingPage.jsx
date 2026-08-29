import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus, Clock, Target, AlertTriangle, Building, Calendar, IndianRupee } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function BrandingPage() {
  const { isRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);
  const [hoursToAdd, setHoursToAdd] = useState(8);

  const [formData, setFormData] = useState({
    trainset_id: '',
    advertiser_name: '',
    campaign_name: '',
    required_hours_per_week: 40,
    contract_start: '2026-01-01',
    contract_end: '2026-12-31',
    priority_score: 8,
    penalty_per_hour_missed: 5000
  });

  // 1. Fetch Fleet for Trainset Dropdown
  const { data: fleet = [] } = useQuery({
    queryKey: ['fleet'],
    queryFn: () => api.get('/api/fleet'),
  });

  // 2. Fetch Live Branding Contracts
  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['brandingContracts'],
    queryFn: () => api.get('/api/branding'),
  });

  // 3. Fetch SLA Risks
  const { data: slaRisks = [] } = useQuery({
    queryKey: ['brandingRisks'],
    queryFn: () => api.get('/api/branding/sla-risk'),
  });

  // 4. Create Contract Mutation
  const addMutation = useMutation({
    mutationFn: (data) => api.post('/api/branding', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brandingContracts'] });
      queryClient.invalidateQueries({ queryKey: ['brandingRisks'] });
      setIsAddOpen(false);
      toast({
        title: 'Branding Contract Registered',
        description: `Contract for ${formData.advertiser_name} linked to optimization weights.`,
      });
      setFormData({
        trainset_id: '',
        advertiser_name: '',
        campaign_name: '',
        required_hours_per_week: 40,
        contract_start: '2026-01-01',
        contract_end: '2026-12-31',
        priority_score: 8,
        penalty_per_hour_missed: 5000
      });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create contract',
        description: err.response?.data?.detail || err.message,
      });
    }
  });

  // 5. Log Hours Mutation
  const logMutation = useMutation({
    mutationFn: ({ id, hours }) => api.post(`/api/branding/${id}/log-hours`, { hours_added: hours }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brandingContracts'] });
      queryClient.invalidateQueries({ queryKey: ['brandingRisks'] });
      setIsLogOpen(false);
      toast({
        title: 'Exposure Hours Logged',
        description: `Added ${hoursToAdd} revenue service exposure hours.`,
      });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to log hours',
        description: err.response?.data?.detail || err.message,
      });
    }
  });

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formData.trainset_id || !formData.advertiser_name) {
      toast({ variant: 'destructive', title: 'Missing required fields', description: 'Please choose a trainset and advertiser name.' });
      return;
    }
    addMutation.mutate({
      ...formData,
      required_hours_per_week: Number(formData.required_hours_per_week),
      priority_score: Number(formData.priority_score),
      penalty_per_hour_missed: Number(formData.penalty_per_hour_missed)
    });
  };

  const handleLogSubmit = (e) => {
    e.preventDefault();
    if (!selectedContract) return;
    logMutation.mutate({
      id: selectedContract.id,
      hours: Number(hoursToAdd)
    });
  };

  const totalRequiredWeekly = contracts.reduce((acc, c) => acc + Number(c.required_hours_per_week || 0), 0);
  const totalActualWeekly = contracts.reduce((acc, c) => acc + Number(c.actual_hours_this_week || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Branding SLA & Revenue Optimization</h1>
          <p className="text-sm text-slate-500 mt-1">Contractual exterior wrap exposure hours dictate AI induction priorities to avoid penalty SLAs.</p>
        </div>
        {isRole('operator') && (
          <Button onClick={() => setIsAddOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="mr-2 h-4 w-4" /> Register Branding Contract
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white border-slate-200/80 shadow-xs">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Active Wrap Contracts</CardTitle>
            <Megaphone className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{contracts.length}</div>
            <p className="text-xs text-slate-500 mt-1">Advertisers under contract</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/80 shadow-xs">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Weekly Hours Fulfillment</CardTitle>
            <Target className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-700">{totalActualWeekly} / {totalRequiredWeekly} hrs</div>
            <p className="text-xs text-slate-500 mt-1">Total fleet exposure this week</p>
          </CardContent>
        </Card>

        <Card className={`border-slate-200/80 shadow-xs ${slaRisks.length > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className={`text-xs font-semibold uppercase ${slaRisks.length > 0 ? 'text-red-800' : 'text-emerald-800'}`}>
              At-Risk Contracts
            </CardTitle>
            <AlertTriangle className={`h-4 w-4 ${slaRisks.length > 0 ? 'text-red-600' : 'text-emerald-600'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${slaRisks.length > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {slaRisks.length}
            </div>
            <p className={`text-xs mt-1 font-medium ${slaRisks.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {slaRisks.length > 0 ? 'Boosted in CP-SAT objective' : 'All advertiser SLAs on track'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white border-slate-200/80 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-900">Contract Exposure & Priority Matrix</CardTitle>
          <CardDescription>Live tracking of actual vs contracted hours and financial penalty exposure.</CardDescription>
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
                  <TableHead>Advertiser & Campaign</TableHead>
                  <TableHead>Assigned Rake</TableHead>
                  <TableHead>Priority Weight</TableHead>
                  <TableHead className="w-[32%]">Weekly SLA Progress</TableHead>
                  <TableHead>Penalty / Missed Hr</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.length > 0 ? (
                  contracts.map(contract => {
                    const req = Number(contract.required_hours_per_week || 40);
                    const act = Number(contract.actual_hours_this_week || 0);
                    const percent = Math.min(Math.round((act / (req || 1)) * 100), 100);
                    const isRisk = percent < 80;
                    
                    return (
                      <TableRow key={contract.id}>
                        <TableCell>
                          <div className="font-bold text-slate-900 text-xs">{contract.advertiser_name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{contract.campaign_name || 'Annual Wrap'}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-bold text-indigo-700 bg-indigo-50 border-indigo-200 text-xs">
                            {contract.trainsets?.number || contract.trainset_number || 'KM Rake'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-slate-100 text-slate-800 border-none text-[10px]">
                            {contract.priority_score || 8} / 10
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-700">{act} of {req} hrs</span>
                              <span className={`font-bold ${isRisk ? 'text-red-600' : 'text-emerald-600'}`}>
                                {percent}%
                              </span>
                            </div>
                            <Progress value={percent} className={`h-2 ${isRisk ? '[&>div]:bg-red-500 bg-red-100' : '[&>div]:bg-emerald-500 bg-emerald-100'}`} />
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-700">
                          ₹{Number(contract.penalty_per_hour_missed || 5000).toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => { setSelectedContract(contract); setIsLogOpen(true); }}
                            className="text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50/50"
                          >
                            <Clock className="mr-1.5 h-3.5 w-3.5" /> Log Hours
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500 text-xs">
                      No branding contracts registered yet. Click "Register Branding Contract" above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Contract Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Register Exterior Branding Contract</DialogTitle>
            <DialogDescription>
              Link an advertiser campaign to a trainset rake to factor into AI scheduling.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label>Assigned Trainset Rake</Label>
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
                <Label htmlFor="adv-name">Advertiser / Brand</Label>
                <Input 
                  id="adv-name" 
                  placeholder="e.g. Kerala Tourism" 
                  required
                  value={formData.advertiser_name}
                  onChange={(e) => setFormData({...formData, advertiser_name: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="camp-name">Campaign Title</Label>
                <Input 
                  id="camp-name" 
                  placeholder="e.g. Visit Kerala 2026" 
                  value={formData.campaign_name}
                  onChange={(e) => setFormData({...formData, campaign_name: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="req-hrs">Required Exposure (Hrs/Week)</Label>
                <Input 
                  id="req-hrs" 
                  type="number"
                  value={formData.required_hours_per_week}
                  onChange={(e) => setFormData({...formData, required_hours_per_week: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prio">Priority Score (1-10)</Label>
                <Input 
                  id="prio" 
                  type="number"
                  min="1"
                  max="10"
                  value={formData.priority_score}
                  onChange={(e) => setFormData({...formData, priority_score: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pen">Penalty Per Hour Missed (INR ₹)</Label>
              <Input 
                id="pen" 
                type="number"
                value={formData.penalty_per_hour_missed}
                onChange={(e) => setFormData({...formData, penalty_per_hour_missed: e.target.value})}
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {addMutation.isPending ? 'Registering...' : 'Save Contract'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Log Hours Dialog */}
      <Dialog open={isLogOpen} onOpenChange={setIsLogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Log Daily Exposure Hours</DialogTitle>
            <DialogDescription>
              Record revenue service operating hours for {selectedContract?.advertiser_name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLogSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="hrs-add">Hours Completed in Service Today</Label>
              <Input 
                id="hrs-add" 
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                value={hoursToAdd}
                onChange={(e) => setHoursToAdd(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsLogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={logMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {logMutation.isPending ? 'Logging...' : 'Update Hours'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
