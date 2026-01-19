import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Terminal, Download, Settings, Loader2, Copy, CheckCircle, Info, Package, Play, Keyboard, Code } from 'lucide-react';
import { useExportStore } from '../../stores/exportStore';
import { useExportDataCollector } from '../../utils/exportDataCollector';
import { ExportRenderer } from '../../utils/exportRenderer';

const sanitizeGoFileName = (value: string): string => {
  if (!value) return '';
  return value
    .replace(/\s+/g, '_') // spaces to underscores (Go convention)
    .replace(/[^a-zA-Z0-9_]/g, '') // allow alphanumeric and underscore only
    .replace(/_+/g, '_') // collapse multiple underscores
    .toLowerCase();
};

const sanitizePackageName = (value: string): string => {
  if (!value) return '';
  return value
    .replace(/\s+/g, '') // no spaces
    .replace(/[^a-z0-9]/gi, '') // alphanumeric only
    .toLowerCase();
};

const finalizeFileName = (value: string): string => {
  // Remove leading/trailing underscores only when finalizing for export
  return value.replace(/^_+|_+$/g, '');
};

const formatDuration = (milliseconds: number): string => {
  if (milliseconds <= 0) return '0.00s';
  if (milliseconds < 1000) return `${milliseconds}ms`;
  return `${(milliseconds / 1000).toFixed(2)}s`;
};

/**
 * Bubbletea Export Dialog
 * Generates a Go package for Bubbletea terminal UI animations
 */
