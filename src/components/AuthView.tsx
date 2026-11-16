import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Mail,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useAuth } from '../context/AuthContext';
import { useDataSaver } from '../context/DataSaverContext';
import { uploadProfilePhoto } from '../services/storageService';
import {
  calculateAgeFromDob,
  CITY_SUGGESTIONS,
  FEATURED_COUNTRIES,
  POPULAR_INTERESTS,
  type GenderOption,
  type IntentionOption,
} from '../types/app';
import { BrandLogo } from './BrandLogo';

interface AuthViewProps {
  initialMode?: 'login' | 'register';
  onSuccess: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthView({ initialMode = 'login', onSuccess }: AuthViewProps) {
  const {
    user,
    profileStatus,
    registerWithEmail,
    loginWithEmail,
    loginWithGoogle,
    completeOAuthProfile,
    requestPasswordReset,
    authProviderSetupHint,
  } = useAuth();
  const { dataSaver } = useDataSaver();

  const isCompletingGoogleProfile = Boolean(user && profileStatus === 'missing');

  const [mode, setMode] = useState<'login' | 'register' | 'reset'>(
    isCompletingGoogleProfile ? 'register' : initialMode
  );

  // Login / Reset state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Registration state
  const [fullName, setFullName] = useState(user?.displayName || '');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<GenderOption>('woman');
  const [country, setCountry] = useState('Uganda');
  const [customCountry, setCustomCountry] = useState('');
  const [city, setCity] = useState('Kampala');
  const [intention, setIntention] = useState<IntentionOption>('both');
  const [interests, setInterests] = useState<string[]>([
    'Coffee & Tea',
    'Travel & Culture',
  ]);
  const [bio, setBio] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);

  // Instant validation state
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [statusLabel, setStatusLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const submittingRef = useRef(false);
  const previewUrlRef = useRef<string>('');

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const effectiveCountry =
    country === 'Other' ? customCountry.trim() : country;

  const calculatedAge = dateOfBirth ? calculateAgeFromDob(dateOfBirth) : null;

  const markTouched = (field: string) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  const emailError =
    touched.email && !EMAIL_PATTERN.test(email.trim())
      ? 'Enter a valid email address.'
      : null;

  const passwordError =
    touched.password && password.length < 6
      ? mode === 'login' && password.length === 0
        ? 'Enter your password.'
        : 'Password must be at least 6 characters.'
      : null;

  const fullNameError =
    touched.fullName && fullName.trim().length < 2
      ? 'Enter your full name (at least 2 characters).'
      : null;

  const dobError =
    touched.dateOfBirth &&
    (!dateOfBirth || calculatedAge === null || calculatedAge < 18)
      ? 'You must be at least 18 years old to register.'
      : null;

  const cityError =
    touched.city && city.trim().length < 1 ? 'Enter your city.' : null;

  const toggleInterest = (item: string) => {
    setInterests((prev) => {
      if (prev.includes(item)) return prev.filter((i) => i !== item);
      if (prev.length >= 10) return prev;
      return [...prev, item];
    });
  };

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a JPG, PNG, or WebP image.');
      return;
    }
    setError(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const nextUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextUrl;
    setPhotoFile(file);
    setPhotoPreviewUrl(nextUrl);
  };

  const handleCountryChange = (newCountry: string) => {
    setCountry(newCountry);
    const suggestions = CITY_SUGGESTIONS[newCountry];
    if (suggestions && suggestions.length > 0) {
      setCity(suggestions[0]);
    } else if (newCountry === 'Other') {
      setCity('');
    }
  };

