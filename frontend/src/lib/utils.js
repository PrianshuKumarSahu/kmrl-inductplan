import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatDate(date) {
  if (!date) return '';
  return format(new Date(date), "dd MMM yyyy");
}

export function formatDateTime(date) {
  if (!date) return '';
  return format(new Date(date), "dd MMM yyyy, hh:mm a");
}

export function formatKm(km) {
  if (km === null || km === undefined) return '';
  return new Intl.NumberFormat('en-IN').format(km) + ' km';
}

export function getCertStatus(validUntilDate) {
  if (!validUntilDate) return 'expired';
  
  const today = new Date();
  const validUntil = new Date(validUntilDate);
  const diffTime = validUntil - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return 'expired';
  if (diffDays <= 7) return 'expiring';
  return 'valid';
}

export function getStatusColor(status) {
  switch (status?.toLowerCase()) {
    case 'available':
    case 'ready':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'maintenance':
    case 'repair':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 'offline':
    case 'critical':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400';
  }
}

export function getPriorityColor(priority) {
  switch (priority?.toLowerCase()) {
    case 'critical':
    case 'high':
      return 'destructive'; // For badge variant mapping
    case 'medium':
      return 'warning';
    case 'low':
      return 'success';
    default:
      return 'default';
  }
}
