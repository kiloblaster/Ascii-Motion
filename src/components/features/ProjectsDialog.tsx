/**
 * ASCII Motion - PREMIUM FEATURE
 * Cloud Projects Dialog
 * 
 * Manages cloud projects - list, open, delete, rename, upload, download
 * 
 * @premium This component requires authentication and uses premium cloud storage features
 * @requires @ascii-motion/premium package
 * 
 * Architecture Note:
 * - UI Component: Lives in main app for design system cohesion
 * - Business Logic: Imported from @ascii-motion/premium (useCloudProject hook)
 * - This keeps UI components with shadcn/ui design system while logic stays in premium package
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useCloudProject, useAuth, UpgradeDialog } from '@ascii-motion/premium';
import type { CloudProject } from '@ascii-motion/premium';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Loader2, 
  MoreVertical, 
  Folder, 
  Trash2, 
  Download, 
  Edit, 
  Upload,
  FolderOpen,
  FileText,
  ChevronDown,
  Sparkles,
  ChevronRight,
  Undo2,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { ProjectCanvasPreview } from './ProjectCanvasPreview';
import { getProjectFrameCount } from '../../utils/projectUtils';
import { UpgradeToProDialog } from './UpgradeToProDialog';
import type { UserProfile } from '@ascii-motion/premium';

// --- sessionStorage cache helpers ---
const CACHE_KEY_PROJECTS = 'ascii-motion:projects-cache';
const CACHE_KEY_DELETED = 'ascii-motion:deleted-projects-cache';
const CACHE_KEY_PROFILE = 'ascii-motion:user-profile-cache';

function getCachedProjects(): CloudProject[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY_PROJECTS);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function getCachedDeletedProjects(): CloudProject[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY_DELETED);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function getCachedUserProfile(): UserProfile | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY_PROFILE);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCachedProjects(projects: CloudProject[]) {
  try { sessionStorage.setItem(CACHE_KEY_PROJECTS, JSON.stringify(projects)); } catch { /* quota exceeded */ }
}

function setCachedDeletedProjects(projects: CloudProject[]) {
  try { sessionStorage.setItem(CACHE_KEY_DELETED, JSON.stringify(projects)); } catch { /* quota exceeded */ }
}

function setCachedUserProfile(profile: UserProfile) {
  try { sessionStorage.setItem(CACHE_KEY_PROFILE, JSON.stringify(profile)); } catch { /* quota exceeded */ }
}

/** Skeleton placeholder matching the project card layout */
function ProjectCardSkeleton() {
  return (
    <Card className="relative border-border/50 flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[120px] w-full rounded-md mb-2" />
        <Skeleton className="h-3 w-28 mb-2" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3 mt-1" />
      </CardContent>
      <CardFooter className="mt-auto">
        <Skeleton className="h-9 w-full rounded-md" />
      </CardFooter>
    </Card>
  );
}

interface ProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadProject: (projectId: string, sessionData: unknown) => Promise<void>;
  onDownloadProject: (projectId: string, projectName: string, sessionData: unknown) => void;
  refreshTrigger?: number; // Trigger to refresh project list
}

