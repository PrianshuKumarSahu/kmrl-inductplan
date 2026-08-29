import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, RefreshCw, AlertTriangle, Activity, TrendingUp, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Link } from 'react-router-dom';

export default function MLInsightsPage() {
  const { isRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 1. Fetch ML Predictions
  const { data: predictions = [], isLoading: predLoading } = useQuery({
    queryKey: ['mlPredictions'],
    queryFn: () => api.get('/api/ml/predictions'),
  });

  // 2. Fetch Mileage Forecast
  const { data: forecast = [], isLoading: forecastLoading } = useQuery({
    queryKey: ['mlMileageForecast'],
    queryFn: () => api.get('/api/ml/forecast/mileage'),
  });

  // 3. Fetch Model Status
  const { data: modelStatus = [] } = useQuery({
    queryKey: ['mlStatus'],
    queryFn: () => api.get('/api/ml/status'),
  });

  // 4. Retrain Mutation
  const trainMutation = useMutation({
    mutationFn: () => api.post('/api/ml/train'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['mlPredictions'] });
      queryClient.invalidateQueries({ queryKey: ['mlMileageForecast'] });
      queryClient.invalidateQueries({ queryKey: ['mlStatus'] });
      toast({
        title: 'ML Models Retrained Successfully',
        description: `XGBoost Classifier & Regressor retrained on updated fleet telemetry.`,
      });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Training Failed',
        description: err.response?.data?.detail || err.message,
      });
    }
  });

  const activeMaintModel = modelStatus.find(m => m.model_type === 'maintenance_risk') || {
    version: '1.0 (XGBoost)',
    accuracy: 0.945,
    training_samples: 1000
  };

  const topRisks = predictions.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Machine Learning Intelligence</h1>
          <p className="text-sm text-slate-500 mt-1">XGBoost-powered failure risk forecasting & daily kilometer demand regression.</p>
        </div>
        
        {isRole('supervisor') && (
          <Button 
            onClick={() => trainMutation.mutate()} 
            disabled={trainMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${trainMutation.isPending ? 'animate-spin' : ''}`} />
            {trainMutation.isPending ? 'Retraining XGBoost...' : 'Retrain ML Models'}
          </Button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        
        {/* Model Architecture & Performance */}
        <Card className="bg-slate-900 text-white border-slate-800 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                  <Brain className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-white text-base">Maintenance Risk Classifier</CardTitle>
                  <CardDescription className="text-slate-400 text-xs">XGBoost Binary Classifier with Cost-Sensitive Weighting</CardDescription>
                </div>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-none font-mono text-[11px]">
                ACTIVE
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            <div className="flex justify-between border-b border-slate-800 pb-2 text-xs">
              <span className="text-slate-400">Model Accuracy</span>
              <span className="font-bold text-emerald-400">{(activeMaintModel.accuracy * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-2 text-xs">
              <span className="text-slate-400">Feature Dimensions</span>
              <span className="font-medium text-white">12 Telemetry Variables</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-2 text-xs">
              <span className="text-slate-400">Training Samples</span>
              <span className="font-medium text-white">{activeMaintModel.training_samples || 1000} telemetry epochs</span>
            </div>
            <div className="pt-2 text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              ⚡ Evaluates fitness cert countdowns, open work orders, accumulated mileage, and recent service intensity to flag rakes at risk of mid-service breakdown before CP-SAT solver runs.
            </div>
          </CardContent>
        </Card>

        {/* Top Risk Alerts */}
        <Card className="bg-white border-slate-200/80 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <CardTitle className="text-base font-bold text-slate-900">Highest Risk Predictions</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">Next 7 Days</Badge>
            </div>
            <CardDescription>Trainsets prioritized for Inspection Bay Line (IBL) allocation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {predLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : topRisks.length > 0 ? (
              topRisks.map((item) => (
                <div key={item.trainset_id} className="flex items-center justify-between p-2.5 px-3 bg-slate-50 border border-slate-100 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900 text-xs">{item.number}</span>
                    <div>
                      <span className="text-[11px] text-slate-600 block">{item.name || 'Metro Rake'}</span>
                      <span className="text-[10px] text-slate-400">
                        RS Cert: {item.cert_rs_days ?? '?'}d | Open Jobs: {item.features_used?.open_job_cards_count || 0}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={
                      item.maintenance_risk_probability > 0.4 ? 'bg-red-100 text-red-700 border-none font-bold text-xs' :
                      item.maintenance_risk_probability > 0.2 ? 'bg-amber-100 text-amber-800 border-none font-semibold text-xs' :
                      'bg-emerald-100 text-emerald-800 border-none text-xs'
                    }>
                      {item.maintenance_risk_percent}% Risk
                    </Badge>
                    <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-indigo-600">
                      <Link to={`/fleet/${item.trainset_id}`}>Inspect</Link>
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-xs text-slate-400">No risk anomalies detected</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 7-Day Mileage Demand Forecast Chart */}
      <Card className="bg-white border-slate-200/80 shadow-xs">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
              <CardTitle className="text-base font-bold text-slate-900">7-Day Mileage Demand Forecaster</CardTitle>
            </div>
            <Badge variant="outline" className="font-mono text-xs bg-slate-50">XGBoost Regressor</Badge>
          </div>
          <CardDescription>Predicted daily kilometer load per inducted trainset for Kochi Metro Line 1</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forecast} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day_name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[400, 750]} />
                <Tooltip 
                  formatter={(val) => [`${Math.round(val)} km / rake`, 'Expected Daily Run']}
                  labelFormatter={(lbl) => `Forecast: ${lbl}`}
                />
                <Bar dataKey="predicted_km" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Full Fleet Risk Table */}
      <Card className="bg-white border-slate-200/80 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-900">Fleet-Wide Risk Heatmap</CardTitle>
          <CardDescription>Predictive maintenance score & failure probabilities for all 25 trainsets</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trainset</TableHead>
                <TableHead>Name / Line</TableHead>
                <TableHead>Risk Category</TableHead>
                <TableHead className="w-[30%]">Unscheduled Maintenance Probability</TableHead>
                <TableHead>Expected Run Tomorrow</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {predictions.map((p) => (
                <TableRow key={p.trainset_id}>
                  <TableCell className="font-bold text-slate-900 text-xs">{p.number}</TableCell>
                  <TableCell className="text-xs text-slate-600">{p.name || 'Metro Rake'}</TableCell>
                  <TableCell>
                    <Badge className={
                      p.risk_label === 'Critical' ? 'bg-red-100 text-red-700 border-none font-bold text-[10px]' :
                      p.risk_label === 'High' ? 'bg-amber-100 text-amber-800 border-none font-semibold text-[10px]' :
                      p.risk_label === 'Medium' ? 'bg-blue-100 text-blue-800 border-none text-[10px]' :
                      'bg-emerald-100 text-emerald-800 border-none text-[10px]'
                    }>
                      {p.risk_label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            p.maintenance_risk_probability > 0.4 ? 'bg-red-500' :
                            p.maintenance_risk_probability > 0.2 ? 'bg-amber-500' :
                            'bg-emerald-500'
                          }`}
                          style={{ width: `${p.maintenance_risk_percent}%` }}
                        ></div>
                      </div>
                      <span className="font-mono text-xs font-semibold text-slate-700 w-12 text-right">
                        {p.maintenance_risk_percent}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-slate-700 font-medium">
                    {Math.round(p.expected_km_tomorrow)} km
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild className="text-xs text-indigo-600">
                      <Link to={`/fleet/${p.trainset_id}`}>Details</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
