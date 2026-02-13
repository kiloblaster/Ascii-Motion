/**
 * Wrapper component for PublishToGalleryDialog
 * Provides session data from CanvasContext to the dialog
 */

import { useState, useEffect, useRef } from 'react';
import { PublishToGalleryDialog, useCloudProject } from '@ascii-motion/premium';
import { useExportDataCollector } from '../../utils/exportDataCollector';
import { useProjectMetadataStore } from '../../stores/projectMetadataStore';
import { useCloudProjectActions } from '../../hooks/useCloudProjectActions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { SessionData } from '@ascii-motion/premium';

interface PublishToGalleryDialogWrapperProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onPublishSuccess?: (projectId: string) => void;
}

export function PublishToGalleryDialogWrapper({
  isOpen,
  onOpenChange,
  onPublishSuccess,
}: PublishToGalleryDialogWrapperProps) {
  const exportData = useExportDataCollector(isOpen);
  const { currentProjectId, setProjectName, setProjectDescription } = useProjectMetadataStore();
  const { handleSaveToCloud } = useCloudProjectActions();
  const { loadFromCloud } = useCloudProject();
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [freshSessionData, setFreshSessionData] = useState<SessionData | null>(null);
  
  // Use ref to track if save has been initiated (persists across re-renders)
  const saveInitiatedRef = useRef(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setIsReady(false);
      setIsSaving(false);
      setSaveError(null);
      setFreshSessionData(null);
      saveInitiatedRef.current = false;
    }
  }, [isOpen]);

  // Auto-save before showing publish dialog
  useEffect(() => {
    if (!isOpen || !exportData || !currentProjectId) {
      return;
    }

    // Check ref - if save already initiated, don't run again
    if (saveInitiatedRef.current) {
      return;
    }

    // Mark save as initiated immediately to prevent re-runs
    saveInitiatedRef.current = true;

    let cancelled = false;

    const autoSave = async () => {
      setIsSaving(true);
      setSaveError(null);
      
      try {
        console.log('[PublishWrapper] Auto-saving project before publish...');
        await handleSaveToCloud(exportData, exportData.name, exportData.description);
        
        if (!cancelled) {
          // After saving, load fresh data from cloud to get updated name/description
          console.log('[PublishWrapper] Loading fresh project data from cloud...');
          const cloudProject = await loadFromCloud(currentProjectId);
          
          console.log('[PublishWrapper] Cloud project loaded:', {
            hasSessionData: !!cloudProject?.sessionData,
            name: (cloudProject?.sessionData as SessionData)?.name,
            description: (cloudProject?.sessionData as SessionData)?.description,
          });
          
          if (cloudProject && cloudProject.sessionData) {
            setFreshSessionData(cloudProject.sessionData as SessionData);
            setIsReady(true);
          } else {
            throw new Error('Failed to load project data from cloud');
          }
          
          setIsSaving(false);
        }
      } catch (err) {
        console.error('[PublishWrapper] Auto-save or reload failed:', err);
        if (!cancelled) {
          setSaveError(err instanceof Error ? err.message : 'Failed to prepare project for publishing');
          setIsSaving(false);
          saveInitiatedRef.current = false; // Reset on error so user can retry
        }
      }
    };

    autoSave();

    return () => {
      cancelled = true;
    };
    // Only depend on isOpen - other dependencies will cause infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Don't render dialog if not open
  if (!isOpen) {
    return null;
  }

  // Don't render if no export data
  if (!exportData) {
    console.warn('[PublishToGalleryDialogWrapper] No export data available');
    return null;
  }

  // Show saving state
  if (isSaving) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preparing to Publish</DialogTitle>
            <DialogDescription>
              Saving your latest changes...
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Show save error
  if (saveError) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Failed</DialogTitle>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {saveError}
            </AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    );
  }

  // Check if project is saved to cloud
  if (!currentProjectId) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Project First</DialogTitle>
          </DialogHeader>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You must save your project to the cloud before publishing it to the gallery.
              Please save your project first, then try publishing again.
            </AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    );
  }

  // Handle title/description changes from publish dialog
  const handleTitleDescriptionChange = async (title: string, description: string) => {
    console.log('[PublishWrapper] Updating project name/description before publish:', { title, description });
    
    // Update the store immediately so inline title updates
    setProjectName(title);
    setProjectDescription(description);
    
    // Also save to cloud with the new name/description
    try {
      await handleSaveToCloud(exportData, title, description);
      console.log('[PublishWrapper] Saved project with updated name/description');
    } catch (err) {
      console.error('[PublishWrapper] Failed to save updated name/description:', err);
      // Don't throw - publish can still continue with the store update
    }
  };

  // Don't show publish dialog until auto-save completes and fresh data loads
  if (!isReady || !freshSessionData) {
    return null;
  }

  // Use fresh session data from cloud (includes updated name/description)
  return (
    <PublishToGalleryDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      sessionData={freshSessionData}
      projectId={currentProjectId}
      onPublishSuccess={onPublishSuccess}
      onTitleDescriptionChange={handleTitleDescriptionChange}
    />
  );
}
