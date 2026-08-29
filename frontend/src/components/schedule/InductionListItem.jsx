import React, { useState } from 'react';
import { Badge } from '../ui/badge';
import { ChevronDown, ChevronUp, AlertTriangle, ShieldCheck, Megaphone, MapPin } from 'lucide-react';

export default function InductionListItem({ item }) {
  const [expanded, setExpanded] = useState(false);
  
  const rank = item.rank;
  const number = item.number || item.trainset_number || 'KM-XX';
  const name = item.name || item.trainset_name || 'Kochi Metro Rake';
  const score = typeof item.score === 'number' ? item.score : 80;
  const isInducted = item.inducted ?? item.is_inducted ?? false;
  const explanation = item.explanation || (isInducted ? 'Inducted based on optimal fitness and branding score.' : 'Kept in standby / inspection bay.');
  const conflicts = item.conflicts || [];
  const bay = item.bay_position || item.current_bay_position;
  const advertiser = item.branding_advertiser;

  return (
    <div className={`border rounded-xl mb-2.5 overflow-hidden transition-all ${
      isInducted 
        ? 'bg-white border-indigo-200 shadow-xs hover:border-indigo-300' 
        : 'bg-slate-50/80 border-slate-200 opacity-90'
    }`}>
      <div 
        className="flex items-center p-3.5 px-4 cursor-pointer hover:bg-slate-50/80 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-shrink-0 mr-3.5">
          <div className={`flex items-center justify-center h-7 w-7 rounded-full font-bold text-xs ${
            isInducted ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-slate-200 text-slate-600'
          }`}>
            {rank || '—'}
          </div>
        </div>
        
        <div className="flex-grow min-w-0 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-bold text-slate-900 text-sm">{number}</span>
            <span className="text-xs text-slate-500 font-medium truncate max-w-[160px]">{name}</span>
            {bay && (
              <span className="inline-flex items-center text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                <MapPin className="h-2.5 w-2.5 mr-0.5 text-slate-400" /> {bay}
              </span>
            )}
            {advertiser && (
              <span className="inline-flex items-center text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                <Megaphone className="h-2.5 w-2.5 mr-0.5 text-indigo-500" /> {advertiser}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2.5 self-end md:self-auto">
            {conflicts.length > 0 && (
              <Badge variant="destructive" className="h-5 text-[10px] px-1.5 flex items-center gap-1 bg-red-100 text-red-700 hover:bg-red-100 border-none font-medium">
                <AlertTriangle className="h-3 w-3" />
                {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}
              </Badge>
            )}
            
            <div className="flex items-center gap-1">
              <Badge variant="outline" className={`font-mono font-bold text-xs px-2 py-0.5 ${
                score >= 80 ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 
                score >= 50 ? 'text-amber-700 border-amber-200 bg-amber-50' : 
                'text-slate-600 bg-slate-50'
              }`}>
                {score.toFixed(1)} pts
              </Badge>
            </div>
            
            <Badge className={
              isInducted 
                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none font-bold text-[10px] px-2.5 py-0.5' 
                : 'bg-slate-200 text-slate-600 hover:bg-slate-200 border-none font-medium text-[10px] px-2.5 py-0.5'
            }>
              {isInducted ? '✅ INDUCTED' : '⏸ STANDBY'}
            </Badge>

            <div className="text-slate-400 ml-1">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </div>
      </div>
      
      {expanded && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs">
          <div className="flex items-start gap-2">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mt-0.5">Decision Logic:</span>
            <p className="text-slate-700 flex-1 leading-relaxed">{explanation}</p>
          </div>
          
          {conflicts && conflicts.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-slate-200/80">
              <h5 className="font-bold text-red-700 text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Conflict & Constraint Details:
              </h5>
              <ul className="list-disc pl-5 text-red-600 space-y-0.5 text-xs">
                {conflicts.map((c, i) => (
                  <li key={i}>{typeof c === 'object' ? JSON.stringify(c) : c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