export function ProjectsDialog({
  open,
  onOpenChange,
  onLoadProject,
  onDownloadProject,
  refreshTrigger,
}: ProjectsDialogProps) {
  const {
    loading,
    error,
    listProjects,
    listDeletedProjects,
    loadFromCloud,
    deleteProject,
    restoreProject,
    permanentlyDeleteProject,
    renameProject,
    updateDescription,
    uploadSessionFile,
    getUserProfile,
  } = useCloudProject();

  const [projects, setProjects] = useState<CloudProject[]>(() => getCachedProjects() ?? []);
  const [deletedProjects, setDeletedProjects] = useState<CloudProject[]>(() => getCachedDeletedProjects() ?? []);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null);
  const [newDescription, setNewDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [trashExpanded, setTrashExpanded] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => getCachedUserProfile());
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showRealUpgradeDialog, setShowRealUpgradeDialog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const hasCachedData = useRef(!!getCachedProjects());
  
  // Get auth for upgrade dialog
  const { user, profile, getAccessToken } = useAuth();

  // Check if subscription is pending cancellation (active but will end)
  const isPendingCancellation = (() => {
    if (!profile?.subscription_status || !profile?.subscription_current_period_end) return false;
    // "canceled" status means subscription is ending at period end
    // Also check if period end is in the future
    return (
      profile.subscription_status === 'canceled' && 
      new Date(profile.subscription_current_period_end) > new Date()
    );
  })();

  const subscriptionEndDate = profile?.subscription_current_period_end 
    ? new Date(profile.subscription_current_period_end).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const projectsAtRisk = projects.length > 3 ? projects.length - 3 : 0;

  // Load projects list from database (stale-while-revalidate)
  const loadProjectsList = useCallback(async () => {
    const showingCached = projects.length > 0 || hasCachedData.current;
    if (showingCached) setRefreshing(true);

    try {
      const [activeData, deletedData, profileData] = await Promise.all([
        listProjects(),
        listDeletedProjects(),
        getUserProfile(),
      ]);
      
      // Sort active projects by most recently opened first
      const sortedActive = activeData.sort((a, b) => 
        new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
      );
      
      setProjects(sortedActive);
      setDeletedProjects(deletedData);
      setUserProfile(profileData);

      // Persist to sessionStorage for next open
      setCachedProjects(sortedActive);
      setCachedDeletedProjects(deletedData);
      if (profileData) setCachedUserProfile(profileData);
      hasCachedData.current = true;
    } finally {
      setRefreshing(false);
    }
  }, [listProjects, listDeletedProjects, getUserProfile, projects.length]);

  // Load projects when dialog opens OR when refreshTrigger changes
  useEffect(() => {
    if (open) {
      loadProjectsList();
    }
  }, [open, refreshTrigger, loadProjectsList]);

  // Reset dialog state when closed
  useEffect(() => {
    if (!open) {
      // Collapse trash
      setTrashExpanded(false);
      // Cancel any edit operations
      setRenamingId(null);
      setNewName('');
      setEditingDescriptionId(null);
      setNewDescription('');
    }
  }, [open]);

  // Show error toasts
  useEffect(() => {
    if (error) {
      console.error('[ProjectsDialog] Error:', error);
    }
  }, [error]);

  // Check if user can create more projects
  const canCreateProject = () => {
    if (!userProfile?.subscriptionTier) return true; // Allow if no tier info
    const maxProjects = userProfile.subscriptionTier.maxProjects;
    return maxProjects === -1 || projects.length < maxProjects;
  };

  // Get project limit info
  const getProjectLimit = () => {
    if (!userProfile?.subscriptionTier) return { current: projects.length, max: 3 };
    const maxProjects = userProfile.subscriptionTier.maxProjects;
    return {
      current: projects.length,
      max: maxProjects === -1 ? Infinity : maxProjects,
    };
  };

  // Check if user is on pro tier or is an admin
  const isProUser = () => {
    return userProfile?.subscriptionTier?.name === 'pro' || userProfile?.isAdmin === true;
  };

  const handleOpenProject = async (project: CloudProject) => {
    try {
      const cloudProject = await loadFromCloud(project.id);
      if (cloudProject) {
        await onLoadProject(project.id, cloudProject.sessionData);
        onOpenChange(false);
        console.log(`[ProjectsDialog] Opened "${project.name}"`);
      }
    } catch (err) {
      console.error('[ProjectsDialog] Load failed:', err);
    }
  };

  const handleDeleteProject = async (project: CloudProject) => {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) {
      return;
    }

    const success = await deleteProject(project.id);
    if (success) {
      console.log(`[ProjectsDialog] Deleted "${project.name}"`);
      await loadProjectsList();
    }
  };

  const handleRenameStart = (project: CloudProject) => {
    setRenamingId(project.id);
    setNewName(project.name);
  };

  const handleRenameSubmit = async (projectId: string) => {
    if (!newName.trim()) {
      return;
    }

    const success = await renameProject(projectId, newName.trim());
    if (success) {
      setRenamingId(null);
      await loadProjectsList();
    }
  };

  const handleRenameCancel = () => {
    setRenamingId(null);
    setNewName('');
  };

  const handleEditDescriptionStart = (project: CloudProject) => {
    setEditingDescriptionId(project.id);
    setNewDescription(project.description || '');
  };

  const handleEditDescriptionSubmit = async (projectId: string) => {
    const success = await updateDescription(projectId, newDescription.trim());
    if (success) {
      setEditingDescriptionId(null);
      await loadProjectsList();
    }
  };

  const handleEditDescriptionCancel = () => {
    setEditingDescriptionId(null);
    setNewDescription('');
  };

  const handleRestoreProject = async (project: CloudProject) => {
    const success = await restoreProject(project.id);
    if (success) {
      console.log(`[ProjectsDialog] Restored "${project.name}"`);
      await loadProjectsList();
    }
  };

  const handlePermanentlyDeleteProject = async (project: CloudProject) => {
    if (!confirm(`Permanently delete "${project.name}"?\n\nThis action cannot be undone. The project will be removed from the database immediately.`)) {
      return;
    }

    const success = await permanentlyDeleteProject(project.id);
    if (success) {
      console.log(`[ProjectsDialog] Permanently deleted "${project.name}"`);
      await loadProjectsList();
    }
  };

  const handleDownloadProject = async (project: CloudProject) => {
    try {
      const cloudProject = await loadFromCloud(project.id);
      if (cloudProject) {
        onDownloadProject(project.id, project.name, cloudProject.sessionData);
        console.log(`[ProjectsDialog] Downloaded "${project.name}"`);
      }
    } catch (err) {
      console.error('[ProjectsDialog] Download failed:', err);
    }
  };

  const handleUploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.asciimtn')) {
      console.error('[ProjectsDialog] Please select a .asciimtn file');
      return;
    }

    // Check project limit before uploading
    if (!canCreateProject()) {
      setShowUpgradeDialog(true);
      event.target.value = ''; // Reset file input
      return;
    }

    setUploading(true);
    try {
      const project = await uploadSessionFile(file);
      if (project) {
        await loadProjectsList();
      }
    } catch (err) {
      console.error('[ProjectsDialog] Upload failed:', err);
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col border-border/50" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>My Projects</DialogTitle>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Open, manage, and upload your projects • {getProjectLimit().current}/{getProjectLimit().max === Infinity ? '∞' : getProjectLimit().max} projects used
              {refreshing && (
                <Loader2 className="inline-block h-3 w-3 ml-2 animate-spin align-text-bottom" />
              )}
            </p>
            {!isProUser() && (
              <button
                onClick={() => setShowRealUpgradeDialog(true)}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Sparkles className="h-3 w-3" />
                <span className="hover:underline">Upgrade to Pro for unlimited storage</span>
              </button>
            )}
          </div>
        </DialogHeader>

        {/* Pending Cancellation Warning Banner */}
        {isPendingCancellation && projectsAtRisk > 0 && (
          <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-yellow-500">
                Your Pro subscription ends on {subscriptionEndDate}
              </p>
              <p className="text-muted-foreground">
                After this date, only your 3 most recently edited projects will remain accessible.
                {projectsAtRisk > 0 && ` ${projectsAtRisk} project${projectsAtRisk !== 1 ? 's' : ''} will be archived for 60 days.`}
              </p>
              <button
                onClick={() => setShowRealUpgradeDialog(true)}
                className="text-xs text-yellow-400 hover:text-yellow-300 hover:underline transition-colors cursor-pointer"
              >
                Restart subscription to keep all projects →
              </button>
            </div>
          </div>
        )}

        {/* Upload Button */}
        <div className="flex gap-2">
          <Label htmlFor="upload-file">
            <Button
              variant="outline"
              disabled={uploading || loading}
              asChild
            >
              <span>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload .asciimtn File
                  </>
                )}
              </span>
            </Button>
          </Label>
          <Input
            id="upload-file"
            type="file"
            accept=".asciimtn"
            className="hidden"
            onChange={handleUploadFile}
          />
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && projects.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ProjectCardSkeleton />
              <ProjectCardSkeleton />
              <ProjectCardSkeleton />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No projects yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload a .asciimtn file or save your current work to get started
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <Card key={project.id} className="relative border-border/50 flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      {renamingId === project.id ? (
                        <div className="flex-1 flex gap-2 items-center">
                          <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleRenameSubmit(project.id);
                              } else if (e.key === 'Escape') {
                                handleRenameCancel();
                              }
                            }}
                            autoFocus
                            className="h-8"
                          />
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  onClick={() => handleRenameSubmit(project.id)}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Save</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0"
                                  onClick={handleRenameCancel}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Cancel</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <CardTitle 
                                className="text-base cursor-pointer hover:text-primary transition-colors line-clamp-3"
                                onClick={() => handleRenameStart(project)}
                                title="Click to rename"
                              >
                                {project.name}
                              </CardTitle>
                              {project.isPublished && (
                                <Badge 
                                  variant="secondary"
                                  className="text-xs px-2 py-0 h-5 shrink-0"
                                  style={{ backgroundColor: '#06b6d4', color: 'white' }}
                                >
                                  PUBLISHED
                                </Badge>
                              )}
                            </div>
                            <CardDescription>
                              {getProjectFrameCount(project.sessionData)} frame{getProjectFrameCount(project.sessionData) !== 1 ? 's' : ''}
                            </CardDescription>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleRenameStart(project)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditDescriptionStart(project)}>
                                <FileText className="h-4 w-4 mr-2" />
                                Edit Description
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownloadProject(project)}>
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteProject(project)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Canvas Preview */}
                    <ProjectCanvasPreview project={project} />
                    
                    {/* Last Opened */}
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Folder className="h-3 w-3 mr-1" />
                      Last opened {formatDate(project.lastOpenedAt)}
                    </div>
                    
                    {/* Description */}
                    {editingDescriptionId === project.id ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={newDescription}
                          onChange={(e) => setNewDescription(e.target.value)}
                          placeholder="Enter description..."
                          rows={2}
                          autoFocus
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleEditDescriptionSubmit(project.id)}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleEditDescriptionCancel}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : project.description ? (
                      <div 
                        className="text-sm text-muted-foreground mt-2 max-h-[4.5rem] overflow-y-auto cursor-pointer hover:text-primary/80 transition-colors"
                        onClick={() => handleEditDescriptionStart(project)}
                        title="Click to edit description"
                      >
                        {project.description}
                      </div>
                    ) : (
                      <p 
                        className="text-sm text-muted-foreground/50 mt-2 italic cursor-pointer hover:text-muted-foreground transition-colors"
                        onClick={() => handleEditDescriptionStart(project)}
                        title="Click to add description"
                      >
                        No description
                      </p>
                    )}
                  </CardContent>
                  <CardFooter className="mt-auto">
                    <Button
                      className="w-full"
                      onClick={() => handleOpenProject(project)}
                      disabled={loading}
                    >
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Open
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}

          {/* Trash Section - Visible to all users */}
          <div className="mt-6 border-t border-border/50 pt-4">
            <button
              onClick={() => setTrashExpanded(!trashExpanded)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              {trashExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <Trash2 className="h-4 w-4" />
              <span>Trash {isProUser() && deletedProjects.length > 0 && `(${deletedProjects.length})`}</span>
            </button>
            
            {trashExpanded && (
              <div className="mt-4 space-y-4">
                {isProUser() ? (
                  // Pro users: Show deleted projects or empty state
                  deletedProjects.length > 0 ? (
                    <>
                      <p className="text-xs text-muted-foreground italic">
                        Items in trash removed permanently after 30 days
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {deletedProjects.map((project) => (
                          <Card key={project.id} className="relative border-border/50 opacity-60 flex flex-col">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <CardTitle className="text-base line-clamp-3">
                                      {project.name}
                                    </CardTitle>
                                    {project.isPublished && (
                                      <Badge 
                                        variant="secondary"
                                        className="text-xs px-2 py-0 h-5 shrink-0"
                                        style={{ backgroundColor: '#06b6d4', color: 'white' }}
                                      >
                                        PUBLISHED
                                      </Badge>
                                    )}
                                  </div>
                                  <CardDescription>
                                    {getProjectFrameCount(project.sessionData)} frame{getProjectFrameCount(project.sessionData) !== 1 ? 's' : ''}
                                  </CardDescription>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              {/* Canvas Preview */}
                              <ProjectCanvasPreview project={project} />
                              
                              {/* Deleted Date */}
                              <div className="flex items-center text-xs text-muted-foreground">
                                <Trash2 className="h-3 w-3 mr-1" />
                                Deleted {formatDate(project.updatedAt)}
                              </div>
                              
                              {/* Description (read-only) */}
                              {project.description && (
                                <div className="text-sm text-muted-foreground mt-2 max-h-[4.5rem] overflow-y-auto">
                                  {project.description}
                                </div>
                              )}
                            </CardContent>
                            <CardFooter className="flex flex-col gap-2 mt-auto">
                              <Button
                                className="w-full"
                                variant="outline"
                                onClick={() => handleRestoreProject(project)}
                                disabled={loading}
                              >
                                <Undo2 className="h-4 w-4 mr-2" />
                                Restore
                              </Button>
                              <Button
                                className="w-full"
                                variant="destructive"
                                onClick={() => handlePermanentlyDeleteProject(project)}
                                disabled={loading}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Permanently Delete
                              </Button>
                            </CardFooter>
                          </Card>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Trash2 className="h-12 w-12 text-muted-foreground mb-2 opacity-50" />
                      <p className="text-sm text-muted-foreground">Trash is empty</p>
                    </div>
                  )
                ) : (
                  // Free users: Show upgrade message
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Trash2 className="h-12 w-12 text-muted-foreground mb-3 opacity-50" />
                    <p className="text-sm font-medium text-foreground mb-1">
                      Restoring deleted files from trash
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      Available to Pro users
                    </p>
                    <button
                      onClick={() => setShowRealUpgradeDialog(true)}
                      className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span className="hover:underline">Upgrade to Pro</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Upgrade to Pro Dialog (when limit reached) */}
      <UpgradeToProDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
        onManageProjects={() => {
          // Dialog is already open, just close upgrade dialog
        }}
        onUpgrade={() => {
          setShowRealUpgradeDialog(true);
        }}
        currentProjects={getProjectLimit().current}
        maxProjects={getProjectLimit().max === Infinity ? 3 : getProjectLimit().max}
      />
      
      {/* Real Upgrade Dialog (Stripe checkout) */}
      <UpgradeDialog
        open={showRealUpgradeDialog}
        onOpenChange={setShowRealUpgradeDialog}
        getAccessToken={getAccessToken}
        isAuthenticated={!!user}
        onAuthRequired={() => {
          setShowRealUpgradeDialog(false);
        }}
      />
    </Dialog>
  );
}
