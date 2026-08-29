import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Download, Filter, Train, Calendar, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import TrainsetCard from '@/components/fleet/TrainsetCard';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function FleetPage() {
  const { isRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [formData, setFormData] = useState({
    number: '',
    name: '',
    total_mileage_km: 120000,
    current_bay_position: 'IBL-A1',
    status: 'ready',
    cert_rs_valid_until: '2026-11-30',
    cert_signalling_valid_until: '2026-11-30',
    cert_telecom_valid_until: '2026-11-30',
    year_of_manufacture: 2018,
    manufacturer: 'BEML'
  });

  // 1. Fetch Real Fleet Data from FastAPI Backend
  const { data: fleet = [], isLoading } = useQuery({
    queryKey: ['fleet'],
    queryFn: () => api.get('/api/fleet'),
  });

  // 2. Add Trainset Mutation
  const addMutation = useMutation({
    mutationFn: (data) => api.post('/api/fleet', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet'] });
      setIsAddOpen(false);
      toast({
        title: 'Trainset Added',
        description: `Trainset ${formData.number} has been registered in the fleet.`,
      });
      setFormData({
        number: '',
        name: '',
        total_mileage_km: 120000,
        current_bay_position: 'IBL-A1',
        status: 'ready',
        cert_rs_valid_until: '2026-11-30',
        cert_signalling_valid_until: '2026-11-30',
        cert_telecom_valid_until: '2026-11-30',
        year_of_manufacture: 2018,
        manufacturer: 'BEML'
      });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Error adding trainset',
        description: err.response?.data?.detail || err.message,
      });
    }
  });

  const handleAddSubmit = (e) => {
    e.preventDefault();
    const cleanNumber = formData.number.trim().toUpperCase().replace(/\s+/g, '-');
    addMutation.mutate({
      ...formData,
      number: cleanNumber,
      total_mileage_km: Number(formData.total_mileage_km),
      year_of_manufacture: Number(formData.year_of_manufacture)
    });
  };

  const filteredFleet = fleet.filter(train => {
    const matchesSearch = (train.number || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (train.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || train.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Real CSV Export
  const exportCSV = () => {
    if (!fleet.length) return;
    const headers = ["Number", "Name", "Status", "Mileage (km)", "Bay", "RS Cert Expiry", "Signalling Cert Expiry", "Telecom Cert Expiry"];
    const rows = fleet.map(t => [
      t.number,
      t.name || '',
      t.status,
      t.total_mileage_km,
      t.current_bay_position || '',
      t.cert_rs_valid_until || '',
      t.cert_signalling_valid_until || '',
      t.cert_telecom_valid_until || ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `kmrl_fleet_inventory_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Fleet Data Exported",
      description: `Downloaded ${fleet.length} trainsets as CSV.`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Fleet Management</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and monitor all Kochi Metro trainsets (KM-01 to KM-25).</p>
        </div>
        
        <div className="flex items-center gap-2.5">
          <Button variant="outline" onClick={exportCSV} className="bg-white">
            <Download className="mr-2 h-4 w-4 text-slate-600" /> Export CSV
          </Button>
          {isRole('operator') && (
            <Button onClick={() => setIsAddOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="mr-2 h-4 w-4" /> Add Trainset
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
                placeholder="Search by train number (KM-01) or station name..." 
                className="pl-9 bg-slate-50 border-slate-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-[220px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-slate-50 border-slate-200">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-slate-400" />
                    <SelectValue placeholder="Filter Status" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Fleet Statuses ({fleet.length})</SelectItem>
                  <SelectItem value="ready">Ready for Service</SelectItem>
                  <SelectItem value="standby">Standby Bay</SelectItem>
                  <SelectItem value="maintenance">Inspection / Maintenance</SelectItem>
                  <SelectItem value="inspection">IBL Track Line</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 15 }).map((_, i) => (
            <Skeleton key={i} className="h-[210px] w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredFleet.length > 0 ? (
            filteredFleet.map(train => (
              <TrainsetCard key={train.id} trainset={train} />
            ))
          ) : (
            <div className="col-span-full py-16 text-center text-slate-500 bg-white rounded-xl border border-dashed">
              <Train className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700">No trainsets found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your search query or status filter.</p>
            </div>
          )}
        </div>
      )}

      {/* Add Trainset Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Register New Trainset</DialogTitle>
            <DialogDescription>
              Add a new four-car rake to the Kochi Metro fleet registry.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="number">Rake Number</Label>
                <Input 
                  id="number" 
                  placeholder="e.g. KM-26" 
                  required
                  value={formData.number}
                  onChange={(e) => setFormData({...formData, number: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Display Name</Label>
                <Input 
                  id="name" 
                  placeholder="e.g. Kakkanad Express" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mileage">Accumulated Mileage (km)</Label>
                <Input 
                  id="mileage" 
                  type="number"
                  value={formData.total_mileage_km}
                  onChange={(e) => setFormData({...formData, total_mileage_km: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bay">Bay Position</Label>
                <Input 
                  id="bay" 
                  placeholder="e.g. IBL-G2" 
                  value={formData.current_bay_position}
                  onChange={(e) => setFormData({...formData, current_bay_position: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t">
              <Label className="text-xs font-bold text-slate-500 uppercase">Fitness Certificates Valid Until</Label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-500">Rolling Stock</Label>
                  <Input 
                    type="date" 
                    value={formData.cert_rs_valid_until}
                    onChange={(e) => setFormData({...formData, cert_rs_valid_until: e.target.value})}
                    className="text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-500">Signalling</Label>
                  <Input 
                    type="date" 
                    value={formData.cert_signalling_valid_until}
                    onChange={(e) => setFormData({...formData, cert_signalling_valid_until: e.target.value})}
                    className="text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-500">Telecom</Label>
                  <Input 
                    type="date" 
                    value={formData.cert_telecom_valid_until}
                    onChange={(e) => setFormData({...formData, cert_telecom_valid_until: e.target.value})}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {addMutation.isPending ? 'Registering...' : 'Register Trainset'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
