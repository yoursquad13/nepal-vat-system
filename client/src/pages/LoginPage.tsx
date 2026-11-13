import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function LoginPage() {
  const { user, login } = useAuth();
  const { success } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // If already authenticated, redirect
  if (user) {
    const from = (location.state as any)?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setErrorMsg('Please enter both username and password.');
      return;
    }

    setLoading(true);
    try {
      const loggedInUser = await login({ username: trimmedUser, password });
      success(`Welcome back, ${loggedInUser.fullName}!`);
      const destination = (location.state as any)?.from?.pathname || '/';
      navigate(destination, { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid username or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (demoUser: 'admin' | 'staff') => {
    if (demoUser === 'admin') {
      setUsername('admin');
      setPassword('Admin@123');
    } else {
      setUsername('staff');
      setPassword('Staff@123');
    }
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Subtle background glow accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-[400px] h-[300px] bg-teal-500/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden relative z-10 animate-slide-up">
        {/* Header Branding */}
        <div className="p-6 sm:p-8 text-center bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-700 flex items-center justify-center text-white mx-auto mb-4 shadow-md shadow-emerald-950/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Nepal VAT & Vendor System
          </h1>
          <p className="text-xs text-slate-500 mt-1.5 font-medium">
            Himalayan Trading Suppliers Pvt. Ltd.
          </p>
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-mono">
            <span>Bikram Sambat (BS) & NPT (UTC+5:45)</span>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8">
          {errorMsg && (
            <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username input */}
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Username or Staff ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin or staff"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors shadow-2xs"
                />
              </div>
            </div>

            {/* Password input */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-10 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In to Dashboard</span>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials Helper */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Seeded Demo Credentials:</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickFill('admin')}
                className="p-2.5 text-left rounded-lg border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 group-hover:text-emerald-800">
                    Administrator
                  </span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600" />
                </div>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">admin</p>
                <p className="text-[10px] text-slate-400">Full Approval & Settings</p>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('staff')}
                className="p-2.5 text-left rounded-lg border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 group-hover:text-emerald-800">
                    Store Staff
                  </span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600" />
                </div>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">staff</p>
                <p className="text-[10px] text-slate-400">Entries & Receipts</p>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="py-3 px-6 bg-slate-50 border-t border-slate-100 text-center text-[11px] text-slate-500">
          Complies with Inland Revenue Department (IRD) Nepal VAT 13% Act
        </div>
      </div>
    </div>
  );
}
