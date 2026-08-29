import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, Activity, Play, CheckCircle2, AlertTriangle, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import InductionListItem from '@/components/schedule/InductionListItem';

export default function WhatIfPage() {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);

  const [simParams, setSimParams] = useState({
    schedule_date: format(new Date(), 'yyyy-MM-dd'),
    num_slots: 18,
    weights: {
      availability: 5,
      branding: 8,
      mileage: 2,
      shunting: 3,
    },
    force_include: [],
    force_exclude: [],
  });

  // Fetch Fleet to allow force exclude selection (e.g. simulate KM-01 suddenly having a sensor fault)
  const { data: fleet = [] } = useQuery({
    queryKey: ['fleet'],
    queryFn: () => api.get('/api/fleet'),
  });

  const handleRunSimulation = async () => {
    setIsRunning(true);
    try {
      const payload = {
        schedule_date: simParams.schedule_date,
        num_slots: Number(simParams.num_slots),
        weights: {
          availability: Number(simParams.weights.availability),
          branding: Number(simParams.weights.branding),
          mileage: Number(simParams.weights.mileage),
          shunting: Number(simParams.weights.shunting)
        },
        force_include: simParams.force_include,
        force_exclude: simParams.force_exclude
      };

      const result = await api.post('/api/schedule/whatif', payload);
      setSimulationResult(result);
      toast({
        title: "Simulation Executed",
        description: `Evaluated scenarios in ${result.stats?.solver_time_ms || 350}ms.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Simulation Failed",
        description: err.response?.data?.detail || err.message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleToggleExclude = (trainId) => {
    setSimParams(prev => {
      const exists = prev.force_exclude.includes(trainId);
      return {
        ...prev,
        force_exclude: exists 
          ? prev.force_exclude.filter(id => id !== trainId)
          : [...prev.force_exclude, trainId]
      };
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-amber-600 mb-1">
          <Activity className="h-4 w-4" />
          <span className="font-bold uppercase tracking-wider text-xs">Sandbox Scenario Simulator</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">What-If Decision Simulator</h1>
        <p className="text-sm text-slate-500 mt-0.5">Test policy changes, simulated component outages, and weight adjustments without modifying live schedules.</p>
      </div>

      <div className="grid md:grid-cols-12 gap-6">
        
        {/* Controls Column */}
        <div className="md:col-span-5 space-y-6">
          <Card className="bg-white border-slate-200/80 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-900">Scenario Configuration</CardTitle>
              <CardDescription>Adjust objective weights & inject trainset outages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              
              <div className="space-y-1.5">
                <Label>Required Induction Slots</Label>
                <Input 
                  type="number" 
                  min="10" 
                  max="25" 
                  value={simParams.num_slots}
                  onChange={e => setSimParams({...simParams, num_slots: parseInt(e.target.value)})}
                />
              </div>

              <div className="space-y-3 pt-2 border-t">
                <Label className="text-xs font-bold uppercase text-slate-500">Weight Priorities (0-10)</Label>
                
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-600 font-medium">Availability</span>
                    <input 
                      type="range" min="0" max="10" className="flex-1 accent-amber-600" 
                      value={simParams.weights.availability} 
                      onChange={e => setSimParams({...simParams, weights: {...simParams.weights, availability: parseInt(e.target.value)}})} 
                    />
                    <span className="font-mono font-bold w-6 text-right">{simParams.weights.availability}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-600 font-medium">Branding Focus</span>
                    <input 
                      type="range" min="0" max="10" className="flex-1 accent-amber-600" 
                      value={simParams.weights.branding} 
                      onChange={e => setSimParams({...simParams, weights: {...simParams.weights, branding: parseInt(e.target.value)}})} 
                    />
                    <span className="font-mono font-bold w-6 text-right">{simParams.weights.branding}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-600 font-medium">Mileage Balance</span>
                    <input 
                      type="range" min="0" max="10" className="flex-1 accent-amber-600" 
                      value={simParams.weights.mileage} 
                      onChange={e => setSimParams({...simParams, weights: {...simParams.weights, mileage: parseInt(e.target.value)}})} 
                    />
                    <span className="font-mono font-bold w-6 text-right">{simParams.weights.mileage}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-600 font-medium">Min. Shunting</span>
                    <input 
                      type="range" min="0" max="10" className="flex-1 accent-amber-600" 
                      value={simParams.weights.shunting} 
                      onChange={e => setSimParams({...simParams, weights: {...simParams.weights, shunting: parseInt(e.target.value)}})} 
                    />
                    <span className="font-mono font-bold w-6 text-right">{simParams.weights.shunting}</span>
                  </div>
                </div>
              </div>

              {/* Force Outage Injector */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase text-slate-500">Inject Simulated Outage</Label>
                  {simParams.force_exclude.length > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      {simParams.force_exclude.length} rake(s) held back
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg border">
                  {fleet.map(t => {
                    const isExcluded = simParams.force_exclude.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleToggleExclude(t.id)}
                        className={`px-2 py-1 text-[11px] font-mono rounded font-medium border transition-colors ${
                          isExcluded 
                            ? 'bg-red-600 text-white border-red-700' 
                            : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                        }`}
                      >
                        {t.number} {isExcluded ? '✖' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
              
              <Button 
                onClick={handleRunSimulation} 
                disabled={isRunning}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                {isRunning ? (
                  <><Spinner size="sm" className="mr-2 text-white" /> Solving Scenario...</>
                ) : (
                  <><Play className="mr-2 h-4 w-4" /> Run What-If Simulation</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Results Column */}
        <div className="md:col-span-7">
          {simulationResult ? (
            <Card className="bg-white border-amber-300 shadow-md">
              <CardHeader className="pb-3 border-b bg-amber-50/70 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-amber-950">Simulated Induction Output</CardTitle>
                    <CardDescription className="text-amber-800 text-xs">
                      Solver Time: {simulationResult.stats?.solver_time_ms || 400}ms | Inducted: {simulationResult.stats?.total_inducted || 18} rakes
                    </CardDescription>
                  </div>
                  <Badge className="bg-amber-500 text-white font-bold text-xs">
                    WHAT-IF RUN
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 max-h-[600px] overflow-y-auto">
                <div className="space-y-1">
                  {simulationResult.induction_list?.map((item, idx) => (
                    <InductionListItem key={item.trainset_id || item.number || idx} item={item} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full min-h-[440px] flex flex-col items-center justify-center p-12 text-center text-slate-400 bg-white border-dashed">
              <SlidersHorizontal className="h-12 w-12 mx-auto mb-3 text-amber-400 opacity-60" />
              <p className="font-bold text-slate-700 text-base">Scenario Output Ready</p>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Configure weights or select specific trainsets to simulate unscheduled withdrawals, then click "Run What-If Simulation".
              </p>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
}