export const BubbleteaExportDialog: React.FC = () => {
  const activeFormat = useExportStore((state) => state.activeFormat);
  const showExportModal = useExportStore((state) => state.showExportModal);
  const setShowExportModal = useExportStore((state) => state.setShowExportModal);
  const bubbleteaSettings = useExportStore((state) => state.bubbleteaSettings);
  const setBubbleteaSettings = useExportStore((state) => state.setBubbleteaSettings);
  const setProgress = useExportStore((state) => state.setProgress);
  const setIsExporting = useExportStore((state) => state.setIsExporting);
  const isExporting = useExportStore((state) => state.isExporting);

  const exportData = useExportDataCollector();

  const [copySuccess, setCopySuccess] = useState(false);

  const isOpen = showExportModal && activeFormat === 'bubbletea';

  const sanitizedFileName = useMemo(() => finalizeFileName(sanitizeGoFileName(bubbleteaSettings.fileName)), [bubbleteaSettings.fileName]);
  const sanitizedPackageName = useMemo(() => sanitizePackageName(bubbleteaSettings.packageName), [bubbleteaSettings.packageName]);

  const importSnippet = useMemo(() => {
    const pkgName = sanitizedPackageName || 'asciimotion';
    const lines: string[] = [];

    lines.push(`import (`);
    lines.push(`    anim "yourproject/${pkgName}"`);
    lines.push(`)`);
    lines.push('');
    lines.push('// Create a new animation model');
    lines.push(`model := anim.New(anim.Config{`);
    lines.push(`    AutoPlay: true,`);
    lines.push(`    Loop:     ${bubbleteaSettings.loopAnimation},`);
    lines.push(`})`);
    lines.push('');
    
    if (bubbleteaSettings.playbackStyle === 'api') {
      lines.push('// In your parent model\'s Update:');
      lines.push('case anim.TickMsg:');
      lines.push('    m.animation, cmd = m.animation.Update(msg)');
      lines.push('    return m, cmd');
      lines.push('');
      lines.push('// API methods available:');
      lines.push('// m.animation.Play()    - Start playback');
      lines.push('// m.animation.Pause()   - Pause playback');
      lines.push('// m.animation.Restart() - Restart from frame 0');
      lines.push('// m.animation.SetFrame(n) - Jump to frame n');
    } else if (bubbleteaSettings.playbackStyle === 'keyboard') {
      lines.push('// Keyboard controls:');
      lines.push('// Space - Play/Pause toggle');
      lines.push('// R     - Restart animation');
      lines.push('// Q     - Quit (sends tea.Quit)');
    } else {
      lines.push('// Autoplay mode: animation starts automatically');
      lines.push('// No user controls - just renders the animation');
    }

    return lines.join('\n');
  }, [bubbleteaSettings.loopAnimation, bubbleteaSettings.playbackStyle, sanitizedPackageName]);

  const frameCount = exportData?.frames.length ?? 0;
  const canvasWidth = exportData?.canvasDimensions.width ?? 0;
  const canvasHeight = exportData?.canvasDimensions.height ?? 0;
  const totalDurationMs = useMemo(
    () => (exportData ? exportData.frames.reduce((sum, frame) => sum + frame.duration, 0) : 0),
    [exportData]
  );

  // Count unique colors in the animation
  const uniqueColorCount = useMemo(() => {
    if (!exportData) return 0;
    const colors = new Set<string>();
    exportData.frames.forEach((frame) => {
      frame.data.forEach((cell) => {
        if (cell.color) colors.add(cell.color);
        if (cell.bgColor && cell.bgColor !== 'transparent') colors.add(cell.bgColor);
      });
    });
    return colors.size;
  }, [exportData]);

  useEffect(() => {
    if (!isOpen) {
      setCopySuccess(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    setShowExportModal(false);
  };

  const handleFilenameChange = (value: string) => {
    const sanitized = sanitizeGoFileName(value);
    setBubbleteaSettings({ fileName: sanitized });
  };

  const handlePackageNameChange = (value: string) => {
    const sanitized = sanitizePackageName(value);
    setBubbleteaSettings({ packageName: sanitized });
  };

  const handleExport = async () => {
    if (!exportData) {
      console.error('No export data available');
      alert('No export data available. Please create content before exporting.');
      return;
    }

    if (!sanitizedFileName || !sanitizedPackageName) {
      alert('Please provide valid filename and package name before exporting.');
      return;
    }

    try {
      setIsExporting(true);
      const renderer = new ExportRenderer((progress) => setProgress(progress));
      await renderer.exportBubbleteaComponent(exportData, {
        ...bubbleteaSettings,
        fileName: sanitizedFileName,
        packageName: sanitizedPackageName,
      });
      handleClose();
    } catch (error) {
      console.error('Bubbletea component export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  };

  const handleCopyImportSnippet = async () => {
    try {
      await navigator.clipboard.writeText(importSnippet);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy import snippet:', error);
    }
  };

  const canExport = Boolean(exportData && sanitizedFileName && sanitizedPackageName && !isExporting);

  const colorModeDescription = {
    hex: <>Preserves original <code>#rrggbb</code> values. Includes dark and light color dictionaries.</>,
    semantic: <>Maps to ANSI 16-color palette with human-readable comments. Includes dark and light themes.</>
  };

  const playbackStyleDescription = {
    autoplay: 'Animation runs automatically with no user controls. Ideal for splash screens.',
    keyboard: 'User can control with Space (pause/play), R (restart), Q (quit).',
    api: 'Exposes Play(), Pause(), Restart(), SetFrame(n) methods for programmatic control.'
  };

  return (
    <Dialog open={isOpen} onOpenChange={setShowExportModal}>
      <DialogContent className="max-w-lg sm:max-w-xl p-0 overflow-hidden border-border/50" aria-describedby={undefined}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 bg-background">
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Export Bubbletea Component
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col max-h-[80vh]">
          {/* Sticky Filename */}
          <div className="sticky top-0 z-10 bg-background px-6 py-4 border-b border-border/50 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bubbletea-filename">File Name</Label>
              <div className="flex">
                <Input
                  id="bubbletea-filename"
                  value={bubbleteaSettings.fileName}
                  onChange={(e) => handleFilenameChange(e.target.value)}
                  placeholder="ascii_motion_anim"
                  className="flex-1"
                  disabled={isExporting}
                />
                <Badge variant="outline" className="ml-2 self-center">
                  .go
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Letters, numbers, and underscores only (Go snake_case convention).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bubbletea-package">Package Name</Label>
              <Input
                id="bubbletea-package"
                value={bubbleteaSettings.packageName}
                onChange={(e) => handlePackageNameChange(e.target.value)}
                placeholder="asciimotion"
                disabled={isExporting}
              />
              <p className="text-xs text-muted-foreground">
                Go package name (lowercase alphanumeric only).
              </p>
            </div>

            {(!sanitizedFileName || !sanitizedPackageName) && (
              <p className="text-xs text-destructive">Please enter valid filename and package name before exporting.</p>
            )}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <Card className="border-border/50">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  <span className="text-sm font-medium">Playback Style</span>
                </div>

                <div className="space-y-3">
                  <Select
                    value={bubbleteaSettings.playbackStyle}
                    onValueChange={(value: 'autoplay' | 'keyboard' | 'api') => setBubbleteaSettings({ playbackStyle: value })}
                    disabled={isExporting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select playback style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="autoplay">
                        <div className="flex items-center gap-2">
                          <Play className="w-4 h-4" />
                          Autoplay
                        </div>
                      </SelectItem>
                      <SelectItem value="keyboard">
                        <div className="flex items-center gap-2">
                          <Keyboard className="w-4 h-4" />
                          Keyboard Controls
                        </div>
                      </SelectItem>
                      <SelectItem value="api">
                        <div className="flex items-center gap-2">
                          <Code className="w-4 h-4" />
                          API-based
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {playbackStyleDescription[bubbleteaSettings.playbackStyle]}
                  </p>
                </div>

                <Separator className="bg-border/50" />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="bubbletea-loop">Loop animation</Label>
                    <p className="text-xs text-muted-foreground">Animation restarts after the last frame.</p>
                  </div>
                  <Switch
                    id="bubbletea-loop"
                    checked={bubbleteaSettings.loopAnimation}
                    onCheckedChange={(checked) => setBubbleteaSettings({ loopAnimation: checked })}
                    disabled={isExporting}
                  />
                </div>

                <Separator className="bg-border/50" />

                <div className="space-y-3">
                  <Label>Color Mode</Label>
                  <Select
                    value={bubbleteaSettings.colorMode}
                    onValueChange={(value: 'hex' | 'semantic') => setBubbleteaSettings({ colorMode: value })}
                    disabled={isExporting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select color mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hex">Hex colors (exact)</SelectItem>
                      <SelectItem value="semantic">Semantic Color (ANSI 16)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {colorModeDescription[bubbleteaSettings.colorMode]}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Copy className="w-4 h-4" />
                  <span className="text-sm font-medium">Import & Usage</span>
                </div>

                <div className="relative">
                  <pre className="bg-muted/70 rounded-md p-3 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed overflow-x-auto max-w-full">
                    {importSnippet}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyImportSnippet}
                    disabled={copySuccess}
                    className="absolute top-2 right-2 gap-1 h-7"
                  >
                    {copySuccess ? (
                      <>
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <ul className="space-y-1">
                    <li>1. Download the generated <code>{`${sanitizedFileName || 'animation'}.go`}</code> file.</li>
                    <li>2. Create a directory for the package (e.g., <code>{sanitizedPackageName || 'asciimotion'}/</code>).</li>
                    <li>3. Move the file into that directory.</li>
                    <li>4. Import the package in your Bubbletea app.</li>
                    <li>5. Embed the animation model in your parent model.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  <span className="text-sm font-medium">Dependencies</span>
                </div>

                <div className="relative">
                  <pre className="bg-muted/70 rounded-md p-3 text-xs font-mono whitespace-pre-wrap break-all">go get github.com/charmbracelet/bubbletea github.com/charmbracelet/lipgloss</pre>
                </div>

                <p className="text-xs text-muted-foreground">
                  Requires Go 1.21+, <code>bubbletea</code>, and <code>lipgloss</code>.
                  Visit <a href="https://github.com/charmbracelet/bubbletea" target="_blank" rel="noopener noreferrer" className="underline">Bubbletea docs</a> for more details.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="pt-4 space-y-3">
                <span className="text-sm font-medium">Export Summary</span>
                <Separator className="bg-border/50" />
                <div className="text-xs text-muted-foreground space-y-2">
                  <div>Package: <span className="font-medium text-foreground">{sanitizedPackageName || 'asciimotion'}</span></div>
                  <div>File: <span className="font-medium text-foreground">{sanitizedFileName || 'animation'}.go</span></div>
                  <div>Frames: <span className="font-medium text-foreground">{frameCount}</span></div>
                  <div>Canvas Size: <span className="font-medium text-foreground">{canvasWidth} × {canvasHeight}</span> characters</div>
                  <div>Total Duration: <span className="font-medium text-foreground">{formatDuration(totalDurationMs)}</span></div>
                  <div>Unique Colors: <span className="font-medium text-foreground">{uniqueColorCount}</span></div>
                  <div>
                    Color Mode:{' '}
                    <span className="font-medium text-foreground">
                      {bubbleteaSettings.colorMode === 'hex' ? 'Hex (exact)' : 'Semantic (ANSI 16)'}
                    </span>
                  </div>
                  <div>
                    Playback:{' '}
                    <span className="font-medium text-foreground">
                      {bubbleteaSettings.playbackStyle === 'autoplay' ? 'Autoplay' : 
                       bubbleteaSettings.playbackStyle === 'keyboard' ? 'Keyboard controls' : 'API-based'}
                    </span>
                  </div>
                  <div>
                    Looping:{' '}
                    <span className="font-medium text-foreground">
                      {bubbleteaSettings.loopAnimation ? 'Yes' : 'No (stops at last frame)'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sticky Actions */}
          <div className="sticky bottom-0 z-10 bg-background px-6 py-4 border-t border-border/50 flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isExporting}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={!canExport}>
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export .go File
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
