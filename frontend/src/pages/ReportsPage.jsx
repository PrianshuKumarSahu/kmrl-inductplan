import React, { useState } from 'react';
import { FileBarChart, Download, FileText, Check, ShieldCheck, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function ReportsPage() {
  const { toast } = useToast();
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // 1. Download Daily PDF Report
  const [isDownloading, setIsDownloading] = useState(false);
  const downloadDailyPDF = async () => {
    try {
      setIsDownloading(true);
      await api.downloadBlob(`/api/reports/${reportDate}`, `KMRL_Induction_Report_${reportDate}.pdf`);
      toast({
        title: 'Official PDF Downloaded',
        description: `Downloaded KMRL Induction Planning Report for ${reportDate}.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Download Failed',
        description: err.response?.data?.detail || err.message || 'Could not generate PDF report.',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // 2. Download Branding SLA CSV Report
  const downloadBrandingCSV = async () => {
    try {
      const contracts = await api.get('/api/branding');
      const headers = ["Advertiser", "Campaign", "Assigned Trainset", "Weekly Target (Hrs)", "Weekly Actual (Hrs)", "Total Lifetime (Hrs)", "Penalty/Hr (INR)", "Status"];
      const rows = contracts.map(c => [
        `"${c.advertiser_name}"`,
        `"${c.campaign_name || ''}"`,
        c.trainsets?.number || 'KM Rake',
        c.required_hours_per_week,
        c.actual_hours_this_week,
        c.total_hours_served,
        c.penalty_per_hour_missed,
        c.is_active ? 'Active' : 'Expired'
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `KMRL_Branding_SLA_Audit_${reportDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Branding SLA Exported',
        description: `Exported ${contracts.length} advertiser contract metrics.`,
      });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Export Failed', description: err.message });
    }
  };

  // 3. Download ML Maintenance & Risk Forecast Report
  const downloadMLForecastCSV = async () => {
    try {
      const predictions = await api.get('/api/ml/predictions');
      const headers = ["Trainset", "Display Name", "Risk Label", "Failure Probability (%)", "Expected KM Tomorrow", "Cert RS (Days)", "Cert SIG (Days)", "Cert TEL (Days)"];
      const rows = predictions.map(p => [
        p.number,
        `"${p.name || ''}"`,
        p.risk_label,
        p.maintenance_risk_percent,
        Math.round(p.expected_km_tomorrow),
        p.cert_rs_days ?? 'N/A',
        p.cert_sig_days ?? 'N/A',
        p.cert_tel_days ?? 'N/A'
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `KMRL_Predictive_Maintenance_Risk_${reportDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'ML Risk Forecast Exported',
        description: `Exported telemetry predictions for ${predictions.length} trainsets.`,
      });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Export Failed', description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports & Audit Documentation</h1>
          <p className="text-sm text-slate-500 mt-1">Download official KMRL compliance, financial SLA, and ML induction reports.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-slate-500 font-medium">Target Date:</Label>
          <Input 
            type="date" 
            value={reportDate} 
            onChange={(e) => setReportDate(e.target.value)}
            className="w-36 bg-white h-9 text-xs font-mono"
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* Daily PDF Report */}
        <Card className="bg-white border-slate-200/80 shadow-xs flex flex-col justify-between">
          <CardHeader>
            <div className="h-10 w-10 bg-indigo-50 text-indigo-700 rounded-xl flex items-center justify-center mb-2">
              <FileText className="h-5 w-5" />
            </div>
            <CardTitle className="text-base font-bold text-slate-900">Daily Induction PDF Report</CardTitle>
            <CardDescription>
              Official signed schedule with CP-SAT scores, explanation logs, and fitness cert validity windows.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 flex flex-col gap-3">
            <div className="text-[11px] text-slate-600 border border-slate-100 rounded-lg p-2.5 bg-slate-50">
              <div className="flex items-center gap-1.5 mb-1 text-emerald-700 font-semibold">
                <Check className="h-3.5 w-3.5" /> Python ReportLab Generated
              </div>
              Format: Official PDF Document with Logo & Signoff
            </div>
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold" onClick={downloadDailyPDF}>
              <Download className="mr-2 h-4 w-4" /> Download PDF Report
            </Button>
          </CardContent>
        </Card>

        {/* Branding SLA Report */}
        <Card className="bg-white border-slate-200/80 shadow-xs flex flex-col justify-between">
          <CardHeader>
            <div className="h-10 w-10 bg-indigo-50 text-indigo-700 rounded-xl flex items-center justify-center mb-2">
              <FileBarChart className="h-5 w-5" />
            </div>
            <CardTitle className="text-base font-bold text-slate-900">Advertiser Branding SLA Audit</CardTitle>
            <CardDescription>
              Cumulative exposure hours vs contractual targets for advertiser SLA compliance & billing.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 flex flex-col gap-3">
            <div className="text-[11px] text-slate-600 border border-slate-100 rounded-lg p-2.5 bg-slate-50">
              <div className="flex items-center gap-1.5 mb-1 text-indigo-700 font-semibold">
                <ShieldCheck className="h-3.5 w-3.5" /> Financial SLA Validation
              </div>
              Format: Structured CSV Audit Spreadsheet
            </div>
            <Button className="w-full bg-slate-800 hover:bg-slate-900 text-white" onClick={downloadBrandingCSV}>
              <Download className="mr-2 h-4 w-4" /> Export Branding Audit (CSV)
            </Button>
          </CardContent>
        </Card>

        {/* ML Maintenance Risk Forecast */}
        <Card className="bg-white border-slate-200/80 shadow-xs flex flex-col justify-between">
          <CardHeader>
            <div className="h-10 w-10 bg-indigo-50 text-indigo-700 rounded-xl flex items-center justify-center mb-2">
              <Sparkles className="h-5 w-5" />
            </div>
            <CardTitle className="text-base font-bold text-slate-900">Predictive Maintenance Forecast</CardTitle>
            <CardDescription>
              XGBoost failure probabilities, remaining fitness certificate days, and mileage accumulation forecasts.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 flex flex-col gap-3">
            <div className="text-[11px] text-slate-600 border border-slate-100 rounded-lg p-2.5 bg-slate-50">
              <div className="flex items-center gap-1.5 mb-1 text-purple-700 font-semibold">
                <Sparkles className="h-3.5 w-3.5" /> Machine Learning Telemetry
              </div>
              Format: Telemetry CSV Heatmap
            </div>
            <Button className="w-full bg-slate-800 hover:bg-slate-900 text-white" onClick={downloadMLForecastCSV}>
              <Download className="mr-2 h-4 w-4" /> Export ML Risk Forecast (CSV)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
