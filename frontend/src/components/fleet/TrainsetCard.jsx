import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { CheckCircle2, XCircle, AlertTriangle, ChevronRight } from 'lucide-react';
import { getCertStatus, getStatusColor, formatKm } from '@/lib/utils';

export default function TrainsetCard({ trainset }) {
  const navigate = useNavigate();

  const rsDate = trainset.cert_rs_valid_until || trainset.rs_cert_valid_until;
  const sigDate = trainset.cert_signalling_valid_until || trainset.sig_cert_valid_until;
  const telDate = trainset.cert_telecom_valid_until || trainset.tel_cert_valid_until;
  const mileage = trainset.total_mileage_km ?? trainset.mileage ?? 0;
  const bay = trainset.current_bay_position || trainset.bay_position || 'Unassigned';
  const openJobs = trainset.open_jobs_count ?? (trainset.has_critical_jobs ? 1 : 0);
  const criticalJobs = trainset.critical_jobs_count ?? (trainset.has_critical_jobs ? 1 : 0);

  const renderCertIcon = (date) => {
    const status = getCertStatus(date);
    if (status === 'valid') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (status === 'expiring') return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  return (
    <Card 
      className="cursor-pointer transition-all hover:shadow-md hover:border-indigo-300 bg-white"
      onClick={() => navigate(`/fleet/${trainset.id}`)}
    >
      <CardHeader className="pb-2 pt-3 px-3.5 flex flex-row items-start justify-between space-y-0">
        <div>
          <Badge className="text-xs font-bold bg-indigo-100 text-indigo-800 hover:bg-indigo-100 border-none px-2 py-0.5">
            {trainset.number}
          </Badge>
          <div className="mt-1 text-xs text-slate-600 font-medium truncate max-w-[120px]">{trainset.name || 'Metro Rake'}</div>
        </div>
        <Badge className={`text-[10px] uppercase font-semibold border-none ${getStatusColor(trainset.status)}`}>
          {trainset.status || 'ready'}
        </Badge>
      </CardHeader>
      
      <CardContent className="px-3.5 py-2.5 border-y border-slate-100 bg-slate-50/60">
        <div className="flex justify-between items-center mb-2.5">
          <div className="text-xs">
            <span className="text-slate-500 text-[10px] block">Mileage</span>
            <span className="font-semibold text-slate-800">{formatKm(mileage)}</span>
          </div>
          <div className="text-xs text-right">
            <span className="text-slate-500 text-[10px] block">Bay</span>
            <span className="font-medium text-slate-700">{bay}</span>
          </div>
        </div>

        <div className="flex justify-between gap-1.5 mt-2">
          <div className="flex flex-col items-center gap-1 bg-white p-1.5 rounded border border-slate-200/80 flex-1 shadow-2xs">
            <span className="text-[9px] font-bold text-slate-400">RS</span>
            {renderCertIcon(rsDate)}
          </div>
          <div className="flex flex-col items-center gap-1 bg-white p-1.5 rounded border border-slate-200/80 flex-1 shadow-2xs">
            <span className="text-[9px] font-bold text-slate-400">SIG</span>
            {renderCertIcon(sigDate)}
          </div>
          <div className="flex flex-col items-center gap-1 bg-white p-1.5 rounded border border-slate-200/80 flex-1 shadow-2xs">
            <span className="text-[9px] font-bold text-slate-400">TEL</span>
            {renderCertIcon(telDate)}
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="px-3.5 py-2 bg-slate-50 flex items-center justify-between rounded-b-xl">
        <div className="flex items-center gap-2">
          {criticalJobs > 0 ? (
            <Badge variant="destructive" className="text-[10px] h-4 px-1.5 bg-red-100 text-red-700 hover:bg-red-100 border-none">
              Critical Work
            </Badge>
          ) : openJobs > 0 ? (
            <Badge className="text-[10px] h-4 px-1.5 bg-amber-100 text-amber-800 hover:bg-amber-100 border-none">
              {openJobs} Open Job
            </Badge>
          ) : (
            <span className="text-[11px] text-slate-400">All Jobs Clear</span>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </CardFooter>
    </Card>
  );
}
