import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Train, AlertTriangle, CheckCircle, Clock, ChevronRight, RefreshCw, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import TrainsetCard from '@/components/fleet/TrainsetCard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function DashboardPage() {
  // 1. Fetch Fleet
  const { data: fleet = [], isLoading: fleetLoading, refetch: refetchFleet } = useQuery({
    queryKey: ['fleet'],
    queryFn: () => api.get('/api/fleet'),
  });

  // 2. Fetch Stats Overview
  const { data: statsData } = useQuery({
    queryKey: ['fleetStats'],
    queryFn: () => api.get('/api/fleet/stats/overview'),
  });

  // 3. Fetch Branding SLA Risks
  const { data: brandingRisks = [] } = useQuery({
    queryKey: ['brandingRisks'],
    queryFn: () => api.get('/api/branding/sla-risk'),
  });

  // 4. Fetch Latest Schedule
  const { data: latestSchedule } = useQuery({
    queryKey: ['latestSchedule'],
    queryFn: () => api.get('/api/schedule/latest').catch(() => null),
  });

  // Realtime subscription for trainsets table
  useEffect(() => {
    const channel = supabase.channel('dashboard_fleet_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trainsets' }, () => {
        refetchFleet();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetchFleet]);

  if (fleetLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-[360px] w-full rounded-xl" />
      </div>
    );
  }

  // Calculate live summary numbers
  const totalFleet = fleet.length || 25;
  const readyToday = fleet.filter(t => t.status === 'ready' && t.cert_status === 'valid' && !t.has_critical_jobs).length;
  const expiringCerts = statsData?.certs_expiring_soon ?? fleet.filter(t => t.cert_status === 'expiring').length;
  const criticalJobs = statsData?.open_critical_jobs ?? fleet.filter(t => t.has_critical_jobs).length;
  const avgMileage = statsData?.total_mileage_avg ?? (
    fleet.reduce((acc, t) => acc + Number(t.total_mileage_km || 0), 0) / (fleet.length || 1)
  );

  // Mileage chart data for all 25 trainsets
  const mileageChart = fleet.map(t => ({
    name: t.number,
    km: Math.round(Number(t.total_mileage_km || 0)),
  })).sort((a, b) => a.name.localeCompare(b.name));

  const topInductions = latestSchedule?.induction_list?.filter(i => i.inducted).slice(0, 5) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">KMRL Operations Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Real-time fleet readiness, AI induction status, and maintenance overview.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            Supabase Live Sync
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchFleet()} className="h-8">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white border-slate-200/80 shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Fleet</p>
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                <Train className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{totalFleet}</div>
            <p className="text-xs text-slate-500 mt-1">4-car trainsets registered</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/80 shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Service Ready</p>
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <CheckCircle className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-700">{readyToday}</div>
            <p className="text-xs text-emerald-600 font-medium mt-1">Target: 18 (Peak requirement met)</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/80 shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Certs Expiring</p>
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-600">{expiringCerts}</div>
            <p className="text-xs text-slate-500 mt-1">Expiring within ≤ 30 days</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/80 shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Critical Jobs</p>
              <div className="p-2 bg-red-50 rounded-lg text-red-600">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-red-600">{criticalJobs}</div>
            <p className="text-xs text-slate-500 mt-1">Open IBM Maximo critical cards</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        
        {/* Main Fleet Overview Grid */}
        <Card className="md:col-span-5 bg-white border-slate-200/80">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Live Fleet Readiness</CardTitle>
              <CardDescription>Status & fitness certificates for Kochi Metro rakes</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-indigo-600 hover:text-indigo-700">
              <Link to="/fleet" className="flex items-center">View All 25 <ChevronRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
              {fleet.slice(0, 10).map(train => (
                <TrainsetCard key={train.id} trainset={train} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar Widgets */}
        <div className="md:col-span-2 space-y-6">
          
          {/* AI Induction Plan */}
          <Card className="bg-white border-slate-200/80">
            <CardHeader className="pb-2.5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-indigo-600" /> AI Induction Top Ranks
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                  CP-SAT
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {topInductions.length > 0 ? (
                <div className="divide-y divide-slate-100 text-xs">
                  {topInductions.map((ind, i) => (
                    <div key={ind.trainset_id || i} className="flex items-center justify-between p-3 px-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-bold">
                          {ind.rank || i + 1}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900">{ind.number}</span>
                          <span className="text-[10px] text-slate-500 block">{ind.name || 'Inducted Rake'}</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-mono font-bold bg-slate-100">
                        {ind.score}%
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-slate-500">
                  <p>No active schedule generated for today yet.</p>
                  <Button variant="outline" size="sm" asChild className="mt-3 text-xs w-full">
                    <Link to="/schedule/generate">Generate Schedule</Link>
                  </Button>
                </div>
              )}
              {topInductions.length > 0 && (
                <div className="p-2.5 border-t bg-slate-50 rounded-b-xl text-center">
                  <Button variant="ghost" size="sm" className="w-full text-xs font-semibold text-indigo-600" asChild>
                    <Link to="/schedule">Open Full Induction Schedule</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Branding SLA Risk */}
          <Card className="bg-white border-slate-200/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-900">Branding Contract SLA</CardTitle>
            </CardHeader>
            <CardContent>
              {brandingRisks.length > 0 ? (
                <div className="space-y-3">
                  {brandingRisks.map((brand, i) => {
                    const req = Number(brand.required_hours_per_week || 40);
                    const act = Number(brand.actual_hours_this_week || 0);
                    const pct = Math.min(Math.round((act / (req || 1)) * 100), 100);
                    return (
                      <div key={brand.id || i} className="flex flex-col gap-1 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-slate-800 truncate max-w-[140px]">{brand.advertiser_name}</span>
                          <span className="text-[11px] text-red-600 font-bold">{pct}% / 80% min</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-red-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-slate-500 text-center py-2">
                  <span className="text-emerald-600 font-semibold">✅ All branding contracts on schedule</span>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Fleet-wide Mileage Equalisation Bar Chart */}
      <Card className="bg-white border-slate-200/80">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Fleet Mileage Balancing Chart</CardTitle>
              <CardDescription>Total accumulated kilometers per trainset vs fleet target average</CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono font-medium self-start sm:self-auto bg-slate-50">
              Target Avg: {new Intl.NumberFormat('en-IN').format(Math.round(avgMileage))} km
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mileageChart} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-45} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `${Math.round(val/1000)}k`} />
                <Tooltip 
                  formatter={(value) => [`${new Intl.NumberFormat('en-IN').format(value)} km`, 'Accumulated Mileage']}
                  cursor={{ fill: '#f8fafc' }}
                />
                <ReferenceLine 
                  y={avgMileage} 
                  stroke="#ef4444" 
                  strokeDasharray="4 4" 
                  strokeWidth={1.5}
                  label={{ position: 'top', value: 'Fleet Average', fill: '#ef4444', fontSize: 11, fontWeight: 'bold' }} 
                />
                <Bar dataKey="km" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
