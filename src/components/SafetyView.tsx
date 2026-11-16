import {
  AlertTriangle,
  Ban,
  EyeOff,
  HeartHandshake,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import type { ViewRoute } from '../types/app';

interface SafetyViewProps {
  onNavigate: (route: ViewRoute) => void;
}

export function SafetyView({ onNavigate }: SafetyViewProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 md:pb-16 space-y-8">
      <div>
        <p className="text-sm font-semibold text-pink-600 mb-2">
          Safety & Privacy Center
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-[#2E1065]">
          Safe connections across borders
        </h1>
        <p className="text-purple-950/75 text-base mt-3 leading-relaxed">
          FIND YOUR LOVE is committed to protecting every member across Uganda, Jeddah, and around the world. Please review these safety rules carefully before meeting or chatting.
        </p>
      </div>

      {/* Romance Scam Warning */}
      <section className="bg-amber-50 rounded-2xl border border-amber-200 p-6 space-y-3">
        <div className="flex items-center gap-2.5 text-amber-950">
          <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0" />
          <h2 className="text-xl font-bold">
            Warning Against Romance Scams & Requests for Money
          </h2>
        </div>
        <p className="text-sm text-amber-950/90 leading-relaxed">
          Never send money, mobile money, wire transfers, cryptocurrency, gift cards, visa fees, or travel tickets to anyone you meet online—even if they claim an emergency, medical bill, or promise to visit you soon.
        </p>
        <ul className="list-disc pl-5 text-sm text-amber-950/85 space-y-1.5">
          <li>
            If any member asks for financial assistance, loans, or bank/card details, stop replying immediately and tap <strong>Report</strong>.
          </li>
          <li>
            Be cautious if someone pressures you to leave the platform quickly or claims instant deep love before getting to know you.
          </li>
          <li>
            FIND YOUR LOVE staff will never ask you for your password or demand personal transfers inside member chats.
          </li>
        </ul>
      </section>

      {/* Community Guidelines */}
      <section className="bg-white rounded-2xl border border-purple-950/10 p-6 space-y-5">
        <h2 className="text-xl font-bold text-[#2E1065]">
          Community Guidelines
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-[#2E1065]">
              <HeartHandshake className="w-4 h-4 text-pink-600" />
              <span>Adults 18+ & Honest Identity</span>
            </div>
            <p className="text-sm text-purple-950/75 leading-relaxed">
              Every member must be at least 18 years old and use genuine information and photos of themselves.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-[#2E1065]">
              <Ban className="w-4 h-4 text-pink-600" />
              <span>Zero Harassment or Explicit Content</span>
            </div>
            <p className="text-sm text-purple-950/75 leading-relaxed">
              Treat members of all cultures and backgrounds with respect. Abusive messages or inappropriate photos lead to suspension.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-[#2E1065]">
              <Lock className="w-4 h-4 text-pink-600" />
              <span>Protected Personal Details</span>
            </div>
            <p className="text-sm text-purple-950/75 leading-relaxed">
              Passwords are never stored in plain text or displayed. Your private email address, full legal name, and exact date of birth are never exposed to other members.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-[#2E1065]">
              <EyeOff className="w-4 h-4 text-pink-600" />
              <span>Instant Block, Unmatch & Delete</span>
            </div>
            <p className="text-sm text-purple-950/75 leading-relaxed">
              You can block any member, unmatch anytime, pause your profile visibility, or permanently delete your account from your Profile page.
            </p>
          </div>
        </div>
      </section>

      <div className="bg-[#2E1065] text-white rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-pink-300 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-base">Manage your privacy & blocked users</p>
            <p className="text-xs text-purple-200 mt-0.5">
              Update profile visibility, unblock accounts, or delete your account anytime.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('profile')}
          className="min-h-[44px] px-5 py-2 rounded-xl bg-white text-[#2E1065] text-sm font-semibold whitespace-nowrap"
        >
          Go to Profile Settings
        </button>
      </div>
    </div>
  );
}
