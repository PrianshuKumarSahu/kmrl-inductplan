import axios from 'axios';
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_URL,
});

apiClient.interceptors.request.use(async (config) => {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      config.headers.Authorization = `Bearer ${data.session.access_token}`;
    }
  } catch (e) {
    // Proceed without token if session extraction fails
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export const api = {
  get: (path) => apiClient.get(path).then(res => res.data),
  post: (path, body) => apiClient.post(path, body).then(res => res.data),
  put: (path, body) => apiClient.put(path, body).then(res => res.data),
  delete: (path) => apiClient.delete(path).then(res => res.data),
  postForm: (path, formData) => apiClient.post(path, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(res => res.data),
  downloadBlob: async (path, filename) => {
    const response = await apiClient.get(path, {
      responseType: 'blob',
    });
    const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 200);
  }
};
