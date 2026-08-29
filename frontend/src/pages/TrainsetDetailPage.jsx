import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, Wrench, FileText, AlertTriangle, Activity, Settings, Zap, Plus, Clock, CheckCircle2, ShieldCheck, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { getStatusColor, formatKm, formatDate } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function TrainsetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isLogMileageOpen, setIsLogMileageOpen] = useState(false);
  const [mileageAdd, setMileageAdd] = useState(280);
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [jobForm, setJobForm] = useState({
    description: '',
    category: 'Electrical',
    priority: 'normal',
    status: 'open'
  });

  // 1. Fetch Real Live Trainset Detail from FastAPI Backend
  const { data: train, isLoading } = useQuery({
    queryKey: ['trainset', id],
    queryFn: () => api.get(`/api/fleet/${id}`),
  });

  // 2. Fetch ML Risk Prediction for this trainset
  const { data: allPredictions = [] } = useQuery({
    queryKey: ['mlPredictions'],
    queryFn: () => api.get('/api/ml/predictions'),
  });

  // 3. Log Mileage Mutation
  const mileageMutation = useMutation({
    mutationFn: (km) => api.post(`/api/fleet/${id}/mileage`, {
      km_added: Number(km),
      log_date: new Date().toISOString().slice(0, 10),
      service_slot: 'Morning Peak Service'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainset', id] });
      queryClient.invalidateQueries({ queryKey: ['fleet'] });
      setIsLogMileageOpen(false);
      toast({
        title: 'Mileage Logged',
        description: `Added ${mileageAdd} km to ${train?.number || 'trainset'}.`,
      });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to log mileage', description: err.message });
    }
  });

  // 4. Create Job Card for this trainset
  const jobMutation = useMutation({
    mutationFn: (data) => api.post('/api/jobcards', {
      ...data,
      trainset_id: id,
      maximo_ref: `WO-KMRL-${Math.floor(1000 + Math.random() * 9000)}`
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainset', id] });
      queryClient.invalidateQueries({ queryKey: ['jobcards'] });
      setIsAddJobOpen(false);
      toast({
        title: 'Job Card Logged',
        description: 'New maintenance work order created.',
      });
      setJobForm({ description: '', category: 'Electrical', priority: 'normal', status: 'open' });
    }
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[450px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!train) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold">Trainset not found</h2>
        <Button onClick={() => navigate('/fleet')} className="mt-4">Back to Fleet</Button>
      </div>
    );
  }

  const prediction = allPredictions.find(p => p.trainset_id === id || p.number === train.number) || {
    maintenance_risk_percent: 5,
    risk_label: 'Low'
  };

  const jobs = train.job_cards || [];
  const mileageLogs = (train.mileage_history || []).slice(0, 15).reverse().map(l => ({
    date: l.log_date ? l.log_date.slice(5) : 'Day',
    km: Math.round(Number(l.cumulative_km || l.km_added || 0))
  }));

  const branding = train.branding_contract;

  return (
    <div className="space-y-6">
      
      {/* Top Navigation & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Button variant="outline" size="icon" onClick={() => navigate('/fleet')} className="bg-white">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{train.number}</h1>
              <Badge className={`uppercase font-bold text-xs ${getStatusColor(train.status)}`}>
                {train.status || 'READY'}
              </Badge>
              <Badge className={
                prediction.maintenance_risk_percent > 40 ? 'bg-red-100 text-red-700 border-none font-bold text-xs' :
                prediction.maintenance_risk_percent > 20 ? 'bg-amber-100 text-amber-800 border-none font-semibold text-xs' :
                'bg-emerald-100 text-emerald-800 border-none text-xs font-semibold'
              }>
                <Activity className="w-3 h-3 mr-1" /> Failure Risk: {prediction.maintenance_risk_percent}% ({prediction.risk_label})
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{train.name || 'BEML 4-Car Electric Multiple Unit (EMU)'}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isRole('operator') && (
            <Button onClick={() => setIsLogMileageOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Log Daily KM
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-xl bg-slate-200/70 p-1">
          <TabsTrigger value="overview" className="text-xs font-semibold">Overview</TabsTrigger>
          <TabsTrigger value="jobs" className="text-xs font-semibold">Job Cards ({jobs.length})</TabsTrigger>
          <TabsTrigger value="mileage" className="text-xs font-semibold">Mileage History</TabsTrigger>
          <TabsTrigger value="branding" className="text-xs font-semibold">Branding Contract</TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-white border-slate-200/80 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Accumulated Mileage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{formatKm(train.total_mileage_km)}</div>
                <p className="text-[11px] text-slate-400 mt-1">Lifecycle wear tracking</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200/80 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Current Bay Position</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-indigo-700 flex items-center gap-1.5">
                  <MapPin className="h-5 w-5 text-indigo-500" /> {train.current_bay_position || 'IBL-A1'}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Inspection Bay Line Depot</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200/80 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Cleaning & Detailing</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold text-slate-800">{formatDate(train.last_cleaned_at)}</div>
                <p className="text-[11px] text-slate-400 mt-1">Deep Clean: {formatDate(train.last_deep_cleaned_at)}</p>
              </CardContent>
            </Card>

            <Card className="bg-indigo-50 border-indigo-200 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-indigo-900 uppercase">AI Readiness Verdict</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold text-indigo-950 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Eligible for Induction
                </div>
                <p className="text-[11px] text-indigo-700/80 mt-1">Satisfies all 3 fitness certificate windows</p>
              </CardContent>
            </Card>
          </div>

          <h3 className="text-base font-bold text-slate-900 mt-6 mb-3">Fitness Certificates Validity Windows</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { title: 'Rolling Stock (RS)', date: train.cert_rs_valid_until, icon: Settings },
              { title: 'Signalling (SIG)', date: train.cert_signalling_valid_until, icon: Activity },
              { title: 'Telecom (TEL)', date: train.cert_telecom_valid_until, icon: Zap }
            ].map(cert => {
              const daysLeft = cert.date ? Math.ceil((new Date(cert.date) - new Date()) / (1000 * 60 * 60 * 24)) : 90;
              const isUrgent = daysLeft <= 14;
              const progressColor = isUrgent ? "bg-red-500" : daysLeft <= 30 ? "bg-amber-500" : "bg-emerald-500";
              const progressVal = Math.min(100, Math.max(0, (daysLeft / 120) * 100));

              return (
                <Card key={cert.title} className="bg-white border-slate-200/80 shadow-xs">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-700">{cert.title}</CardTitle>
                    <cert.icon className="h-4 w-4 text-slate-400" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-bold text-slate-900 mb-2">{formatDate(cert.date)}</div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-1.5">
                      <div className={`h-full ${progressColor}`} style={{ width: `${progressVal}%` }}></div>
                    </div>
                    <p className={`text-xs font-semibold ${isUrgent ? 'text-red-600' : 'text-slate-500'}`}>
                      {daysLeft > 0 ? `${daysLeft} days remaining` : 'Expired'}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Job Cards Tab */}
        <TabsContent value="jobs" className="mt-6">
          <Card className="bg-white border-slate-200/80 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Assigned Job Cards</CardTitle>
                <CardDescription>Open work orders synchronized from IBM Maximo</CardDescription>
              </div>
              {isRole('operator') && (
                <Button size="sm" onClick={() => setIsAddJobOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Log Job Card
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {jobs.length > 0 ? (
                  jobs.map(job => (
                    <div key={job.id} className="flex items-center justify-between p-3.5 border rounded-xl bg-slate-50/50">
                      <div className="flex gap-3.5 items-center">
                        <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                          <Wrench className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-slate-900">{job.maximo_ref || 'WO-KMRL'}</span>
                            <Badge variant="outline" className="text-[10px] uppercase">{job.category || 'General'}</Badge>
                            <Badge className={job.priority === 'critical' ? 'bg-red-100 text-red-700 border-none text-[10px]' : 'bg-slate-100 text-slate-700 border-none text-[10px]'}>
                              {job.priority?.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-700 mt-1">{job.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={job.status === 'open' ? 'bg-amber-100 text-amber-800 border-none text-[10px]' : 'bg-emerald-100 text-emerald-800 border-none text-[10px]'}>
                          {job.status?.toUpperCase()}
                        </Badge>
                        <p className="text-[10px] text-slate-400 mt-1">{formatDate(job.opened_at || job.created_at)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-xs text-slate-400">
                    ✅ No open job cards on this trainset.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Mileage Tab */}
        <TabsContent value="mileage" className="mt-6">
          <Card className="bg-white border-slate-200/80 shadow-xs">
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900">Mileage Accumulation History</CardTitle>
              <CardDescription>Daily kilometer progression on Kochi Metro revenue tracks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full">
                {mileageLogs.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mileageLogs} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} tickFormatter={(val) => `${Math.round(val/1000)}k`} />
                      <Tooltip formatter={(val) => [`${Math.round(val)} km`, 'Cumulative Mileage']} />
                      <Line type="monotone" dataKey="km" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    Click "Log Daily KM" above to add kilometer records.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branding Tab */}
        <TabsContent value="branding" className="mt-6">
          <Card className="bg-white border-slate-200/80 shadow-xs">
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900">Active Exterior Branding Contract</CardTitle>
              <CardDescription>Contractual advertising SLA parameters linked to this rake</CardDescription>
            </CardHeader>
            <CardContent>
              {branding ? (
                <div className="flex flex-col md:flex-row gap-6 items-center bg-slate-50 p-5 rounded-xl border border-slate-200/80">
                  <div className="flex-1 space-y-3 w-full">
                    <div>
                      <p className="text-xs text-slate-500">Advertiser</p>
                      <p className="text-xl font-bold text-slate-900">{branding.advertiser_name}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{branding.campaign_name || 'Annual Wrap Campaign'}</p>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <div>
                        <span className="text-slate-500 block">Priority Weight</span>
                        <Badge variant="outline" className="font-bold">{branding.priority_score || 8} / 10</Badge>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Penalty SLA</span>
                        <span className="font-mono font-bold text-red-600">₹{Number(branding.penalty_per_hour_missed || 5000).toLocaleString('en-IN')}/hr</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-1 w-full bg-white p-4 rounded-xl border shadow-xs">
                    <h4 className="text-xs font-bold text-slate-700 mb-2.5 flex justify-between">
                      <span>Weekly SLA Target</span>
                      <span className="text-indigo-600 font-bold">
                        {Math.min(Math.round((Number(branding.actual_hours_this_week || 0) / Number(branding.required_hours_per_week || 40)) * 100), 100)}%
                      </span>
                    </h4>
                    <Progress value={Math.min(Math.round((Number(branding.actual_hours_this_week || 0) / Number(branding.required_hours_per_week || 40)) * 100), 100)} className="h-2.5 mb-2" />
                    <div className="flex justify-between text-xs text-slate-500 font-mono">
                      <span>{branding.actual_hours_this_week || 0} hrs in service</span>
                      <span>{branding.required_hours_per_week || 40} hrs target</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-xs text-slate-400">
                  No active branding wrap contract linked to {train.number}.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Log Mileage Dialog */}
      <Dialog open={isLogMileageOpen} onOpenChange={setIsLogMileageOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Log Kilometer Run</DialogTitle>
            <DialogDescription>Record track distance completed by {train.number}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="km-input">Kilometers Added Today</Label>
            <Input 
              id="km-input" 
              type="number" 
              value={mileageAdd} 
              onChange={(e) => setMileageAdd(e.target.value)} 
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogMileageOpen(false)}>Cancel</Button>
            <Button onClick={() => mileageMutation.mutate(mileageAdd)} disabled={mileageMutation.isPending} className="bg-indigo-600 text-white">
              {mileageMutation.isPending ? 'Logging...' : 'Save Mileage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Job Card Dialog */}
      <Dialog open={isAddJobOpen} onOpenChange={setIsAddJobOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Create Work Order for {train.number}</DialogTitle>
            <DialogDescription>Log a defect or routine inspection task.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input 
                placeholder="e.g. AC compressor temperature check" 
                value={jobForm.description}
                onChange={(e) => setJobForm({...jobForm, description: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={jobForm.category} onValueChange={(cat) => setJobForm({...jobForm, category: cat})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Electrical">Electrical</SelectItem>
                    <SelectItem value="Mechanical">Mechanical</SelectItem>
                    <SelectItem value="HVAC">HVAC</SelectItem>
                    <SelectItem value="Telecom">Telecom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={jobForm.priority} onValueChange={(p) => setJobForm({...jobForm, priority: p})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">🚨 Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddJobOpen(false)}>Cancel</Button>
            <Button onClick={() => jobMutation.mutate(jobForm)} disabled={jobMutation.isPending} className="bg-indigo-600 text-white">
              {jobMutation.isPending ? 'Logging...' : 'Create Work Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
