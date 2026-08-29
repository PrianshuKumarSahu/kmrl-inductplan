import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Calendar, Download, Settings2, CheckCircle2, AlertTriangle, FileText, Zap, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import InductionListItem from '@/components/schedule/InductionListItem';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function SchedulePage() {
  const { isRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // 1. Fetch live schedule for selected date (fallback to latest if current date not found)
  const { data: schedule, isLoading } = useQuery({
    queryKey: ['schedule', selectedDate],
    queryFn: async () => {
      try {
        return await api.get(`/api/schedule/${selectedDate}`);
      } catch (err) {
        // If not found for today, try fetching latest
        try {
          return await api.get('/api/schedule/latest');
        } catch {
          return null;
        }
      }
    }
  });

  // 2. Approve Schedule Mutation
  const approveMutation = useMutation({
    mutationFn: (scheduleId) => api.put(`/api/schedule/${scheduleId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      toast({
        title: 'Schedule Approved',
        description: 'Induction plan marked as FINAL for dawn revenue service deployment.',
      });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Approval failed',
        description: err.response?.data?.detail || err.message,
      });
    }
  });

  // 3. Real PDF Download from Backend API
  const [isDownloading, setIsDownloading] = useState(false);
  const handleExportPDF = async () => {
    try {
      setIsDownloading(true);
      const dateToExport = schedule?.schedule_date || selectedDate;
      await api.downloadBlob(`/api/reports/${dateToExport}`, `KMRL_Induction_Report_${dateToExport}.pdf`);
      toast({
        title: 'Report Downloaded',
        description: `Official KMRL PDF report for ${dateToExport} downloaded successfully.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'PDF Generation Failed',
        description: err.response?.data?.detail || err.message || 'Could not export schedule.',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const inductionList = schedule?.induction_list || [];
  const inductedCount = inductionList.filter(i => i.inducted).length;
  const avgScore = inductionList.length > 0
    ? (inductionList.reduce((acc, i) => acc + (i.score || 0), 0) / inductionList.length).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Trainset Induction Plan</h1>
          <p className="text-sm text-slate-500 mt-1">Multi-objective CP-SAT optimization schedule for morning turnout.</p>
        </div>
        
        <div className="flex items-center gap-2.5">
          <Input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40 bg-white"
          />
          {isRole('supervisor') && (
            <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Link to="/schedule/generate">
                <Settings2 className="mr-2 h-4 w-4" /> Run Optimizer
              </Link>
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-8 space-y-4">
            <Skeleton className="h-8 w-[300px]" />
            <Skeleton className="h-[120px] w-full" />
            <Skeleton className="h-[240px] w-full" />
          </CardContent>
        </Card>
      ) : !schedule ? (
        <Card className="border-dashed bg-white border-slate-300">
          <CardContent className="flex flex-col items-center justify-center p-16 text-center">
            <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-600 mb-4">
              <Calendar className="h-10 w-10" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">No Finalized Schedule for {selectedDate}</h3>
            <p className="text-sm text-slate-500 max-w-md mt-1 mb-6">
              Run the AI CP-SAT engine to generate an optimal induction list balancing fitness certs, branding SLAs, and stabling geometry.
            </p>
            {isRole('supervisor') && (
              <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Link to="/schedule/generate" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" /> Launch Induction Optimizer
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Header Summary Banner */}
          <Card className="bg-indigo-900 text-white border-indigo-800 shadow-md">
            <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-5">
              <div className="flex items-center gap-6 w-full sm:w-auto">
                <div>
                  <p className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider mb-1">Approval State</p>
                  <div className="flex items-center gap-2">
                    {schedule.is_final ? (
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-none font-bold text-xs py-1">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> FINAL / APPROVED
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/20 text-amber-300 border-none font-bold text-xs py-1">
                        <AlertTriangle className="h-3.5 w-3.5 mr-1" /> DRAFT SCHEDULE
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="h-10 w-px bg-indigo-800 hidden sm:block"></div>

                <div className="flex gap-6">
                  <div>
                    <p className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider mb-1">Target Inducted</p>
                    <span className="text-xl font-bold">{inductedCount} <span className="text-sm font-normal text-indigo-300">/ {inductionList.length}</span></span>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider mb-1">Optimization Score</p>
                    <span className="text-xl font-bold text-emerald-400">{avgScore} pts</span>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
                <Button variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs" onClick={handleExportPDF}>
                  <FileText className="mr-1.5 h-4 w-4" /> Download PDF
                </Button>
                
                {isRole('supervisor') && !schedule.is_final && (
                  <Button 
                    onClick={() => approveMutation.mutate(schedule.id)} 
                    disabled={approveMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    <ShieldCheck className="mr-1.5 h-4 w-4" /> 
                    {approveMutation.isPending ? 'Finalizing...' : 'Approve Schedule'}
                  </Button>
                )}

                {isRole('supervisor') && (
                  <Button variant="outline" asChild className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs">
                    <Link to="/schedule/whatif">What-If Simulation</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Induction List */}
          <Card className="bg-white border-slate-200/80 shadow-xs">
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Ranked Induction List</CardTitle>
                  <CardDescription>
                    Explainable AI assignments based on 6 inter-dependent KMRL operational variables.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="self-start sm:self-auto text-xs font-mono">
                  Schedule Date: {schedule.schedule_date}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-1">
                {inductionList.map((item, idx) => (
                  <InductionListItem key={item.trainset_id || item.number || idx} item={item} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
