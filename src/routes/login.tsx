import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wifi, Phone, Lock, Zap, ArrowLeft } from "lucide-react";
import { sendOtpCode, verifyOtpAndLogin } from "../lib/server-functions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();

  // step state: "phone" (enter mobile number) or "otp" (verify 6-digit code)
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [mobileNumber, setMobileNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");

  // If already logged in, redirect to dashboard
  useEffect(() => {
    const existing = localStorage.getItem("currentUser");
    if (existing) navigate({ to: "/" });
  }, [navigate]);

  // Mutation to request SMS Verification Code
  const sendOtpMutation = useMutation({
    mutationFn: (payload: { mobileNumber: string }) => {
      console.log("MUTATION: sendOtpCode for:", payload.mobileNumber);
      return sendOtpCode({ data: payload });
    },
    onSuccess: (data) => {
      console.log("OTP SENT SUCCESS:", data);
      toast.success("Verification Code Sent!", {
        description: `SMS simulation code sent to ${mobileNumber}`,
      });

      // Simulate real SMS delivery with a persistent notification toast
      toast.info(`[SMS Gateway] Your DataSwap verification code is: ${data.otp}`, {
        duration: 10000,
      });

      setStep("otp");
    },
    onError: (err: any) => {
      console.error("OTP SEND ERROR:", err);
      toast.error("Failed to Send Verification", { description: err.message });
    },
  });

  // Mutation to verify OTP code and authenticate session
  const verifyOtpMutation = useMutation({
    mutationFn: (payload: { mobileNumber: string; otpCode: string }) => {
      console.log("MUTATION: verifyOtpAndLogin with:", payload);
      return verifyOtpAndLogin({ data: payload });
    },
    onSuccess: (data) => {
      console.log("OTP VERIFIED SUCCESS:", data);
      localStorage.setItem("currentUser", data.username);
      toast.success(`Access Granted! Welcome, ${data.username} 👋`);
      navigate({ to: "/" });
    },
    onError: (err: any) => {
      console.error("OTP VERIFY ERROR:", err);
      toast.error("Verification Failed", { description: err.message });
    },
  });

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNum = mobileNumber.trim();
    if (!trimmedNum) {
      toast.error("Please enter your mobile number");
      return;
    }
    // Simple regex allowing phone numbers
    const phoneRegex = /^[\d\s()+-]{7,20}$/;
    if (!phoneRegex.test(trimmedNum)) {
      toast.error("Invalid mobile number format", {
        description: "Please enter a valid mobile number (e.g. +91 98765 43210)",
      });
      return;
    }
    sendOtpMutation.mutate({ mobileNumber: trimmedNum });
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = otpCode.trim();
    if (!trimmedCode) {
      toast.error("Please enter the verification code");
      return;
    }
    if (trimmedCode.length !== 6) {
      toast.error("Invalid verification code", {
        description: "Please enter the complete 6-digit code received via SMS",
      });
      return;
    }
    verifyOtpMutation.mutate({ mobileNumber: mobileNumber.trim(), otpCode: trimmedCode });
  };

  const isPending = sendOtpMutation.isPending || verifyOtpMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background ambient glow */}
      <div
        className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[320px] h-[320px] rounded-full blur-[120px] opacity-20 pointer-events-none"
        style={{ background: "var(--color-neon)" }}
      />
      <div
        className="absolute bottom-0 right-0 w-[200px] h-[200px] rounded-full blur-[100px] opacity-10 pointer-events-none"
        style={{ background: "oklch(0.75 0.18 195)" }}
      />

      {/* Logo */}
      <div className="flex flex-col items-center mb-8 relative z-10">
        <div className="h-16 w-16 rounded-2xl border border-neon bg-neon/10 flex items-center justify-center shadow-[0_0_30px_var(--color-neon)] mb-3">
          <Wifi className="h-8 w-8 text-neon" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">DataSwap</h1>
        <p className="text-xs text-muted-foreground mt-1 font-mono">P2P · Cellular Data Exchange</p>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-sm card-panel p-6 space-y-5 relative z-10">
        {step === "phone" ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold">Verification Login</h3>
              <p className="text-xs text-muted-foreground">
                Enter your mobile number to receive a verification OTP.
              </p>
            </div>

            {/* Mobile Number */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Mobile Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  id="login-username"
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                  disabled={isPending}
                  className="w-full pl-9 pr-4 py-2.5 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:border-neon transition text-foreground placeholder:text-muted-foreground/40"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              id="auth-submit-btn"
              type="submit"
              disabled={isPending}
              className="w-full neon-btn py-3 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-1"
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-background border-t-transparent animate-spin" />
                  Sending Code...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <Zap className="h-4 w-4 fill-current" />
                  Send Verification Code
                </span>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold">Enter Verification Code</h3>
              <p className="text-xs text-muted-foreground">
                We sent a 6-digit code to{" "}
                <span className="font-mono text-neon font-semibold">{mobileNumber}</span>.
              </p>
            </div>

            {/* OTP Code */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Verification Code
                </label>
                <button
                  type="button"
                  onClick={() => setStep("phone")}
                  className="text-[10px] font-mono text-neon hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="h-3 w-3" /> Change Number
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  id="login-password"
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  disabled={isPending}
                  className="w-full pl-9 pr-4 py-2.5 bg-secondary border border-border rounded-lg text-sm tracking-[0.2em] font-mono text-center focus:outline-none focus:border-neon transition text-foreground placeholder:text-muted-foreground/40"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              id="auth-submit-btn"
              type="submit"
              disabled={isPending}
              className="w-full neon-btn py-3 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-1"
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-background border-t-transparent animate-spin" />
                  Verifying OTP...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <Zap className="h-4 w-4 fill-current" />
                  Verify & Log In
                </span>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Bottom info */}
      <div className="mt-6 text-center relative z-10 space-y-1">
        <p className="text-[11px] text-muted-foreground/60 font-mono">
          New accounts · 15.0 GB plan · 100 DataCoins starter balance
        </p>
        <p className="text-[10px] text-muted-foreground/40">
          Local prototype — SMS gateway simulated for demonstration
        </p>
      </div>
    </div>
  );
}
