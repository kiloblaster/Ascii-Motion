import { useState, useEffect, useRef } from 'react';
import { LogIn, Crown, LogOut, Settings, User, UserCircle, Shield, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth, SignUpDialog, SignInDialog, PasswordResetDialog, AccountSettingsDialog, ProfileSettingsDialog, useAdminCheckContext, AdminProjectViewerDialog, UpgradeDialog } from '@ascii-motion/premium';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminProjectLoader } from '@/hooks/useAdminProjectLoader';

export function AccountButton() {
  const { user, profile, loading, signOut, getAccessToken } = useAuth();
  const { isAdmin } = useAdminCheckContext();
  const { loadProjectSession } = useAdminProjectLoader();
  const [showSignUp, setShowSignUp] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [pendingUpgradeInterval, setPendingUpgradeInterval] = useState<'monthly' | 'annual' | null>(null);
  
  // Track if we have a pending upgrade flow (user signed up from upgrade action)
  const pendingUpgradeAfterAuth = useRef(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showAdminProjectViewer, setShowAdminProjectViewer] = useState(false);

  // Listen for custom event to open signup dialog
  useEffect(() => {
    const handleOpenSignUp = () => {
      setShowSignUp(true);
    };
    
    window.addEventListener('openSignUpDialog', handleOpenSignUp);
    return () => window.removeEventListener('openSignUpDialog', handleOpenSignUp);
  }, []);

  // Handle URL action params (from marketing site deep links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const interval = params.get('interval') as 'monthly' | 'annual' | null;
    
    // Clean up URL helper
    const cleanupUrl = () => {
      params.delete('action');
      params.delete('interval');
      const newUrl = params.toString() 
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    };
    
    if (action === 'signup') {
      // Set flag to skip welcome dialog
      sessionStorage.setItem('skip-welcome', 'true');
      setShowSignUp(true);
      cleanupUrl();
    } else if (action === 'signin') {
      // Set flag to skip welcome dialog
      sessionStorage.setItem('skip-welcome', 'true');
      setShowSignIn(true);
      cleanupUrl();
    } else if (action === 'upgrade') {
      // Set flag to skip welcome dialog
      sessionStorage.setItem('skip-welcome', 'true');
      
      // Store the interval preference
      if (interval) {
        setPendingUpgradeInterval(interval);
      }
      
      if (user) {
        // User is logged in - show upgrade dialog directly
        setShowUpgradeDialog(true);
        cleanupUrl();
      } else {
        // User not logged in - mark pending upgrade, show signup
        pendingUpgradeAfterAuth.current = true;
        setShowSignUp(true);
        cleanupUrl();
      }
    }
  }, [user]);

  // When user becomes authenticated with a pending upgrade, show upgrade dialog
  useEffect(() => {
    if (user && pendingUpgradeAfterAuth.current) {
      pendingUpgradeAfterAuth.current = false;
      // Small delay to let signup dialog close first
      setTimeout(() => {
        setShowUpgradeDialog(true);
      }, 300);
    }
  }, [user]);

  // Handle sign out and reset dialog states
  const handleSignOut = async () => {
    // Close all dialogs first
    setShowSignIn(false);
    setShowSignUp(false);
    setShowPasswordReset(false);
    
    // Then sign out
    await signOut();
  };

  // Show loading state
  if (loading) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="gap-1.5"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  // Signed Out State
  if (!user) {
    return (
      <>
        <Button
          variant="default"
          size="sm"
          onClick={() => setShowSignIn(true)}
          className="h-8 px-3 gap-2"
        >
          <LogIn className="h-4 w-4" />
          <span className="text-sm">Sign in</span>
        </Button>

        <SignUpDialog
          open={showSignUp}
          onOpenChange={setShowSignUp}
          onSwitchToSignIn={() => {
            setShowSignUp(false);
            setShowSignIn(true);
          }}
        />

        <SignInDialog
          open={showSignIn}
          onOpenChange={setShowSignIn}
          onSwitchToSignUp={() => {
            setShowSignIn(false);
            setShowSignUp(true);
          }}
          onForgotPassword={() => {
            setShowSignIn(false);
            setShowPasswordReset(true);
          }}
        />

        <PasswordResetDialog
          open={showPasswordReset}
          onOpenChange={setShowPasswordReset}
        />
      </>
    );
  }

  // Signed In State
  const email = user.email || 'User';
  const firstLetter = email[0].toUpperCase();
  const tierName = profile?.subscription_tier?.display_name || 'Free';
  const isFreeTier = profile?.subscription_tier?.name !== 'pro';
  // @ts-expect-error - display_name now comes from user_profiles_public join
  const userDisplayName = profile?.display_name;

  return (
    <TooltipProvider>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="h-8 w-8 p-0 text-sm font-medium"
              >
                {firstLetter}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Account settings</p>
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end" className="w-56 border-border/50">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{email}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Crown className="h-3 w-3" />
                <span>{tierName}</span>
                {isFreeTier && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUpgradeDialog(true);
                    }}
                    className="ml-1 text-purple-400 hover:text-purple-300 hover:underline transition-colors"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => userDisplayName && (window.location.href = `/community/u/${userDisplayName}`)}>
            <UserCircle className="mr-2 h-4 w-4" />
            <span>View Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowProfileSettings(true)}>
            <User className="mr-2 h-4 w-4" />
            <span>Profile Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowAccountSettings(true)}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Account Settings</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          
          {/* Admin Panel Link (only visible to admins) */}
          {isAdmin && (
            <>
              <DropdownMenuItem onClick={() => window.location.href = '/community/admin/moderation'}>
                <Shield className="mr-2 h-4 w-4" />
                <span>Admin Panel</span>
              </DropdownMenuItem>
              
              <DropdownMenuItem onClick={() => setShowAdminProjectViewer(true)}>
                <Search className="mr-2 h-4 w-4" />
                <span>Check Project ID</span>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
            </>
          )}
          
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Account Settings Dialog */}
      <AccountSettingsDialog
        open={showAccountSettings}
        onOpenChange={setShowAccountSettings}
        onPasswordChanged={() => {
          toast.success('Successfully changed password');
        }}
        onAccountDeleted={() => {
          toast.success('Account deleted successfully');
        }}
      />

      {/* Profile Settings Dialog */}
      <ProfileSettingsDialog
        open={showProfileSettings}
        onOpenChange={setShowProfileSettings}
        onSaved={() => {
          toast.success('Profile updated successfully');
        }}
      />

      {/* Admin Project Viewer Dialog */}
      {isAdmin && (
        <AdminProjectViewerDialog
          open={showAdminProjectViewer}
          onOpenChange={setShowAdminProjectViewer}
          onLoadProject={loadProjectSession}
        />
      )}

      {/* Upgrade Dialog (for marketing site deep links) */}
      <UpgradeDialog
        open={showUpgradeDialog}
        onOpenChange={(open) => {
          setShowUpgradeDialog(open);
          if (!open) {
            setPendingUpgradeInterval(null);
          }
        }}
        getAccessToken={getAccessToken}
        isAuthenticated={!!user}
        defaultInterval={pendingUpgradeInterval || 'monthly'}
        onAuthRequired={() => {
          setShowUpgradeDialog(false);
          setShowSignUp(true);
        }}
      />
    </TooltipProvider>
  );
}
