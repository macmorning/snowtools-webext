/**
 * ServiceNow Tool Belt - Info Panel Module
 * Displays current instance, scope, and update set information
 */

// Module state
let panelManuallyMinimized = false;

// Pages where info panel should not be displayed
const INFO_PANEL_EXCLUSIONS = [
    '/sys_script_execution_history.do',
    '/sys_script_execution_history_list.do',
    '/sys_update_set.do',
    '/sys_update_set_list.do',
    '/sys_update_version.do',
    '/sys_update_version_list.do',
    '/sys.scripts.modern.do',
    '/sys.scripts.do',
    '/sn_glider_app/ide.do'
];

/**
 * Helper to create styled div
 */
function createStyledDiv(className, styles, content = '') {
    const div = document.createElement('div');
    if (className) div.className = className;
    if (styles) div.style.cssText = styles;
    if (content) div.textContent = content;
    return div;
}

/**
 * Updates the info panel with new update set/scope info
 */
function updateInfoPanel(parsed) {
    try {
        const scopeName = parsed.currentApplication?.name || 'Global';
        const rawUpdateSetName = parsed.currentUpdateSet?.name || 'Default';
        const updateSetName = cleanUpdateSetName(rawUpdateSetName, scopeName);
        
        const scopeText = document.querySelector('.sntb-info-panel-scope');
        const updateSetText = document.querySelector('.sntb-info-panel-updateset');
        
        if (scopeText && updateSetText) {
            scopeText.textContent = scopeName;
            updateSetText.textContent = updateSetName;
            debugLog("*SNOW TOOL BELT* Updated info panel");
        }
    } catch (error) {
        debugLog("*SNOW TOOL BELT* Error updating info panel:", error);
    }
}

/**
 * Minimizes the info panel to a compact version
 */
function minimizePanel(panel, colors, isManual = false) {
    debugLog("*SNOW TOOL BELT* Minimizing info panel", isManual ? "(manual)" : "(automatic)");
    
    if (isManual) {
        panelManuallyMinimized = true;
    }
    
    // Hide the full panel
    panel.style.display = 'none';
    
    // Create minimized version
    const miniPanel = document.createElement('div');
    miniPanel.className = 'sntb-info-panel-mini';
    miniPanel.style.cssText = `
        position: fixed;
        bottom: 0;
        left: 0;
        background: ${window.sntbInstanceColor};
        border: 2px solid ${window.sntbInstanceColor};
        border-radius: 4px 4px 0 0;
        box-shadow: 0 2px 10px ${window.sntbInstanceColor}80;
        padding: 6px 8px;
        z-index: 999998;
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
    `;
    
    // Add expand button
    const expandBtn = document.createElement('span');
    expandBtn.textContent = '▲';
    expandBtn.style.cssText = `
        color: ${colors.textSecondary};
        font-size: 14px;
        font-weight: normal;
        cursor: pointer;
        opacity: 0.9;
        transition: opacity 0.2s ease;
    `;
    
    expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        restorePanel(panel, miniPanel, true);
    });
    
    expandBtn.addEventListener('mouseenter', () => {
        expandBtn.style.opacity = '1';
    });
    
    expandBtn.addEventListener('mouseleave', () => {
        expandBtn.style.opacity = '0.9';
    });
    
    // Add close button
    const miniCloseBtn = document.createElement('span');
    miniCloseBtn.textContent = '✕';
    miniCloseBtn.style.cssText = `
        color: ${colors.textSecondary};
        font-size: 14px;
        font-weight: normal;
        cursor: pointer;
        opacity: 0.9;
        transition: opacity 0.2s ease;
    `;
    
    miniCloseBtn.addEventListener('mouseenter', () => {
        miniCloseBtn.style.opacity = '1';
    });
    
    miniCloseBtn.addEventListener('mouseleave', () => {
        miniCloseBtn.style.opacity = '0.9';
    });
    
    miniCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.sntbStorageAPI.local.set({ showInfoPanel: false }, () => {
            debugLog("*SNOW TOOL BELT* Info panel closed from mini view");
            miniPanel.remove();
            panel.remove();
        });
    });
    
    // Click anywhere on mini panel to expand
    miniPanel.addEventListener('click', () => {
        restorePanel(panel, miniPanel, true);
    });
    
    miniPanel.appendChild(expandBtn);
    miniPanel.appendChild(miniCloseBtn);
    document.body.appendChild(miniPanel);
}

