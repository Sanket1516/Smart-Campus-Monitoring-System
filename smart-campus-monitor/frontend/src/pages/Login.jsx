import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineEye, HiOutlineEyeOff, HiOutlineLockClosed, HiOutlineUser } from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';
import CampusStage from '../components/brand/CampusStage';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
      toast.success('Signed in');
      navigate('/dashboard');
    } catch (err) {
      const message = err.response?.data?.message || 'Sign-in failed. Check your credentials.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const onKey = (event) => setCapsLock(Boolean(event.getModifierState?.('CapsLock')));

  return (
    <div className="dark grid min-h-screen bg-ink-900 text-ink-100 lg:grid-cols-[1.25fr_1fr]">
      {/* Left: cinematic campus */}
      <section className="relative hidden overflow-hidden border-r border-white/5 lg:block" aria-label="Sentinel platform">
        <CampusStage className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-ink-950/60" />
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <Link to="/" className="flex w-fit items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_#22d3ee]" />
            </span>
            <span className="font-display text-lg font-semibold text-white">Sentinel</span>
          </Link>
          <div className="max-w-xl">
            <p className="eyebrow mb-4">Smart campus security console</p>
            <h1 className="display-lg text-white">
              Enrol once.
              <br />
              Every gate knows.
            </h1>
            <p className="mt-4 max-w-md text-ink-200">
              Central biometric enrolment, a dedicated entry terminal and a dedicated exit terminal. Every movement on campus is
              recorded, in real time.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="chip-info">Device 1 · Enrolment</span>
              <span className="chip-ok">Device 2 · Entry</span>
              <span className="chip-info">Device 3 · Exit</span>
            </div>
          </div>
        </div>
      </section>

      {/* Right: sign-in form */}
      <main className="relative flex items-center justify-center px-6 py-12">
        <div className="aurora absolute inset-0 -z-10 opacity-60 lg:opacity-30" />
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10">
                <span className="h-2 w-2 rounded-full bg-cyan-300" />
              </span>
              <span className="font-display text-lg font-semibold text-white">Sentinel</span>
            </div>
          </div>
          <p className="eyebrow mb-3">Authorised personnel</p>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-white">Sign in</h2>
          <p className="mt-2 text-sm text-ink-300">Administrators, security staff and wardens.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div>
              <label htmlFor="username" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-300">
                Username
              </label>
              <div className="relative">
                <HiOutlineUser className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-3 text-white placeholder:text-ink-500 focus:border-cyan-400/60 focus:outline-none"
                  placeholder="your.username"
                  aria-invalid={Boolean(error) && !username}
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-300">
                Password
              </label>
              <div className="relative">
                <HiOutlineLockClosed className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={onKey}
                  onKeyDown={onKey}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-11 text-white placeholder:text-ink-500 focus:border-cyan-400/60 focus:outline-none"
                  placeholder="••••••••"
                  aria-invalid={Boolean(error) && !password}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <HiOutlineEyeOff className="h-4 w-4" /> : <HiOutlineEye className="h-4 w-4" />}
                </button>
              </div>
              {capsLock && <p className="mt-1.5 text-xs text-amber-300">Caps Lock is on.</p>}
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-accent w-full py-3 disabled:opacity-60">
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Verifying…
                </>
              ) : (
                'Sign in to console'
              )}
            </button>
          </form>

          <div className="mt-8 flex items-center justify-between text-xs text-ink-400">
            <span>Access is issued by the administrator.</span>
            <Link to="/" className="text-ink-200 hover:text-white">
              About the platform →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
