import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';

const authSchema = z.object({
  name: z.string().optional(),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('signin');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(authSchema)
  });

  const onSubmit = async (data) => {
    try {
      setError('');
      setSuccessMsg('');
      if (activeTab === 'signup') {
        const res = await signUp(data.email, data.password, data.name || 'KMRL Supervisor');
        if (res.session) {
          navigate('/');
        } else {
          setSuccessMsg('Account created successfully! You can now sign in.');
          setActiveTab('signin');
        }
      } else {
        await signIn(data.email, data.password);
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      
      {/* Left side - Branding */}
      <div className="hidden md:flex md:w-1/2 bg-indigo-900 flex-col justify-center items-center p-12 text-white relative overflow-hidden">
        {/* Abstract metro graphic background */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <circle cx="20%" cy="30%" r="200" fill="currentColor" />
            <circle cx="80%" cy="80%" r="300" fill="currentColor" />
            <path d="M -100 500 Q 200 100 800 600 T 1200 400" fill="none" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
          </svg>
        </div>

        <div className="relative z-10 max-w-md">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-16 w-16 bg-white rounded-xl flex items-center justify-center text-4xl shadow-xl">
              🚇
            </div>
            <h1 className="text-4xl font-bold tracking-tight">KMRL</h1>
          </div>
          <h2 className="text-3xl font-light mb-4">Induct<span className="font-bold">Plan</span></h2>
          <p className="text-indigo-200 text-lg mb-8 leading-relaxed">
            AI-Driven Train Induction Planning & Scheduling Platform. Optimizing fleet availability, maintenance efficiency, and branding SLAs for Kochi Metro.
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm font-medium text-indigo-200">
            <div className="flex items-center gap-2 bg-indigo-800/60 p-2.5 rounded-lg border border-indigo-700/50">
              <span className="text-emerald-400">●</span> CP-SAT Optimizer
            </div>
            <div className="flex items-center gap-2 bg-indigo-800/60 p-2.5 rounded-lg border border-indigo-700/50">
              <span className="text-cyan-400">●</span> Predictive ML
            </div>
            <div className="flex items-center gap-2 bg-indigo-800/60 p-2.5 rounded-lg border border-indigo-700/50">
              <span className="text-amber-400">●</span> Maximo Integration
            </div>
            <div className="flex items-center gap-2 bg-indigo-800/60 p-2.5 rounded-lg border border-indigo-700/50">
              <span className="text-purple-400">●</span> Stabling Geometry
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          
          <div className="md:hidden flex items-center justify-center gap-2 mb-8">
            <span className="text-3xl">🚇</span>
            <span className="text-2xl font-bold text-indigo-900">KMRL InductPlan</span>
          </div>

          <Card className="border-0 shadow-none bg-transparent md:bg-white md:border md:shadow-sm md:p-4">
            <CardHeader className="space-y-1 pb-4 text-center">
              <CardTitle className="text-2xl font-bold">KMRL Operations Portal</CardTitle>
              <CardDescription>
                Sign in to manage trainset induction & schedules
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setError(''); setSuccessMsg(''); }} className="w-full mb-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Create Account</TabsTrigger>
                </TabsList>
              </Tabs>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                
                {error && (
                  <Alert variant="destructive" className="py-2">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {successMsg && (
                  <Alert className="py-2 border-emerald-500 bg-emerald-50 text-emerald-800">
                    <AlertDescription>{successMsg}</AlertDescription>
                  </Alert>
                )}

                {activeTab === 'signup' && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input 
                      id="name" 
                      type="text" 
                      placeholder="e.g. Ramesh Nair" 
                      {...register('name')}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="supervisor@kmrl.co.in" 
                    {...register('email')}
                    className={errors.email ? "border-red-500" : ""}
                  />
                  {errors.email && (
                    <p className="text-xs text-red-500">{errors.email.message}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                  </div>
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••"
                    {...register('password')}
                    className={errors.password ? "border-red-500" : ""}
                  />
                  {errors.password && (
                    <p className="text-xs text-red-500">{errors.password.message}</p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" className="text-white" />
                      <span>{activeTab === 'signup' ? 'Creating Account...' : 'Authenticating...'}</span>
                    </div>
                  ) : (
                    activeTab === 'signup' ? 'Create Account & Sign In' : 'Sign In to Dashboard'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
          
          <p className="text-center text-xs text-slate-500 mt-8">
            &copy; {new Date().getFullYear()} Kochi Metro Rail Limited. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