/**
 * Restores the info panel from minimized state
 */
function restorePanel(panel, miniPanel, isManual = false) {
    debugLog("*SNOW TOOL BELT* Restoring info panel", isManual ? "(manual)" : "(automatic)");
    
    if (isManual) {
        panelManuallyMinimized = false;
    }
    
    panel.style.display = 'flex';
    if (miniPanel) miniPanel.remove();
}

/**
 * Creates the info panel at bottom-left of screen
 */
async function createInfoPanel() {
    debugLog("*SNOW TOOL BELT* createInfoPanel called");
    
    try {
        // Check if already exists
        if (document.querySelector('.sntb-info-panel')) {
            debugLog("*SNOW TOOL BELT* Info panel already exists");
            return true;
        }
        
        // Don't show panel on portals
        const tabInfo = window.sntbGetTabInfo();
        if (tabInfo.type === "portal") {
            debugLog("*SNOW TOOL BELT* Info panel not shown on portal pages");
            return false;
        }
        
        // Don't show panel on certain pages
        const currentPath = window.location.pathname;
        if (INFO_PANEL_EXCLUSIONS.some(path => currentPath.includes(path))) {
            debugLog("*SNOW TOOL BELT* Info panel not shown on excluded page:", currentPath);
            return false;
        }
        
        // Fetch current update set and scope
        if (!window.sntbContext.g_ck) {
            debugLog("*SNOW TOOL BELT* Cannot create info panel: no session token");
            return false;
        }
        
        debugLog("*SNOW TOOL BELT* Fetching update set info...");
        const concourseUrl = window.location.origin + "/api/now/ui/concoursepicker/current";
        const headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Accept', 'application/json');
        headers.append('X-UserToken', window.sntbContext.g_ck);
        
        const response = await fetch(concourseUrl, { headers: headers });
        if (!response.ok) {
            console.log("*SNOW TOOL BELT* Failed to fetch update set info");
            return false;
        }
        
        const text = await response.text();
        const parsed = JSON.parse(text).result;
        
        // Extract scope and update set info
        const scopeName = parsed.currentApplication?.name || 'Global';
        const rawUpdateSetName = parsed.currentUpdateSet?.name || 'Default';
        const updateSetName = cleanUpdateSetName(rawUpdateSetName, scopeName);
        
        debugLog("*SNOW TOOL BELT* Update set info fetched:", { scopeName, updateSetName });
        
        // Get theme colors
        const colors = window.sntbGetThemeColors();
        const instanceColor = window.sntbInstanceColor;
        const isDefaultColor = window.sntbIsDefaultColor;
        const instanceDisplayName = window.sntbInstanceDisplayName;
        
        // Create info panel container
        const panel = document.createElement('div');
        panel.className = 'sntb-info-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: ${colors.bgSurface};
            border: 2px solid ${instanceColor};
            border-radius: 8px;
            box-shadow: 0 4px 20px ${instanceColor}40;
            padding: 12px 32px 12px 16px;
            padding-top: 24px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: ${colors.textPrimary};
            z-index: 999998;
            display: flex;
            align-items: center;
            gap: 12px;
            max-width: 600px;
            opacity: 1;
        `;
        
        // Create drag handle (grip)
        const dragHandle = document.createElement('div');
        dragHandle.className = 'sntb-info-panel-grip';
        dragHandle.style.cssText = `
            position: absolute;
            top: 4px;
            left: 50%;
            transform: translateX(-50%);
            width: 40px;
            height: 12px;
            cursor: move;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2px;
        `;
        
        // Add grip dots
        for (let i = 0; i < 6; i++) {
            const dot = document.createElement('div');
            dot.style.cssText = `
                width: 3px;
                height: 3px;
                background: ${colors.textMuted};
                border-radius: 50%;
                opacity: 0.5;
            `;
            dragHandle.appendChild(dot);
        }
        
        // Make panel draggable
        let isDragging = false;
        let currentX;
        let currentY;
        let offsetX;
        let offsetY;
        
        dragHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            
            // Get current position - convert bottom to top if needed
            const rect = panel.getBoundingClientRect();
            const currentTop = rect.top;
            const currentLeft = rect.left;
            
            // Calculate offset from mouse to panel corner
            offsetX = e.clientX - currentLeft;
            offsetY = e.clientY - currentTop;
            
            // Switch to top/left positioning for easier dragging
            panel.style.bottom = 'auto';
            panel.style.top = currentTop + 'px';
            panel.style.left = currentLeft + 'px';
            
            dragHandle.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                
                // Calculate new position
                currentX = e.clientX - offsetX;
                currentY = e.clientY - offsetY;
                
                // Keep panel within viewport bounds
                const maxX = window.innerWidth - panel.offsetWidth;
                const maxY = window.innerHeight - panel.offsetHeight;
                
                currentX = Math.max(0, Math.min(currentX, maxX));
                currentY = Math.max(0, Math.min(currentY, maxY));
                
                panel.style.left = currentX + 'px';
                panel.style.top = currentY + 'px';
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                dragHandle.style.cursor = 'move';
            }
        });
        
        panel.appendChild(dragHandle);
        
        // Create minimize button
        const minimizeBtn = document.createElement('div');
        minimizeBtn.className = 'sntb-info-panel-minimize';
        minimizeBtn.textContent = '▼';
        minimizeBtn.style.cssText = `
            position: absolute;
            top: 4px;
            right: 24px;
            font-size: 12px;
            font-weight: normal;
            color: ${colors.textMuted};
            cursor: pointer;
            line-height: 1;
            padding: 2px;
            opacity: 0.7;
        `;
        
        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            minimizePanel(panel, colors, true);
        });
        
        // Create close button
        const closeBtn = document.createElement('div');
        closeBtn.className = 'sntb-info-panel-close';
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: 4px;
            right: 6px;
            font-size: 14px;
            font-weight: normal;
            color: ${colors.textMuted};
            cursor: pointer;
            line-height: 1;
            padding: 2px;
            opacity: 0.7;
        `;
        
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Save preference to hide the panel
            window.sntbStorageAPI.local.set({ showInfoPanel: false }, () => {
                debugLog("*SNOW TOOL BELT* Info panel hidden by user");
                panel.remove();
            });
        });
        
        panel.appendChild(minimizeBtn);
        panel.appendChild(closeBtn);
        
        // Create color square
        const colorSquare = document.createElement('div');
        colorSquare.className = 'sntb-info-panel-color';
        colorSquare.style.cssText = `
            width: 40px;
            height: 40px;
            background-color: ${instanceColor};
            border-radius: 4px;
            flex-shrink: 0;
            box-shadow: 0 0 15px ${instanceColor};
            opacity: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: bold;
            color: ${colors.textSecondary};
        `;
        
        // Add question mark if using default color
        if (isDefaultColor) {
            colorSquare.textContent = '?';
        }
        
        // Create text container
        const textContainer = createStyledDiv(null, 'display: flex; flex-direction: column; gap: 2px; overflow: hidden;');
        
        // Create info lines with common truncation styles
        const truncateStyle = 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        const instanceLine = createStyledDiv('sntb-info-panel-instance', 
            `color: ${colors.textMuted}; font-size: 11px; font-weight: 400; ${truncateStyle} border-bottom: 1px solid ${colors.border}; padding-bottom: 4px; margin-bottom: 4px;`,
            instanceDisplayName);
        const scopeLine = createStyledDiv('sntb-info-panel-scope',
            `color: ${colors.accent}; font-size: 12px; font-weight: 600; ${truncateStyle}`,
            scopeName);
        const updateSetLine = createStyledDiv('sntb-info-panel-updateset',
            `color: ${colors.textPrimary}; font-size: 13px; font-weight: 700; ${truncateStyle}`,
            updateSetName);
        
        textContainer.appendChild(instanceLine);
        textContainer.appendChild(scopeLine);
        textContainer.appendChild(updateSetLine);
        
        panel.appendChild(colorSquare);
        panel.appendChild(textContainer);
        
        // Add click handler to toggle console
        panel.addEventListener('click', (e) => {
            // Don't toggle console if clicking buttons or drag handle
            if (e.target === closeBtn || e.target === minimizeBtn || 
                e.target === dragHandle || dragHandle.contains(e.target)) return;
            
            if (window.sntbToggleConsole) {
                window.sntbToggleConsole();
            }
        });
        
        // Add to document
        document.body.appendChild(panel);
        
        // Check initial window size and minimize if small
        if (isSmallWindow()) {
            debugLog("*SNOW TOOL BELT* Small window detected, auto-minimizing panel");
            setTimeout(() => minimizePanel(panel, colors, false), 100);
        }
        
        // Add resize listener to handle window size changes
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const miniPanel = document.querySelector('.sntb-info-panel-mini');
                const isCurrentlyMinimized = miniPanel !== null;
                const shouldBeMinimized = isSmallWindow();
                
                // Only auto-adjust if user hasn't manually changed state
                if (!panelManuallyMinimized) {
                    if (shouldBeMinimized && !isCurrentlyMinimized) {
                        debugLog("*SNOW TOOL BELT* Window became small, auto-minimizing");
                        minimizePanel(panel, colors, false);
                    } else if (!shouldBeMinimized && isCurrentlyMinimized) {
                        debugLog("*SNOW TOOL BELT* Window became large, auto-restoring");
                        restorePanel(panel, miniPanel, false);
                    }
                }
            }, 250);
        });
        
        debugLog("*SNOW TOOL BELT* Info panel created");
        return true;
        
    } catch (error) {
        console.log("*SNOW TOOL BELT* Error creating info panel:", error);
        return false;
    }
}

