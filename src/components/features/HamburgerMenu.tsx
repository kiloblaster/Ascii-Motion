import React, { useState } from 'react';
import { Button } from '../ui/button';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from '../ui/menubar';
import { Menu, Info, Keyboard, CloudUpload, CloudDownload, FilePlus2, Settings, Sparkles, Users, Upload, BookOpen, ExternalLink, Terminal } from 'lucide-react';
import { AboutDialog } from './AboutDialog';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { MCPConnectionDialog } from './MCPConnectionDialog';
import { useAuth } from '@ascii-motion/premium';
import { useCloudDialogState } from '../../hooks/useCloudDialogState';
import { useProjectDialogState } from '../../hooks/useProjectDialogState';
import { useProjectFileActions } from '../../hooks/useProjectFileActions';
import { useWelcomeDialog } from '../../hooks/useWelcomeDialog';
import { useMCPStore } from '../../mcp';
import { FEATURES } from '../../constants/features';
import { cn } from '../../lib/utils';

interface HamburgerMenuProps {
  onOpenGallery?: () => void;
  onOpenPublish?: () => void;
}

/**
 * Hamburger menu button for the top header bar
 * Contains app information and cloud storage operations
 */
export const HamburgerMenu: React.FC<HamburgerMenuProps> = ({ onOpenGallery, onOpenPublish }) => {
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showMCPDialog, setShowMCPDialog] = useState(false);
  
  const { user } = useAuth();
  const mcpConnectionState = useMCPStore((state) => state.connectionState);
  const { 
    setShowProjectsDialog,
  } = useCloudDialogState();
  
  const {
    setShowNewProjectDialog,
    setShowProjectSettingsDialog,
  } = useProjectDialogState();

  const { showSaveProjectDialog, showSaveAsDialog } = useProjectFileActions();
  
  const { resetWelcomeState } = useWelcomeDialog();

  return (
    <>
      <Menubar className="border-none bg-transparent p-0">
        <MenubarMenu>
          <MenubarTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 relative"
              aria-label="Menu"
              tabIndex={1}
            >
              <Menu className="h-4 w-4" />
              {/* MCP connection status indicator */}
              {mcpConnectionState !== 'disconnected' && (
                <span
                  className={cn(
                    'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-background',
                    mcpConnectionState === 'connected' && 'bg-green-500',
                    mcpConnectionState === 'connecting' && 'bg-yellow-500 animate-pulse',
                    mcpConnectionState === 'error' && 'bg-red-500'
                  )}
                />
              )}
            </Button>
          </MenubarTrigger>
          <MenubarContent align="start" className="border-border/50">
            {/* Project Management */}
            <MenubarItem onClick={() => setShowNewProjectDialog(true)} className="cursor-pointer">
              <FilePlus2 className="mr-2 h-4 w-4" />
              <span>New Project</span>
            </MenubarItem>
            
            <MenubarSeparator />
            
            {user && (
              <>
                <MenubarItem onClick={showSaveProjectDialog} className="cursor-pointer">
                  <CloudUpload className="mr-2 h-4 w-4" />
                  <span>Save Project</span>
                  <span className="ml-auto pl-4 text-xs text-muted-foreground">
                    {navigator.platform.includes('Mac') ? '⌘S' : 'Ctrl+S'}
                  </span>
                </MenubarItem>
                
                <MenubarItem onClick={showSaveAsDialog} className="cursor-pointer">
                  <CloudUpload className="mr-2 h-4 w-4" />
                  <span>Save As...</span>
                  <span className="ml-auto pl-4 text-xs text-muted-foreground">
                    {navigator.platform.includes('Mac') ? '⇧⌘S' : 'Ctrl+Shift+S'}
                  </span>
                </MenubarItem>
                
                <MenubarItem onClick={() => setShowProjectsDialog(true)} className="cursor-pointer">
                  <CloudDownload className="mr-2 h-4 w-4" />
                  <span>Open Project</span>
                  <span className="ml-auto pl-4 text-xs text-muted-foreground">
                    {navigator.platform.includes('Mac') ? '⌘O' : 'Ctrl+O'}
                  </span>
                </MenubarItem>
                
                <MenubarSeparator />
              </>
            )}
            
            <MenubarItem onClick={() => setShowProjectSettingsDialog(true)} className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Project Settings</span>
            </MenubarItem>
            
            <MenubarSeparator />
            
            {FEATURES.COMMUNITY_SHOWCASE && onOpenGallery && (
              <>
                <MenubarItem onClick={onOpenGallery} className="cursor-pointer">
                  <Users className="mr-2 h-4 w-4" />
                  <span>Community Gallery</span>
                </MenubarItem>
                
                {user && onOpenPublish && (
                  <MenubarItem onClick={onOpenPublish} className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    <span>Publish to Gallery</span>
                  </MenubarItem>
                )}
                
                <MenubarSeparator />
              </>
            )}
            
            <MenubarItem onClick={resetWelcomeState} className="cursor-pointer">
              <Sparkles className="mr-2 h-4 w-4" />
              <span>Show Welcome Screen</span>
            </MenubarItem>
            
            <MenubarItem onClick={() => setShowKeyboardShortcuts(true)} className="cursor-pointer">
              <Keyboard className="mr-2 h-4 w-4" />
              <span>Keyboard Shortcuts</span>
            </MenubarItem>
            
            <MenubarItem 
              onClick={() => window.open('https://docs.ascii-motion.com/getting-started', '_blank')} 
              className="cursor-pointer"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              <span>Documentation</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </MenubarItem>
            
            <MenubarSeparator />
            
            <MenubarItem onClick={() => setShowMCPDialog(true)} className="cursor-pointer">
              <Terminal className="mr-2 h-4 w-4" />
              <span>MCP Connection</span>
              {mcpConnectionState === 'connected' && (
                <span className="ml-auto w-2 h-2 rounded-full bg-green-500" />
              )}
            </MenubarItem>
            
            <MenubarItem onClick={() => setShowAboutDialog(true)} className="cursor-pointer">
              <Info className="mr-2 h-4 w-4" />
              <span>About</span>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      {/* Dialogs */}
      <AboutDialog 
        isOpen={showAboutDialog} 
        onOpenChange={setShowAboutDialog} 
      />
      <KeyboardShortcutsDialog 
        isOpen={showKeyboardShortcuts} 
        onOpenChange={setShowKeyboardShortcuts} 
      />
      <MCPConnectionDialog
        isOpen={showMCPDialog}
        onOpenChange={setShowMCPDialog}
      />
    </>
  );
};
