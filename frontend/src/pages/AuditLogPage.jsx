import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Search, RefreshCw, ScrollText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';

export default function AuditLogPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Fetch real audit logs from live database
  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/audit');
        if (Array.isArray(res)) return res;
      } catch (e) {
        // Fallback directly to Supabase table
      }
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);
      return data || [];
    }
  });

  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase();
    return (
      (log.user_name || '').toLowerCase().includes(term) ||
      (log.action || '').toLowerCase().includes(term) ||
      (log.resource_type || '').toLowerCase().includes(term) ||
      (log.resource_id || '').toLowerCase().includes(term)
    );
  });

  // 2. Real CSV Export of Audit Trail
  const exportAuditLogsCSV = () => {
    if (!logs.length) {
      toast({
        title: "No logs to export",
        description: "There are currently no recorded audit logs.",
      });
      return;
    }

    const headers = ["Timestamp", "User / Agent", "Action", "Resource Type", "Resource ID", "IP Address"];
    const rows = logs.map(l => [
      l.timestamp,
      `"${l.user_name || 'System'}"`,
      l.action,
      l.resource_type,
      l.resource_id || '',
      l.ip_address || ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `kmrl_audit_trail_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Audit Trail Exported",
      description: `Downloaded ${logs.length} audit records as CSV.`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Audit Trail</h1>
          <p className="text-sm text-slate-500 mt-1">Immutable audit logging of every optimizer run, schedule approval, and data override.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" onClick={() => refetch()} size="sm" className="bg-white">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
          <Button onClick={exportAuditLogsCSV} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Download className="mr-2 h-4 w-4" /> Export Logs (CSV)
          </Button>
        </div>
      </div>

      <Card className="bg-white border-slate-200/80 shadow-xs">
        <CardHeader className="pb-3 border-b">
          <div className="flex gap-4 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search audit trail by user, action, or resource..." 
                className="pl-9 bg-slate-50 border-slate-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp (UTC)</TableHead>
                  <TableHead>User / Authority</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target Entity</TableHead>
                  <TableHead>Resource ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap font-mono">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN') : 'Just now'}
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900 text-xs">
                        {log.user_name || 'KMRL System / Controller'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          log.action?.includes('create') || log.action?.includes('generate') ? 'text-emerald-700 bg-emerald-50 border-emerald-200 font-mono text-[11px]' :
                          log.action?.includes('approve') || log.action?.includes('update') ? 'text-indigo-700 bg-indigo-50 border-indigo-200 font-mono text-[11px]' :
                          'text-amber-700 bg-amber-50 border-amber-200 font-mono text-[11px]'
                        }>
                          {log.action?.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-700 font-mono text-xs font-medium">
                        {log.resource_type}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono">
                        {log.resource_id ? `${log.resource_id.slice(0, 16)}...` : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-slate-500">
                      <ScrollText className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-medium text-slate-700 text-xs">No audit records found</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Actions performed in the system will automatically appear in this immutable trail.</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