/**
 * Refreshes the info panel with current data
 */
async function refreshInfoPanel() {
    if (!window.sntbContext.g_ck) {
        return;
    }
    
    try {
        debugLog("*SNOW TOOL BELT* Refreshing info panel...");
        const concourseUrl = window.location.origin + "/api/now/ui/concoursepicker/current";
        const headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Accept', 'application/json');
        headers.append('X-UserToken', window.sntbContext.g_ck);
        
        const response = await fetch(concourseUrl, { headers: headers });
        if (!response.ok) {
            debugLog("*SNOW TOOL BELT* Failed to refresh info panel");
            return;
        }
        
        const text = await response.text();
        const parsed = JSON.parse(text).result;
        
        updateInfoPanel(parsed);
    } catch (error) {
        console.log("*SNOW TOOL BELT* Error refreshing info panel:", error);
    }
}

/**
 * Sets up the info panel with retry logic
 */
function setupInfoPanel() {
    debugLog("*SNOW TOOL BELT* Setting up info panel");
    
    // Check if user wants to show the info panel
    window.sntbStorageAPI.local.get("showInfoPanel", (data) => {
        const showPanel = data.showInfoPanel !== false; // Default to true if not set
        
        if (!showPanel) {
            debugLog("*SNOW TOOL BELT* Info panel disabled by user preference");
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 10;
        
        const tryCreate = async () => {
            attempts++;
            debugLog("*SNOW TOOL BELT* Attempt", attempts, "to create info panel");
            
            const success = await createInfoPanel();
            
            if (success) {
                debugLog("*SNOW TOOL BELT* Info panel successfully created");
                
                // Set up visibility change listener to refresh when tab becomes visible
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden) {
                        debugLog("*SNOW TOOL BELT* Tab became visible, refreshing info panel");
                        refreshInfoPanel();
                    }
                });
                
                // Also refresh on focus
                window.addEventListener('focus', () => {
                    debugLog("*SNOW TOOL BELT* Window focused, refreshing info panel");
                    refreshInfoPanel();
                });
                
                return true;
            }
            
            if (attempts >= maxAttempts) {
                debugLog("*SNOW TOOL BELT* Max attempts reached for info panel");
                return false;
            }
            
            return false;
        };
        
        // Try every 1 second for up to 10 seconds
        const intervalId = setInterval(async () => {
            const success = await tryCreate();
            if (success || attempts >= maxAttempts) {
                clearInterval(intervalId);
            }
        }, 1000);
    });
}

// Expose public API
window.sntbInfoPanel = {
    setup: setupInfoPanel,
    refresh: refreshInfoPanel,
    update: updateInfoPanel
};

console.log("*SNOW TOOL BELT* Info panel module loaded");
