
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

// Safari-compatible cleanup utility
const cleanupAuthState = () => {
  try {
    if (typeof Storage !== 'undefined' && typeof localStorage !== 'undefined') {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
          try {
            localStorage.removeItem(key);
          } catch (e) {
            console.warn('Failed to remove localStorage key:', key);
          }
        }
      });
    }
    
    if (typeof Storage !== 'undefined' && typeof sessionStorage !== 'undefined') {
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
          try {
            sessionStorage.removeItem(key);
          } catch (e) {
            console.warn('Failed to remove sessionStorage key:', key);
          }
        }
      });
    }
  } catch (error) {
    console.warn('Cleanup error:', error);
  }
};

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [userCheckDone, setUserCheckDone] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Memoized user check to prevent repeated calls
  const checkUser = useCallback(async () => {
    if (userCheckDone) return;
    
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!error && user) {
        navigate("/");
      }
    } catch (error) {
      console.warn('User check failed:', error);
    } finally {
      setUserCheckDone(true);
    }
  }, [navigate, userCheckDone]);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Clean up existing state first - Safari compatible
      cleanupAuthState();
      
      // Add small delay for Safari to process cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Attempt global sign out to clear any existing session
      try {
        await supabase.auth.signOut({ scope: 'global' });
        // Another small delay for Safari
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.warn('Pre-login signout failed:', err);
      }

      // Safari-specific login with extended timeout
      const { data, error } = await Promise.race([
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Login timeout')), 15000)
        )
      ]) as any;

      if (error) {
        console.error('Login error:', error);
        toast({
          title: "Authentication Error",
          description: error.message || "Login failed. Please try again.",
          variant: "destructive",
        });
        return;
      }

      if (data.user && data.session) {
        console.log('Login successful for Safari');
        toast({
          title: "Success",
          description: "Logged in successfully!",
        });
        
        // Safari-compatible redirect with delay
        setTimeout(() => {
          window.location.replace("/");
        }, 500);
      } else {
        throw new Error('No user data received');
      }
    } catch (error: any) {
      console.error('Login process error:', error);
      let errorMessage = "An unexpected error occurred";
      
      if (error.message === 'Login timeout') {
        errorMessage = "Login timed out. Please check your connection and try again.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/50 to-background">
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
      <Card className="w-full max-w-md shadow-2xl border border-border/50 relative z-10">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <svg 
              className="h-6 w-6 text-primary" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" 
              />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            Welcome back
          </CardTitle>
          <CardDescription className="text-base mt-1">
            Sign in to your RealThingks CRM account
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <button
                  type="button"
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                  onClick={() => {
                    toast({
                      title: "Password Reset",
                      description: "Please contact your administrator to reset your password.",
                    });
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-11"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full h-11 text-base font-medium" 
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : "Sign In"}
            </Button>
          </form>
          
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>Protected by enterprise-grade security</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