  const submitLogin = async () => {
    if (submittingRef.current || loading) return;
    setTouched((prev) => ({ ...prev, email: true, password: true }));

    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    submittingRef.current = true;
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    setStatusLabel('Signing in...');
    try {
      await loginWithEmail(email, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to log in.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
      setStatusLabel('');
    }
  };

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    void submitLogin();
  };

  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || loading) return;
    setTouched((prev) => ({ ...prev, email: true }));
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    submittingRef.current = true;
    setError(null);
    setLoading(true);
    setStatusLabel('Sending link...');
    try {
      await requestPasswordReset(email);
      setResetSent(true);
      setInfoMessage(
        'If an account exists for that email, a password reset link has been sent.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
      setStatusLabel('');
    }
  };

  const handleGoogleSignIn = async () => {
    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    setStatusLabel('Connecting to Google...');
    try {
      const { needsProfileSetup } = await loginWithGoogle();
      if (!needsProfileSetup) {
        onSuccess();
      } else {
        setMode('register');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
      setStatusLabel('');
    }
  };

  const submitRegister = async () => {
    if (submittingRef.current || loading) return;
    setTouched({
      fullName: true,
      dateOfBirth: true,
      email: true,
      password: true,
      city: true,
    });
    setError(null);

    if (fullName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!dateOfBirth || calculatedAge === null || calculatedAge < 18) {
      setError('You must be at least 18 years old to register.');
      return;
    }
    if (!effectiveCountry || effectiveCountry.length < 2) {
      setError('Please specify your country.');
      return;
    }
    if (city.trim().length < 1) {
      setError('Please enter your city.');
      return;
    }
    if (!isCompletingGoogleProfile) {
      if (!EMAIL_PATTERN.test(email.trim())) {
        setError('Please enter a valid email address.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
    }

    submittingRef.current = true;
    setLoading(true);
    setStatusLabel('Creating account...');
    try {
      if (isCompletingGoogleProfile && user) {
        let photoUrl = '';
        if (photoFile) {
          setStatusLabel('Uploading photo...');
          setUploadProgress(0);
          try {
            photoUrl = await uploadProfilePhoto(
              user.uid,
              photoFile,
              setUploadProgress,
              dataSaver
            );
          } catch (uploadErr) {
            setInfoMessage(
              uploadErr instanceof Error
                ? `Profile saved! You can retry your photo upload from Profile (${uploadErr.message}).`
                : 'Profile saved! You can upload your photo later from Profile.'
            );
          }
        }
        setStatusLabel('Saving profile...');
        await completeOAuthProfile({
          fullName,
          dateOfBirth,
          gender,
          country: effectiveCountry,
          city,
          photoUrl,
          intention,
          interests,
          bio,
        });
        onSuccess();
        return;
      }

      await registerWithEmail(email, password, {
        fullName,
        dateOfBirth,
        gender,
        country: effectiveCountry,
        city,
        photoUrl: '',
        intention,
        interests,
        bio,
      });

      // Only upload profile photo if user explicitly selected one
      if (photoFile) {
        setStatusLabel('Uploading photo...');
        const { auth } = await import('../lib/firebase');
        const { updateMyPublicProfile } = await import('../services/datingService');
        if (auth.currentUser) {
          setUploadProgress(0);
          try {
            const uploadedUrl = await uploadProfilePhoto(
              auth.currentUser.uid,
              photoFile,
              setUploadProgress,
              dataSaver
            );
            await updateMyPublicProfile(auth.currentUser.uid, {
              firstName: fullName.trim().split(/\s+/)[0] || 'Member',
              age: calculatedAge,
              gender,
              country: effectiveCountry,
              city: city.trim(),
              photoUrl: uploadedUrl,
              intention,
              interests,
              bio,
              visibility: 'public',
              emailVerified: auth.currentUser.emailVerified,
            });
          } catch (uploadErr) {
            setInfoMessage(
              uploadErr instanceof Error
                ? `Account created and signed in! You can retry your photo upload from Profile (${uploadErr.message}).`
                : 'Account created and signed in! You can upload your photo later from Profile.'
            );
          }
        }
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
      setStatusLabel('');
      setUploadProgress(null);
    }
  };

  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    void submitRegister();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-16">
      <div className="bg-white rounded-2xl border border-purple-950/10 shadow-sm p-5 sm:p-8">
        <div className="mb-5">
          <BrandLogo size="md" />
          <h1 className="text-2xl sm:text-3xl font-bold text-[#2E1065] mt-3">
            {isCompletingGoogleProfile
              ? 'Complete Your Member Profile'
              : mode === 'register'
                ? 'Create Your Account'
                : mode === 'reset'
                  ? 'Reset Your Password'
                  : 'Welcome Back'}
          </h1>
          <p className="text-sm text-purple-950/70 mt-1">
            {isCompletingGoogleProfile
              ? 'Quick setup for adults 18+.'
              : mode === 'register'
                ? 'Fast sign-up for adults 18+ in Uganda, Jeddah, and worldwide.'
                : mode === 'reset'
                  ? 'Enter your email address to receive a password reset link.'
                  : 'Sign in to discover real members, view matches, and chat securely.'}
          </p>
        </div>

        {!isCompletingGoogleProfile && (
          <div className="flex items-center gap-1 p-1 bg-purple-950/5 rounded-xl mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setInfoMessage(null);
              }}
              className={`flex-1 min-h-[42px] rounded-lg text-sm font-semibold transition-colors ${
                mode === 'login'
                  ? 'bg-white text-[#2E1065] shadow-sm'
                  : 'text-purple-950/65 hover:text-[#2E1065]'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setInfoMessage(null);
              }}
              className={`flex-1 min-h-[42px] rounded-lg text-sm font-semibold transition-colors ${
                mode === 'register'
                  ? 'bg-white text-[#2E1065] shadow-sm'
                  : 'text-purple-950/65 hover:text-[#2E1065]'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {authProviderSetupHint && (
          <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-950">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Firebase Console Setup Needed for Email/Password</p>
                <p className="text-xs mt-1 leading-relaxed">{authProviderSetupHint}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-800 flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            {(mode === 'login' || mode === 'register') && (
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  mode === 'login' ? void submitLogin() : void submitRegister()
                }
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-900 text-xs font-semibold"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        {infoMessage && (
          <div
            role="status"
            className="mb-5 rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-sm text-emerald-900 flex items-start gap-2.5"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* LOGIN FORM */}
        {mode === 'login' && !isCompletingGoogleProfile && (
          <form onSubmit={handleLogin} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-semibold text-[#2E1065] mb-1.5"
              >
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => markTouched('email')}
                placeholder="you@example.com"
                className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-700"
              />
              {emailError && (
                <p className="text-xs text-red-700 mt-1">{emailError}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-sm font-semibold text-[#2E1065]"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('reset');
                    setError(null);
                  }}
                  className="text-xs font-semibold text-pink-600 hover:text-pink-700"
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => markTouched('password')}
                placeholder="Your password"
                className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-700"
              />
              {passwordError && (
                <p className="text-xs text-red-700 mt-1">{passwordError}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] disabled:opacity-60 text-white font-semibold text-sm transition-colors active:scale-[0.99]"
            >
              {loading ? statusLabel || 'Signing in...' : 'Sign In'}
            </button>

            <div className="relative py-1.5 flex items-center">
              <div className="flex-grow border-t border-purple-950/10" />
              <span className="px-3 text-xs text-purple-950/50">or</span>
              <div className="flex-grow border-t border-purple-950/10" />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="w-full min-h-[48px] rounded-xl border border-purple-950/20 bg-white hover:bg-purple-50 text-[#2E1065] font-semibold text-sm transition-colors active:scale-[0.99]"
            >
              Continue with Google
            </button>
          </form>
        )}

        {/* PASSWORD RESET FORM */}
        {mode === 'reset' && !isCompletingGoogleProfile && (
          <form onSubmit={handlePasswordReset} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="reset-email"
                className="block text-sm font-semibold text-[#2E1065] mb-1.5"
              >
                Registered Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-purple-950/40 absolute left-3.5 top-3.5" />
                <input
                  id="reset-email"
                  type="email"
                  required
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => markTouched('email')}
                  placeholder="you@example.com"
                  className="w-full min-h-[44px] rounded-xl border border-purple-950/20 pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-700"
                />
              </div>
              {emailError && (
                <p className="text-xs text-red-700 mt-1">{emailError}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || resetSent}
              className="w-full min-h-[48px] rounded-xl bg-[#2E1065] hover:bg-[#4C1D95] disabled:opacity-60 text-white font-semibold text-sm inline-flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? statusLabel || 'Sending...' : 'Send Reset Link'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setResetSent(false);
                setError(null);
              }}
              className="w-full min-h-[44px] text-sm font-semibold text-purple-950/70 hover:text-[#2E1065]"
            >
              Back to Login
            </button>
          </form>
        )}

        {/* REGISTRATION / GOOGLE PROFILE COMPLETION FORM */}
        {(mode === 'register' || isCompletingGoogleProfile) && (
          <form onSubmit={handleRegister} noValidate className="space-y-4">
            {!isCompletingGoogleProfile && (
              <div className="pb-3 border-b border-purple-950/10">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleGoogleSignIn}
                  className="w-full min-h-[46px] rounded-xl border border-purple-950/20 bg-purple-50/60 hover:bg-purple-50 text-[#2E1065] font-semibold text-sm transition-colors"
                >
                  Quick Sign Up with Google
                </button>
                <p className="text-xs text-purple-950/55 text-center mt-1.5">
                  Or register with email in under 30 seconds
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="reg-fullname"
                  className="block text-sm font-semibold text-[#2E1065] mb-1.5"
                >
                  Full Name <span className="text-xs font-normal text-purple-950/60">(First name public)</span>
                </label>
                <input
                  id="reg-fullname"
                  type="text"
                  required
                  maxLength={100}
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => markTouched('fullName')}
                  placeholder="e.g. Sarah Namukasa"
                  className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-700"
                />
                {fullNameError && (
                  <p className="text-xs text-red-700 mt-1">{fullNameError}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="reg-dob"
                  className="block text-sm font-semibold text-[#2E1065] mb-1.5"
                >
                  Date of Birth <span className="text-xs font-normal text-purple-950/60">(18+ required)</span>
                </label>
                <input
                  id="reg-dob"
                  type="date"
                  required
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  onBlur={() => markTouched('dateOfBirth')}
                  className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-700"
                />
                {calculatedAge !== null ? (
                  <p
                    className={`text-xs mt-1 font-medium ${
                      calculatedAge >= 18 ? 'text-purple-700' : 'text-red-700'
                    }`}
                  >
                    {calculatedAge >= 18
                      ? `Age verified: ${calculatedAge} years old`
                      : `Age ${calculatedAge}: You must be 18 or older to join.`}
                  </p>
                ) : (
                  dobError && <p className="text-xs text-red-700 mt-1">{dobError}</p>
                )}
              </div>
            </div>

            {!isCompletingGoogleProfile && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="reg-email"
                    className="block text-sm font-semibold text-[#2E1065] mb-1.5"
                  >
                    Email Address <span className="text-xs font-normal text-purple-950/60">(Private)</span>
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => markTouched('email')}
                    placeholder="you@example.com"
                    className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-700"
                  />
                  {emailError && (
                    <p className="text-xs text-red-700 mt-1">{emailError}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="reg-password"
                    className="block text-sm font-semibold text-[#2E1065] mb-1.5"
                  >
                    Password <span className="text-xs font-normal text-purple-950/60">(Min 6 chars)</span>
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => markTouched('password')}
                    placeholder="Create a secure password"
                    className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-700"
                  />
                  {passwordError && (
                    <p className="text-xs text-red-700 mt-1">{passwordError}</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="reg-gender"
                  className="block text-sm font-semibold text-[#2E1065] mb-1.5"
                >
                  Gender
                </label>
                <select
                  id="reg-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as GenderOption)}
                  className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-700"
                >
                  <option value="woman">Woman</option>
                  <option value="man">Man</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="prefer-not-to-say">Prefer not to say</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="reg-intention"
                  className="block text-sm font-semibold text-[#2E1065] mb-1.5"
                >
                  Looking For
                </label>
                <select
                  id="reg-intention"
                  value={intention}
                  onChange={(e) =>
                    setIntention(e.target.value as IntentionOption)
                  }
                  className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-700"
                >
                  <option value="dating">Serious Dating & Love</option>
                  <option value="friendship">Meaningful Friendship</option>
                  <option value="both">Both Friendship & Dating</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="reg-country"
                  className="block text-sm font-semibold text-[#2E1065] mb-1.5"
                >
                  Country
                </label>
                <select
                  id="reg-country"
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-700"
                >
                  {FEATURED_COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c === 'Uganda'
                        ? 'Uganda 🇺🇬'
                        : c === 'Saudi Arabia'
                          ? 'Saudi Arabia 🇸🇦'
                          : c}
                    </option>
                  ))}
                </select>
                {country === 'Other' && (
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={customCountry}
                    onChange={(e) => setCustomCountry(e.target.value)}
                    placeholder="Enter your country"
                    className="mt-2 w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-700"
                  />
                )}
              </div>

              <div>
                <label
                  htmlFor="reg-city"
                  className="block text-sm font-semibold text-[#2E1065] mb-1.5"
                >
                  City
                </label>
                <input
                  id="reg-city"
                  type="text"
                  required
                  maxLength={80}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onBlur={() => markTouched('city')}
                  placeholder="e.g. Kampala or Jeddah"
                  className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-700"
                />
                {cityError && (
                  <p className="text-xs text-red-700 mt-1">{cityError}</p>
                )}
                {CITY_SUGGESTIONS[country] && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {CITY_SUGGESTIONS[country].slice(0, 4).map((suggested) => (
                      <button
                        key={suggested}
                        type="button"
                        onClick={() => setCity(suggested)}
                        className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                          city === suggested
                            ? 'bg-[#2E1065] text-white border-[#2E1065]'
                            : 'bg-purple-50 text-purple-900 border-purple-950/15 hover:bg-purple-100'
                        }`}
                      >
                        {suggested}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Optional Details Toggle (Photo, Interests, Bio) */}
            <div className="rounded-xl border border-purple-950/10 bg-purple-50/40">
              <button
                type="button"
                onClick={() => setShowOptionalDetails((v) => !v)}
                className="w-full min-h-[44px] px-4 py-2.5 flex items-center justify-between text-left text-sm font-semibold text-[#2E1065]"
              >
                <span>
                  Optional: Add Photo, Interests & Bio{' '}
                  <span className="text-xs font-normal text-purple-950/60">
                    (or add later in Profile)
                  </span>
                </span>
                {showOptionalDetails ? (
                  <ChevronUp className="w-4 h-4 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0" />
                )}
              </button>

              {showOptionalDetails && (
                <div className="p-4 pt-2 border-t border-purple-950/10 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-purple-100 border border-purple-950/15 overflow-hidden flex items-center justify-center shrink-0">
                      {photoPreviewUrl ? (
                        <img
                          src={photoPreviewUrl}
                          alt="Selected profile preview"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Camera className="w-6 h-6 text-purple-700/60" />
                      )}
                    </div>
                    <div className="flex-1">
                      <label
                        htmlFor="reg-photo"
                        className="block text-xs font-semibold text-[#2E1065] mb-1"
                      >
                        Profile Photo (Auto-compressed for mobile)
                      </label>
                      <input
                        id="reg-photo"
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                        className="block w-full text-xs text-purple-950/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-950/10 file:text-[#2E1065]"
                      />
                      {uploadProgress !== null && (
                        <p className="text-xs text-purple-700 font-medium mt-1 tabular-nums">
                          Uploading photo: {uploadProgress}%
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-[#2E1065] mb-1.5">
                      Interests (Up to 10 · {interests.length}/10)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {POPULAR_INTERESTS.map((item) => {
                        const selected = interests.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => toggleInterest(item)}
                            className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                              selected
                                ? 'bg-[#6B21A8] text-white border-[#6B21A8]'
                                : 'bg-white text-purple-950/80 border-purple-950/15 hover:border-purple-400'
                            }`}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-bio"
                      className="block text-xs font-semibold text-[#2E1065] mb-1"
                    >
                      Short Biography
                    </label>
                    <textarea
                      id="reg-bio"
                      rows={2}
                      maxLength={600}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Share your values and what kind of connection you hope to build..."
                      className="w-full rounded-xl border border-purple-950/20 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-700"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] disabled:opacity-60 text-white font-semibold text-sm transition-colors active:scale-[0.99]"
            >
              {loading
                ? statusLabel || 'Creating your account...'
                : isCompletingGoogleProfile
                  ? 'Save Profile & Continue'
                  : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
