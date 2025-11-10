const isChromium = (typeof browser === "undefined");
// Firefox compatibility: use browser API if available
const runtimeAPI = typeof browser !== "undefined" ? browser.runtime : chrome.runtime;
const storageAPI = typeof browser !== "undefined" ? browser.storage : chrome.storage;
const context = {
    g_ck: "",
    debugMode: false
}

/**
 * Debug logging function - only logs when debug mode is enabled
 * @param {...any} args - Arguments to log
 */
function debugLog(...args) {
    if (context.debugMode) {
        console.log(...args);
    }
}
/**
 * Recursively finds all elements matching a selector, including inside shadow DOM
 * @param {Element|Document} root - The root element to search from
 * @param {string} selector - CSS selector to match
 * @returns {Array} Array of matching elements
 */
function querySelectorAllDeep(root, selector) {
    const elements = [];

    // Get elements from current root
    try {
        const directMatches = root.querySelectorAll(selector);
        elements.push(...directMatches);
    } catch (e) {
        debugLog("*SNOW TOOL BELT* Error querying root:", e);
    }

    // Recursively search shadow roots and iframes
    try {
        const allElements = root.querySelectorAll('*');
        allElements.forEach(element => {
            // Search shadow roots
            if (element.shadowRoot) {
                try {
                    const shadowMatches = querySelectorAllDeep(element.shadowRoot, selector);
                    elements.push(...shadowMatches);

                    // Also check for iframes inside shadow roots
                    const shadowIframes = element.shadowRoot.querySelectorAll('iframe');
                    shadowIframes.forEach(iframe => {
                        try {
                            const iframeMatches = querySelectorAllDeep(iframe.contentWindow.document, selector);
                            elements.push(...iframeMatches);
                        } catch (e) {
                            // Cross-origin or access denied - skip
                        }
                    });
                } catch (e) {
                    debugLog("*SNOW TOOL BELT* Error accessing shadow root:", e);
                }
            }

            // Search regular iframes
            if (element.tagName === 'IFRAME') {
                try {
                    const iframeMatches = querySelectorAllDeep(element.contentWindow.document, selector);
                    elements.push(...iframeMatches);
                } catch (e) {
                    // Cross-origin or access denied - skip
                }
            }
        });
    } catch (e) {
        debugLog("*SNOW TOOL BELT* Error in deep traversal:", e);
    }

    return elements;
}

/**
 * Recursively finds the first element matching a selector, including inside shadow DOM
 * @param {Element|Document} root - The root element to search from
 * @param {string} selector - CSS selector to match
 * @returns {Element|null} First matching element or null
 */
function querySelectorDeep(root, selector) {
    // Try direct match first
    const directMatch = root.querySelector(selector);
    if (directMatch) return directMatch;

    // Search in shadow roots
    const allElements = root.querySelectorAll('*');
    for (const element of allElements) {
        if (element.shadowRoot) {
            const shadowMatch = querySelectorDeep(element.shadowRoot, selector);
            if (shadowMatch) return shadowMatch;
        }
    }

    return null;
}

/**
 * Changes field labels to technical names and the other way round
 * Now supports shadow DOM traversal for modern ServiceNow interfaces
 */
function switchFieldNames() {
    debugLog("*SNOW TOOL BELT* Switching field names (with shadow DOM support)");

    // Check if we're in a modern workspace - if so, disable this feature for now
    // Look for sn-canvas-toolbar which is present in workspaces but not in classic UI
    // Need to search in shadow DOM as well
    const hasCanvasToolbar = querySelectorAllDeep(document, "sn-canvas-toolbar").length > 0;
    
    if (hasCanvasToolbar) {
        debugLog("*SNOW TOOL BELT* Field name switching disabled in modern workspace (detected sn-canvas-toolbar in shadow DOM)");
        return { success: false, message: "Sorry! Switching field names is not supported in Workspaces at this time." };
    }

    // Global state management - check if we're currently showing technical names
    const isCurrentlyTechnical = document.body.getAttribute("data-sntb-technical") === "true";
    debugLog("*SNOW TOOL BELT* Current state:", isCurrentlyTechnical ? "showing technical names" : "showing labels");

    // Get the document context - now with enhanced shadow DOM + iframe detection
    let doc = document;
    let targetDoc = document;

    // First, check for traditional iframe
    const mainIframe = document.getElementsByTagName("iframe")[0];
    if (mainIframe) {
        try {
            targetDoc = mainIframe.contentWindow.document;
            debugLog("*SNOW TOOL BELT* Found traditional iframe");
        } catch (e) {
            debugLog("*SNOW TOOL BELT* Cannot access iframe document:", e);
        }
    }

    // Then, check for iframe inside shadow DOM (modern ServiceNow)
    const documentShadowHosts = Array.from(document.querySelectorAll("*")).filter(el => el.shadowRoot);
    for (const shadowHost of documentShadowHosts) {
        debugLog("*SNOW TOOL BELT* Checking shadow host:", shadowHost.tagName);
        try {
            const shadowIframe = shadowHost.shadowRoot.querySelector("iframe#gsft_main, iframe[name='gsft_main'], iframe");
            if (shadowIframe) {
                debugLog("*SNOW TOOL BELT* Found iframe in shadow DOM:", shadowIframe.id || shadowIframe.name || 'unnamed');
                try {
                    targetDoc = shadowIframe.contentWindow.document;
                    debugLog("*SNOW TOOL BELT* Successfully accessed shadow iframe document");
                    break;
                } catch (e) {
                    debugLog("*SNOW TOOL BELT* Cannot access shadow iframe document:", e);
                }
            }
        } catch (e) {
            debugLog("*SNOW TOOL BELT* Error accessing shadow root:", e);
        }
    }

    doc = targetDoc;

    // For [related] lists - search including shadow DOM
    debugLog("*SNOW TOOL BELT* Processing related lists...");
    let fields = querySelectorAllDeep(doc, "[glide_field]");
    debugLog("*SNOW TOOL BELT* Found", fields.length, "glide_field elements");

    fields.forEach((el, index) => {
        try {
            const glideField = el.getAttribute("glide_field");
            const glideLabel = el.getAttribute("glide_label");
            
            // Skip if this is a checkbox column, control column, or has no valid field name
            if (!glideField || glideField === "" || glideField === "null") {
                debugLog(`*SNOW TOOL BELT* List element ${index + 1}: Skipping (no valid glide_field)`);
                return;
            }
            
            // Skip if this is a control column (checkbox, search icon, etc.)
            if (el.classList.contains("col-control") || el.classList.contains("list-decoration-table")) {
                debugLog(`*SNOW TOOL BELT* List element ${index + 1}: Skipping (control column)`);
                return;
            }
            
            // Skip if the element contains a checkbox (it's a checkbox column)
            if (el.querySelector("input[type='checkbox']")) {
                debugLog(`*SNOW TOOL BELT* List element ${index + 1}: Skipping (contains checkbox)`);
                return;
            }
            
            // Skip if this is a search control column
            if (el.getAttribute("name") === "search") {
                debugLog(`*SNOW TOOL BELT* List element ${index + 1}: Skipping (search column)`);
                return;
            }
            
            // Skip if the element doesn't have a proper column header structure
            if (!el.classList.contains("list_header_cell") && !el.classList.contains("list_hdr")) {
                debugLog(`*SNOW TOOL BELT* List element ${index + 1}: Skipping (not a header cell)`);
                return;
            }
            
            // Find the text element - try multiple selectors for different list structures
            let childEl = el.querySelector("a.column_head"); // Modern list headers
            if (!childEl) {
                childEl = el.querySelector("span.list_header_cell_container a"); // Try more specific selector
            }
            if (!childEl) {
                childEl = el.querySelector("span a"); // Related lists
            }
            
            // Don't use generic "a" fallback as it might catch checkbox labels
            
            if (childEl) {
                const currentText = childEl.innerText;

                debugLog(`*SNOW TOOL BELT* List element ${index + 1}:`, {
                    currentText,
                    glideField,
                    glideLabel,
                    element: el.outerHTML.substring(0, 200),
                    childElClass: childEl.className
                });

                if (isCurrentlyTechnical && glideLabel) {
                    // Currently showing technical name, switch back to label
                    childEl.innerText = glideLabel;
                    debugLog(`*SNOW TOOL BELT* List: Restored "${glideLabel}" from technical name`);
                } else if (!isCurrentlyTechnical && glideField) {
                    // Currently showing label, switch to technical
                    let cleanedField = glideField;
                    // Remove sys_readonly. prefix
                    cleanedField = cleanedField.replace(/^sys_readonly\./, "");
                    // Remove table name prefix (e.g., "sys_update_xml." from "sys_update_xml.sys_created_on")
                    if (cleanedField.includes(".")) {
                        const parts = cleanedField.split(".");
                        // Only keep the last part (the actual field name)
                        cleanedField = parts[parts.length - 1];
                    }
                    childEl.innerText = cleanedField;
                    debugLog(`*SNOW TOOL BELT* List: Switched to technical "${cleanedField}" (original: "${glideField}")`);
                }
            } else {
                debugLog(`*SNOW TOOL BELT* List element ${index + 1}: No text element found`);
            }
        } catch (e) {
            debugLog("*SNOW TOOL BELT* Error processing glide_field element:", e);
        }

        // Mark this element as processed to avoid duplicate processing
        el.setAttribute("data-sntb-processed", "list");
    });

    // For forms - search including shadow DOM with multiple selectors
    debugLog("*SNOW TOOL BELT* Processing form labels...");
    const formSelectors = [
        "label[for].control-label",
        "label[for]",
        ".control-label",
        ".field-label",
        "label.control-label"
    ];

    let allFormFields = [];
    formSelectors.forEach(selector => {
        const foundFields = querySelectorAllDeep(doc, selector);
        debugLog(`*SNOW TOOL BELT* Found ${foundFields.length} elements for form selector: ${selector}`);
        allFormFields.push(...foundFields);
    });

    // Remove duplicates
    fields = [...new Set(allFormFields)];
    debugLog("*SNOW TOOL BELT* Total unique form label elements:", fields.length);

    fields.forEach((el, index) => {
        try {
            const forAttr = el.getAttribute("for");
            
            // Skip checkbox labels (allcheck, check_)
            if (forAttr && (forAttr.includes("allcheck") || forAttr.startsWith("check_"))) {
                debugLog(`*SNOW TOOL BELT* Form element ${index + 1}: Skipping (checkbox label)`);
                return;
            }
            
            // Skip action labels (listv2_*_labelAction)
            if (forAttr && forAttr.includes("labelAction")) {
                debugLog(`*SNOW TOOL BELT* Form element ${index + 1}: Skipping (action label)`);
                return;
            }

            // Try to find the text container - either span.label-text or direct label content
            let textEl = el.querySelector("span.label-text");
            let isDirectLabel = false;

            if (!textEl) {
                // For reference fields and other direct label structures
                if (el.tagName === 'LABEL' && el.innerText && !el.querySelector("input, select, textarea")) {
                    textEl = el;
                    isDirectLabel = true;
                }
            }

            if (textEl) {
                const savedName = el.getAttribute("data-sntb-name");
                const currentText = textEl.innerText;

                debugLog(`*SNOW TOOL BELT* Form element ${index + 1}:`, {
                    currentText,
                    savedName,
                    forAttr,
                    isDirectLabel,
                    structure: isDirectLabel ? "direct label" : "span.label-text",
                    element: el.outerHTML.substring(0, 150)
                });

                if (isCurrentlyTechnical && savedName) {
                    // Currently showing technical name, switch back to original
                    if (isDirectLabel) {
                        // For direct labels, debug the structure and try multiple approaches
                        debugLog(`*SNOW TOOL BELT* Direct label structure analysis:`, {
                            innerHTML: el.innerHTML,
                            childNodes: Array.from(el.childNodes).map(node => ({
                                type: node.nodeType,
                                content: node.textContent || node.nodeValue,
                                tagName: node.tagName
                            })),
                            textContent: el.textContent,
                            innerText: el.innerText
                        });

                        // Try multiple approaches to change the text
                        let success = false;

                        // Approach 1: Find and update text nodes
                        const childNodes = Array.from(el.childNodes);
                        const textNodes = childNodes.filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
                        if (textNodes.length > 0) {
                            textNodes.forEach(node => {
                                if (node.textContent.trim() === currentText.trim()) {
                                    node.textContent = savedName;
                                    success = true;
                                    debugLog(`*SNOW TOOL BELT* Updated text node: "${currentText}" -> "${savedName}"`);
                                }
                            });
                        }

                        // Approach 2: If no specific text node found, replace all text content
                        if (!success) {
                            // Store child elements
                            const childElements = Array.from(el.children);
                            // Clear and set new text
                            el.textContent = savedName;
                            // Re-append child elements
                            childElements.forEach(child => el.appendChild(child));
                            success = true;
                            debugLog(`*SNOW TOOL BELT* Replaced entire text content: "${currentText}" -> "${savedName}"`);
                        }

                        // Verify the change
                        setTimeout(() => {
                            const newText = el.innerText;
                            debugLog(`*SNOW TOOL BELT* Verification - text is now: "${newText}" (expected: "${savedName}")`);
                        }, 10);

                    } else {
                        textEl.innerText = savedName;
                    }
                    debugLog(`*SNOW TOOL BELT* Form: Restored "${savedName}" from technical name (${isDirectLabel ? 'direct' : 'span'})`);
                } else if (!isCurrentlyTechnical && forAttr) {
                    // Currently showing original name, switch to technical
                    if (!savedName) {
                        // First time - save original
                        el.setAttribute("data-sntb-name", currentText);
                    }
                    let technicalName = forAttr.replace("sys_display.", "").replace("select_0", "");
                    // Remove sys_readonly. prefix
                    technicalName = technicalName.replace(/^sys_readonly\./, "");
                    // Remove table name prefix (e.g., "sys_update_set." from "sys_update_set.name")
                    if (technicalName.includes(".")) {
                        const parts = technicalName.split(".");
                        // Only keep the last part (the actual field name)
                        technicalName = parts[parts.length - 1];
                    }

                    if (isDirectLabel) {
                        // For direct labels, use the same robust approach
                        let success = false;

                        // Try to find and update specific text nodes
                        const childNodes = Array.from(el.childNodes);
                        const textNodes = childNodes.filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
                        if (textNodes.length > 0) {
                            textNodes.forEach(node => {
                                if (node.textContent.trim() === currentText.trim()) {
                                    node.textContent = technicalName;
                                    success = true;
                                }
                            });
                        }

                        // Fallback to replacing entire text content
                        if (!success) {
                            const childElements = Array.from(el.children);
                            el.textContent = technicalName;
                            childElements.forEach(child => el.appendChild(child));
                        }
                    } else {
                        textEl.innerText = technicalName;
                    }
                    debugLog(`*SNOW TOOL BELT* Form: Switched to technical "${technicalName}" (saved: "${savedName || currentText}") (${isDirectLabel ? 'direct' : 'span'})`);
                }
            } else {
                debugLog(`*SNOW TOOL BELT* Form element ${index + 1}: No text container found in`, el.outerHTML.substring(0, 150));
            }
        } catch (e) {
            debugLog("*SNOW TOOL BELT* Error processing form label element:", e);
        }

        // Mark this element as processed to avoid duplicate processing
        el.setAttribute("data-sntb-processed", "form");
    });

    // Enhanced debugging and modern interface detection
    debugLog("*SNOW TOOL BELT* Current URL:", window.location.href);
    debugLog("*SNOW TOOL BELT* Using document:", doc === document ? "main document" : "iframe document");
    debugLog("*SNOW TOOL BELT* Total elements in document:", doc.querySelectorAll("*").length);

    // Check for shadow hosts
    const shadowHosts = Array.from(doc.querySelectorAll("*")).filter(el => el.shadowRoot);
    debugLog("*SNOW TOOL BELT* Shadow hosts found:", shadowHosts.length);
    if (shadowHosts.length > 0) {
        debugLog("*SNOW TOOL BELT* Shadow host tags:", shadowHosts.map(el => el.tagName).slice(0, 10));
    }

    // For modern workspace/shadow DOM elements
    // Only process modern elements if we're in a modern workspace (not classic UI)
    // Look for sn-canvas-toolbar which is present in workspaces but not in classic UI
    // Need to search in shadow DOM as well
    const hasCanvasToolbarElement = querySelectorAllDeep(doc, "sn-canvas-toolbar").length > 0;
    const isModernWorkspace = hasCanvasToolbarElement;
    
    if (isModernWorkspace) {
        debugLog("*SNOW TOOL BELT* Processing modern workspace elements...");
    } else {
        debugLog("*SNOW TOOL BELT* Skipping modern workspace processing (classic UI detected)");
    }

    if (isModernWorkspace) {
        // Try multiple modern selectors with comprehensive coverage
        const modernSelectors = [
        // ServiceNow specific components
        "sn-form-field", "now-form-field", "sn-record-form", "now-record-form",
        // Data attributes
        "[data-field-name]", "[field-name]", "[data-field]", "[name*='field']",
        // Label selectors
        "label[for]", ".control-label", ".field-label", ".form-label",
        // Generic form elements
        ".form-field", ".sn-form-field", ".now-form-field",
        // Modern UI components
        "macroponent-f51912f4c700201072b211d4d8c26010", // ServiceNow form component
        "now-highlighted-value", "sn-highlighted-value",
        // Broader selectors for debugging
        "*[class*='field']", "*[class*='label']", "*[id*='field']"
    ];

    let totalModernElements = 0;
    modernSelectors.forEach(selector => {
        try {
            const elements = querySelectorAllDeep(doc, selector);
            if (elements.length > 0) {
                debugLog(`*SNOW TOOL BELT* Found ${elements.length} elements for selector: ${selector}`);
                totalModernElements += elements.length;

                // Process first few elements for debugging
                elements.slice(0, 5).forEach((el, index) => {
                    debugLog(`*SNOW TOOL BELT* Element ${index + 1}:`, {
                        id: el.id,
                        tag: el.tagName,
                        classes: el.className,
                        attributes: Array.from(el.attributes).map(attr => `${attr.name}="${attr.value}"`),
                        text: el.innerText ? el.innerText.substring(0, 50) : 'no text'
                    });
                });
            }

            elements.forEach((el) => {
                try {
                    // Skip elements that were already processed by form or list processing
                    if (el.getAttribute("data-sntb-processed")) {
                        debugLog(`*SNOW TOOL BELT* Skipping already processed element (${el.getAttribute("data-sntb-processed")}):`, el.tagName);
                        return;
                    }

                    // Multiple strategies to find labels and field names
                    let labelEl = null;
                    let fieldName = null;

                    // Strategy 1: Direct label elements
                    if (el.tagName === 'LABEL') {
                        labelEl = el;
                        fieldName = el.getAttribute('for') || el.getAttribute('data-field-name') || el.getAttribute('field-name');
                    }

                    // Strategy 2: Find label within element
                    if (!labelEl) {
                        labelEl = el.querySelector("label, .label, [role='label'], .field-label, .control-label, span, div");
                    }

                    // Strategy 3: Check if element itself has text content
                    if (!labelEl && el.innerText && el.innerText.trim()) {
                        labelEl = el;
                    }

                    // Get field name from various attributes
                    if (!fieldName) {
                        fieldName = el.getAttribute("data-field-name") ||
                            el.getAttribute("field-name") ||
                            el.getAttribute("data-field") ||
                            el.getAttribute("name");

                        // For modern workspace, try to find the actual field name from associated input/select elements
                        if (!fieldName || fieldName.startsWith("form-field-")) {
                            const forAttr = el.getAttribute("for");
                            if (forAttr) {
                                // Look for the actual input/select element this label is for
                                const targetElement = doc.getElementById(forAttr) || doc.querySelector(`[id="${forAttr}"]`);
                                if (targetElement) {
                                    fieldName = targetElement.getAttribute("data-field-name") ||
                                        targetElement.getAttribute("field-name") ||
                                        targetElement.getAttribute("data-field") ||
                                        targetElement.getAttribute("name") ||
                                        targetElement.getAttribute("data-ref-field") ||
                                        targetElement.getAttribute("data-table-field");
                                }
                            }
                        }

                        // If still no good field name, try parent elements
                        if (!fieldName || fieldName.startsWith("form-field-")) {
                            let parent = el.parentElement;
                            for (let i = 0; i < 5 && parent; i++) {
                                const parentFieldName = parent.getAttribute("data-field-name") ||
                                    parent.getAttribute("field-name") ||
                                    parent.getAttribute("data-field") ||
                                    parent.getAttribute("name") ||
                                    parent.getAttribute("data-ref-field") ||
                                    parent.getAttribute("data-table-field");
                                if (parentFieldName && !parentFieldName.startsWith("form-field-")) {
                                    fieldName = parentFieldName;
                                    break;
                                }
                                parent = parent.parentElement;
                            }
                        }

                        // Last resort: use for/id but clean it up
                        if (!fieldName || fieldName.startsWith("form-field-")) {
                            fieldName = el.getAttribute("for") || el.id;
                        }
                    }



                    if (labelEl && fieldName && labelEl.innerText) {
                        // Skip checkbox labels and action labels
                        if (fieldName.includes("allcheck") || fieldName.startsWith("check_") || fieldName.includes("labelAction")) {
                            debugLog(`*SNOW TOOL BELT* Modern: Skipping checkbox/action label: ${fieldName}`);
                            return;
                        }
                        
                        // Clean up the field name
                        let cleanFieldName = fieldName.replace("sys_display.", "").replace("select_0", "");

                        const savedName = el.getAttribute("data-sntb-original");
                        const currentText = labelEl.innerText.trim();

                        debugLog(`*SNOW TOOL BELT* Modern field detection:`, {
                            element: el.tagName,
                            originalFieldName: fieldName,
                            cleanFieldName: cleanFieldName,
                            currentText: currentText,
                            savedName: savedName,
                            isGenerated: fieldName.startsWith("form-field-")
                        });

                        if (isCurrentlyTechnical && savedName) {
                            // Currently showing technical name, switch back to original
                            labelEl.innerText = savedName;
                            debugLog(`*SNOW TOOL BELT* Modern: Restored "${savedName}" from technical name`);
                        } else if (!isCurrentlyTechnical && currentText && currentText !== cleanFieldName && !cleanFieldName.startsWith("form-field-")) {
                            // Currently showing original name, switch to technical
                            if (!savedName) {
                                // First time - save original
                                el.setAttribute("data-sntb-original", currentText);
                            }
                            labelEl.innerText = cleanFieldName;
                            debugLog(`*SNOW TOOL BELT* Modern: Switched to technical "${cleanFieldName}" (saved: "${savedName || currentText}")`);
                        }
                    }
                } catch (e) {
                    debugLog("*SNOW TOOL BELT* Error processing modern element:", e);
                }
            });
        } catch (e) {
            debugLog(`*SNOW TOOL BELT* Error with selector ${selector}:`, e);
        }
    });

        debugLog("*SNOW TOOL BELT* Total modern elements found:", totalModernElements);
    } // End of isModernWorkspace check

    // Toggle global state
    document.body.setAttribute("data-sntb-technical", isCurrentlyTechnical ? "false" : "true");
    debugLog("*SNOW TOOL BELT* New state:", isCurrentlyTechnical ? "showing labels" : "showing technical names");

    debugLog("*SNOW TOOL BELT* Field name switching completed");
}
/**
 * Parses the stats page and extracts the node name
 * @param {string} text The text to extract the node name from
 */
function getNameFromStatsPage(text) {
    let instanceName = "";
    try {
        instanceName = text.split("<br/>")[1].split(": ")[1];
        // if current contains ":" then split it again
        if (instanceName.indexOf(":") > -1) {
            instanceName = instanceName.split(":")[1];
        }
    } catch (e) {
        // console.log("*SNOW TOOL BELT* Couldn't analyze the text we got from the stats page");
        // console.log(text);
    }
    return instanceName;
}

/**
 * Sets up monitoring for update set changes using polling
 * Only checks when the tab is active (visible and focused)
 */
function setupUpdateSetMonitoring() {
    let lastUpdateSetId = null;
    let isCheckingUpdateSet = false;
    
    const POLLING_INTERVAL = 5000; // 5 seconds
    
    /**
     * Fetches current update set and reports if changed
     */
    const checkAndReportUpdateSet = async () => {
        // Only check if tab is active (visible and focused)
        if (document.hidden || !document.hasFocus()) {
            debugLog("*SNOW TOOL BELT* Skipping update set check (tab not active)");
            return;
        }
        
        if (!context.g_ck || isCheckingUpdateSet) return;
        
        isCheckingUpdateSet = true;
        
        try {
            const concourseUrl = window.location.origin + "/api/now/ui/concoursepicker/updateset";
            const headers = new Headers();
            headers.append('Content-Type', 'application/json');
            headers.append('Accept', 'application/json');
            headers.append('Cache-Control', 'no-cache');
            headers.append('X-UserToken', context.g_ck);
            
            const response = await fetch(concourseUrl, { headers: headers });
            if (response.ok && response.status === 200) {
                const text = await response.text();
                const parsed = JSON.parse(text).result;
                const currentId = parsed.current?.sysId || parsed.current?.sys_id;
                
                // Check if update set changed
                if (lastUpdateSetId !== null && currentId !== lastUpdateSetId) {
                    debugLog("*SNOW TOOL BELT* Update set changed from", lastUpdateSetId, "to", currentId);
                    
                    // Report the change to background
                    const updateSetInfo = {
                        updateSet: parsed.updateSet,
                        current: parsed.current
                    };
                    
                    const tabInfo = getTabInfo();
                    runtimeAPI.sendMessage({
                        command: "reportTabState",
                        tabInfo: {
                            type: tabInfo.type,
                            details: tabInfo.details,
                            tabs: tabInfo.tabs,
                            updateSet: updateSetInfo,
                            timestamp: Date.now()
                        }
                    });
                    
                    console.log("*SNOW TOOL BELT* Update set change reported:", parsed.current?.name);
                }
                
                lastUpdateSetId = currentId;
            }
        } catch (error) {
            debugLog("*SNOW TOOL BELT* Error checking update set:", error);
        } finally {
            isCheckingUpdateSet = false;
        }
    };
    
    // Start polling every 5 seconds
    setInterval(checkAndReportUpdateSet, POLLING_INTERVAL);
    
    console.log("*SNOW TOOL BELT* Update set monitoring initialized (5s polling, active tab only)");
}

/**
 * Gets informations about current tab
 * @returns {Object} containing informations about current tab
 */
function getTabInfo() {
    let response = {
        "type": "other", // workspace / ...
        "details": "", // app name / ...
        "tabs": []
    };

    // is this a workspace?
    if (document.querySelector("sn-workspace-layout") || document.querySelector("sn-canvas-root")) {
        response.type = "workspace";
        try {
            // This is a very workspace DOM dependent implementation; need to find a better way of doing this 
            let root = document.querySelector("sn-workspace-tabs").shadowRoot.querySelector("chrome-tabs").shadowRoot.querySelectorAll("chrome-one-tab");
            root.forEach((elem) => {
                response.tabs.push(elem.shadowRoot.querySelector("li a span:nth-of-type(2)").innerText);
            });
        } catch (e) {
            // console.log("*SNOW TOOL BELT* unable to find workspace tabs: " + e);
        }
    } else if (document.querySelector("div.sp-page-root")) {
        response.type = "portal";
    } else if (document.querySelector("div.status-bar-main")) {
        response.type = "app studio";
        response.details = document.querySelector("div.app-info").innerText;
    }
    return response;
}

/**
 * Initializes all content script features 
 * @param {object} options the response object that was sent by the background script
 * @returns {boolean} true if work was done
 */
function initScript(options) {
    // Load debug mode setting
    storageAPI.local.get("debugMode", (data) => {
        context.debugMode = data.debugMode === true;
        debugLog("*SNOW TOOL BELT* Debug mode:", context.debugMode ? "enabled" : "disabled");
    });

    let frame = document.getElementById("gsft_main");
    let targetWindow = frame ? frame.contentWindow : window;
    if (options.favIconColor !== undefined) {
        updateFavicon(options.favIconColor);
    }

    // get session identifier "g_ck" from page
    window.addEventListener("message", function (event) {
        if (event.source == window &&
            event.data.direction &&
            event.data.direction == "from-snow-page-script") {
            context.g_ck = event.data.message;
        }
    });
    // inject the getSession script to get the g_ck token
    let getSessionJS = window.document.createElement("script");
    getSessionJS.setAttribute("src", runtimeAPI.getURL("/content-script/getSession.js"));
    window.document.head.appendChild(getSessionJS);

    let title = document.querySelector("title");
    if (!title) {
        title = document.createElement("title");
        document.head.appendChild(title);
    }

    // Handle the background script popup case
    let url = new URL(window.location);
    if (url.pathname.includes("/sys.scripts.do")) {
        // We are on the execution summary page, show the back button
        // load the Heisenberg css file
        let cssFile = window.document.createElement("link");
        cssFile.setAttribute("rel", "stylesheet");
        cssFile.setAttribute("href", chrome.runtime.getURL("/css/snowbelt.css"));
        window.document.head.appendChild(cssFile);
        const content = backgroundScriptAddonTemplate2();
        document.body.insertAdjacentHTML("afterbegin", content);
        let backBtnEl = document.querySelector("#historyBackButton");
        backBtnEl.onclick = (evt) => { window.history.back(); }
    } else if (url.pathname.includes("/sys.scripts.modern.do")) {
        debugLog("*SNOW TOOL BELT* Background script " + url.pathname);
        document.title = "Background script popup";

        // load the CSS file
        let cssFile = window.document.createElement("link");
        cssFile.setAttribute("rel", "stylesheet");
        cssFile.setAttribute("href", runtimeAPI.getURL("/css/snowbelt.css"));
        window.document.head.appendChild(cssFile);

        // Wait for Monaco Editor to be available
        const waitForMonaco = () => {
            return new Promise((resolve, reject) => {
                let attempts = 0;
                const maxAttempts = 100; // 10 seconds max wait

                const checkMonaco = () => {
                    attempts++;
                    debugLog(`*SNOW TOOL BELT* Checking for Monaco (attempt ${attempts}/${maxAttempts})`);

                    // Check for ServiceNow's Monaco implementation
                    const hasMonaco = window.monaco && window.monaco.editor;
                    const hasGlideEditor = window.GlideEditorMonaco;
                    let hasScriptEditor = false;
                    try {
                        hasScriptEditor = window.script_editor && typeof window.script_editor === 'object' && window.script_editor.editor;
                    } catch (e) {
                        // Ignore errors when checking script_editor
                    }
                    const editorElements = document.querySelectorAll('.monaco-editor');

                    try {
                        debugLog("*SNOW TOOL BELT* Monaco check:", {
                            monacoExists: !!window.monaco,
                            editorAPI: !!(window.monaco && window.monaco.editor),
                            glideEditorMonaco: !!window.GlideEditorMonaco,
                            scriptEditor: !!window.script_editor,
                            scriptEditorType: typeof window.script_editor,
                            scriptEditorReady: !!(window.script_editor && typeof window.script_editor === 'object' && window.script_editor.editor),
                            editorElements: editorElements.length
                        });
                    } catch (e) {
                        debugLog("*SNOW TOOL BELT* Error in Monaco check debug:", e.message);
                    }

                    // Check if we have enough to work with - be less strict about ServiceNow objects
                    if ((hasMonaco || editorElements.length > 0) && document.getElementById('div_script')) {
                        debugLog("*SNOW TOOL BELT* Monaco editor environment detected!");
                        resolve(true);
                        return;
                    }

                    // Alternative: if we have the Monaco DOM but not the objects, try to proceed anyway
                    if (editorElements.length > 0 && attempts > 20) {
                        debugLog("*SNOW TOOL BELT* Monaco DOM found, proceeding without full API access");
                        resolve(true);
                        return;
                    }

                    if (attempts >= maxAttempts) {
                        debugLog("*SNOW TOOL BELT* Monaco editor not found after maximum attempts");
                        reject(new Error("Monaco editor not found"));
                        return;
                    }

                    setTimeout(checkMonaco, 100);
                };
                checkMonaco();
            });
        };

        // Function to get Monaco editor instance
        const getMonacoEditor = () => {
            // Try multiple approaches to get the editor

            // Method 1: ServiceNow's script_editor global
            try {
                if (window.script_editor && window.script_editor.editor) {
                    return window.script_editor.editor;
                }
            } catch (e) {
                debugLog("*SNOW TOOL BELT* Error accessing script_editor:", e.message);
            }

            // Method 2: Standard Monaco API
            try {
                if (window.monaco && window.monaco.editor) {
                    const editors = window.monaco.editor.getEditors();
                    if (editors && editors.length > 0) {
                        return editors[0];
                    }
                }
            } catch (e) {
                debugLog("*SNOW TOOL BELT* Error accessing monaco.editor:", e.message);
            }

            // Method 3: Try to find via GlideEditorMonaco if available
            try {
                if (window.GlideEditorMonaco && window.GlideEditorMonaco.get) {
                    const editor = window.GlideEditorMonaco.get('script');
                    if (editor && editor.editor) {
                        return editor.editor;
                    }
                }
            } catch (e) {
                debugLog("*SNOW TOOL BELT* Error accessing GlideEditorMonaco:", e.message);
            }

            return null;
        };

        // Function to set Monaco editor content
        const setMonacoContent = (content) => {
            debugLog("*SNOW TOOL BELT* Using clipboard approach for Monaco content");

            // Copy content to clipboard and show user-friendly notification
            try {
                navigator.clipboard.writeText(content).then(() => {
                    debugLog("*SNOW TOOL BELT* Content copied to clipboard");

                    // Show a helpful notification using theme colors
                    const notification = document.createElement('div');
                    notification.innerHTML = `
                        <div style="
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            background: var(--btn-hover-color, #81B5A1);
                            color: var(--main-bg-color, #F7F7F7);
                            padding: 15px 20px;
                            border-radius: 8px;
                            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
                            z-index: 10000;
                            font-family: 'Helvetica', sans-serif;
                            font-size: 14px;
                            max-width: 400px;
                            border: 1px solid var(--muted-color, #81B5A1);
                            transition: opacity 0.3s ease-out;
                        ">
                            <strong>✓ Script copied to clipboard!</strong><br>
                            Click in the Monaco editor and press <strong>Ctrl+V</strong> to paste.
                        </div>
                    `;
                    document.body.appendChild(notification);

                    // Auto-remove after 2 seconds with fade out
                    setTimeout(() => {
                        if (notification.parentElement) {
                            const notificationDiv = notification.firstElementChild;
                            notificationDiv.style.opacity = '0';
                            setTimeout(() => {
                                if (notification.parentElement) {
                                    notification.remove();
                                }
                            }, 300);
                        }
                    }, 2000);

                    // Try to focus the Monaco editor to make pasting easier
                    const monacoTextarea = document.querySelector('.monaco-editor textarea.inputarea');
                    if (monacoTextarea) {
                        monacoTextarea.focus();
                        debugLog("*SNOW TOOL BELT* Monaco editor focused for pasting");
                    }

                }).catch(err => {
                    debugLog("*SNOW TOOL BELT* Clipboard failed, showing modal:", err.message);
                    showContentModal(content);
                });

                return true;
            } catch (e) {
                debugLog("*SNOW TOOL BELT* Clipboard not supported, showing modal:", e.message);
                showContentModal(content);
                return true;
            }
        };

        // Helper function to show content in a modal for manual copying
        const showContentModal = (content) => {
            const modal = document.createElement('div');
            modal.innerHTML = `
                <div style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.6);
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <div style="
                        background: var(--main-bg-color, #F7F7F7);
                        color: var(--main-color, #293E40);
                        padding: 20px;
                        border-radius: 8px;
                        max-width: 80%;
                        max-height: 80%;
                        overflow: auto;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                        font-family: 'Helvetica', sans-serif;
                        border: 1px solid var(--muted-color, #81B5A1);
                    ">
                        <h3 style="margin-top: 0; color: var(--highlight, #d66419);">📋 Copy Script Content</h3>
                        <p>Select all the text below and copy it (<strong>Ctrl+C</strong>), then paste it into the Monaco editor:</p>
                        <textarea readonly style="
                            width: 100%;
                            height: 300px;
                            font-family: 'Courier New', monospace;
                            font-size: 12px;
                            border: 1px solid var(--disabled-color, #cecece);
                            padding: 10px;
                            resize: vertical;
                            background: var(--alt-bg-color, #e7e7e7);
                            color: var(--main-color, #293E40);
                        " onclick="this.select()">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                        <div style="margin-top: 15px; text-align: right;">
                            <button onclick="this.closest('div[style*=\"position: fixed\"]').remove()" style="
                                background: var(--highlight, #d66419);
                                color: var(--main-bg-color, #F7F7F7);
                                border: none;
                                padding: 10px 20px;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 14px;
                                transition: background-color 0.2s ease;
                            " onmouseover="this.style.background='var(--btn-hover-color, #81B5A1)'" onmouseout="this.style.background='var(--highlight, #d66419)'">Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        };

        // Wait for the Monaco editor DOM elements to appear first
        const waitForMonacoDOM = () => {
            return new Promise((resolve) => {
                let attempts = 0;
                const maxAttempts = 50; // 5 seconds

                const checkDOM = () => {
                    attempts++;
                    const monacoEditor = document.querySelector('.monaco-editor');
                    const scriptDiv = document.getElementById('div_script');

                    debugLog(`*SNOW TOOL BELT* Waiting for Monaco DOM (attempt ${attempts}/${maxAttempts})`, {
                        monacoEditor: !!monacoEditor,
                        scriptDiv: !!scriptDiv,
                        readyState: document.readyState
                    });

                    if (monacoEditor && scriptDiv) {
                        debugLog("*SNOW TOOL BELT* Monaco DOM elements found!");
                        resolve();
                        return;
                    }

                    if (attempts >= maxAttempts) {
                        debugLog("*SNOW TOOL BELT* Monaco DOM elements not found, proceeding anyway");
                        resolve();
                        return;
                    }

                    setTimeout(checkDOM, 100);
                };
                checkDOM();
            });
        };

        waitForMonacoDOM().then(() => {
            // Wait a bit more for ServiceNow's scripts to initialize
            return new Promise(resolve => setTimeout(resolve, 2000));
        }).then(() => {
            return waitForMonaco();
        }).then(() => {
            debugLog("*SNOW TOOL BELT* Monaco editor ready, initializing background script enhancements");
            // We are on the background script page with Monaco editor
            // retrieves execution history for the current user
            debugLog("*SNOW TOOL BELT* Fetching execution history");
            let historyUrl = new Request(url.origin + "/sys_script_execution_history_list.do?JSONv2&sysparm_action=getRecords&sysparm_query=executed_byDYNAMIC90d1921e5f510100a9ad2572f2b477fe^ORDERBYDESCstarted");
            let headers = new Headers();
            headers.append('Content-Type', 'application/json');
            headers.append('Accept', 'application/json');
            headers.append('Cache-Control', 'no-cache');

            fetch(historyUrl, { headers: headers })
                .then((response) => {
                    debugLog(response);
                    if (response.ok && response.status === 200) {
                        return response.json();
                    } else {
                        debugLog("*SNOW TOOL BELT* Error fetching execution history");
                    }
                }).then((data) => {
                    if (data && data.records && data.records.length > 0) {
                        let uniqueRecords = data.records.filter(function ({ script }) {
                            return !this[script] && (this[script] = script)
                        }, {})
                        context.history = {
                            records: uniqueRecords,
                            current: -1,
                            recordsCount: uniqueRecords.length
                        };
                        const table = backgroundScriptAddonTableTemplate();
                        document.body.insertAdjacentHTML("afterbegin", table);
                        let tableEl = document.getElementById("execution_history_table");
                        let tableContent = "";
                        context.history.records.forEach((record, index) => {
                            tableContent += backgroundScriptAddonRowTemplate(record, index);
                        });
                        tableEl.innerHTML += tableContent;

                        const displayHistoryRecord = (index) => {
                            const script = context.history.records[index].script;
                            if (!setMonacoContent(script)) {
                                debugLog("*SNOW TOOL BELT* Could not set Monaco editor content");
                            }
                        }

                        elements = document.querySelectorAll(".history_table tr");
                        [].forEach.call(elements, (el) => {
                            el.onclick = (evt) => {
                                let index = (evt.target.getAttribute("data-id") ? evt.target.getAttribute("data-id") : evt.target.parentNode.getAttribute("data-id"));
                                displayHistoryRecord(index);
                            }
                        });
                    }
                }).catch((error) => {
                    debugLog("*SNOW TOOL BELT* Error in background script enhancement:", error);
                });
        }).catch((error) => {
            debugLog("*SNOW TOOL BELT* Monaco editor not found:", error);
            debugLog("*SNOW TOOL BELT* Background script enhancements will not be available");
        });
    }
}

/**
 *  Returns an HTML string to display the title and the buttons to navigate in the script history
 */
function backgroundScriptAddonTemplate2() {
    return `
        <div class="history">
            <button id="historyBackButton">&lt;- back</button>
        </div>
    `
}

/**
 *  Returns an HTML table
 */
function backgroundScriptAddonTableTemplate() {
    return `
    <div class="history">
        <table id="execution_history_table" class="history_table">
            <tr id="execution_history_header">
                <th style="width:3%;" name="">
                </th>
                <th style="width:25%;" name="last_executed">
                    <span style="white-space:nowrap">last executed</span>
                </th>
                <th style="width:72%;" name="script">
                    <span style="white-space:nowrap">script</span>
                </th>
            </tr>
        </table>
    </div>
    `
}
/**
 *  Returns an HTML table row
 */
function backgroundScriptAddonRowTemplate(row, index) {
    let safeRow = {};
    Object.keys(row).forEach(function (key) {
        safeRow[key] = DOMPurify.sanitize(row[key]);
    });

    return `
        <tr data-id="${index}" id="execution_history_table_${safeRow.sys_id}">
            <td name="">
            &gt;
            </td>
            <td name="started">
                ${safeRow.started}
            </td>
            <td name="script">
                ${safeRow.script}
            </td>
        </tr>
    `
}


/**
 * Paints the favicon with a specific color
 * @param {string} color value
 * @returns {boolean} true if work was done
 */
function updateFavicon(color) {
    debugLog("*SNOW TOOL BELT* update favicon color to: " + color);
    if (color === undefined || color === "") {
        return true;
    }
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "shortcut icon");
        document.head.appendChild(link);
    }
    let faviconUrl = link.href || window.location.origin + "/favicon.ico";

    let canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    let context = canvas.getContext("2d");

    let img = document.createElement("img");
    img.onload = function (ev) {
        // Draw the original image
        context.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);

        // Get image data to analyze colors
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Find the most used non-transparent color
        const colorCounts = {};
        let maxCount = 0;
        let dominantColor = null;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // Skip transparent pixels
            if (a < 128) continue;

            // Create color key (ignore very light colors like white/near-white)
            const colorKey = `${r},${g},${b}`;
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;

            // Skip very light colors (brightness > 240) as they're likely background
            if (brightness > 240) continue;

            colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;

            if (colorCounts[colorKey] > maxCount) {
                maxCount = colorCounts[colorKey];
                dominantColor = { r, g, b };
            }
        }

        debugLog("*SNOW TOOL BELT* Dominant color found:", dominantColor, "with", maxCount, "pixels");

        if (dominantColor) {
            // Replace the dominant color with the instance color
            const targetColor = hexToRgb(color);
            if (targetColor) {
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    // Skip transparent pixels
                    if (a < 128) continue;

                    // Check if this pixel matches the dominant color (with some tolerance)
                    const colorDistance = Math.sqrt(
                        Math.pow(r - dominantColor.r, 2) +
                        Math.pow(g - dominantColor.g, 2) +
                        Math.pow(b - dominantColor.b, 2)
                    );

                    // Replace colors that are close to the dominant color
                    if (colorDistance < 50) {
                        data[i] = targetColor.r;
                        data[i + 1] = targetColor.g;
                        data[i + 2] = targetColor.b;
                        // Keep original alpha
                    }
                }

                // Put the modified image data back
                context.putImageData(imageData, 0, 0);
            }
        } else {
            // Fallback to the old method if no dominant color found
            debugLog("*SNOW TOOL BELT* No dominant color found, using fallback method");
            context.globalCompositeOperation = "source-in";
            context.fillStyle = color;
            context.fillRect(0, 0, 256, 256);
        }

        link.href = canvas.toDataURL();
        link.type = "image/x-icon";
    };
    img.src = faviconUrl;
}

/**
 * Convert hex color to RGB object
 * @param {string} hex - Hex color string (e.g., "#ff0000")
 * @returns {Object|null} RGB object with r, g, b properties or null if invalid
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

/**
 * Search through multiple tables to find a record with the given sys_id
 * @param {Array} tableNames - Array of table names to search
 * @param {string} sysId - The sys_id to search for
 * @param {string} host - The ServiceNow instance host
 * @param {string} token - Authentication token
 * @returns {Promise} Promise that resolves with search result
 */
async function searchThroughTables(tableNames, sysId, host, token) {
    // Filter out ts_ tables
    const filteredTables = tableNames.filter(tableName => !tableName.startsWith("ts_"));

    const searchId = Math.random().toString(36).substr(2, 9);
    debugLog("*SNOW TOOL BELT* [SEARCH " + searchId + "] Starting search through", filteredTables.length, "tables for sys_id:", sysId);

    let tablesSearched = 0;
    for (let i = 0; i < filteredTables.length; i++) {
        const tableName = filteredTables[i];
        tablesSearched++;
        debugLog("*SNOW TOOL BELT* [SEARCH " + searchId + "] [START] Searching in table:", tableName, `(${i + 1}/${filteredTables.length})`, "- Tables searched so far:", tablesSearched);
        try {
            // Use direct record access - single API call with display values
            const tableApiUrl = `https://${host}/api/now/table/${tableName}/${sysId}?sysparm_display_value=all`;
            debugLog("*SNOW TOOL BELT* Fetching URL:", tableApiUrl);

            let response;
            try {
                response = await fetch(tableApiUrl, {
                    method: "GET",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "X-UserToken": token
                    },
                    credentials: "same-origin"
                });
                debugLog("*SNOW TOOL BELT* Fetch completed for table:", tableName, "- Status:", response.status);
            } catch (fetchError) {
                debugLog("*SNOW TOOL BELT* Fetch failed for table:", tableName, "- Error:", fetchError, "- continuing to next table");
                continue;
            }

            if (response.status === 200) {
                debugLog("*SNOW TOOL BELT* Found record in table:", tableName);

                let data;
                try {
                    data = await response.json();
                    debugLog("*SNOW TOOL BELT* Record data:", data);
                } catch (jsonError) {
                    debugLog("*SNOW TOOL BELT* Failed to parse JSON:", jsonError);
                    continue; // Skip this table if we can't parse the response
                }

                if (data.result) {
                    const record = data.result;
                    debugLog("*SNOW TOOL BELT* Raw record data:", record);

                    // Get the actual class name from sys_class_name field
                    let actualClass = tableName;
                    if (record.sys_class_name) {
                        debugLog("*SNOW TOOL BELT* sys_class_name field:", record.sys_class_name, "type:", typeof record.sys_class_name);
                        // Handle both string and object formats
                        actualClass = typeof record.sys_class_name === 'string'
                            ? record.sys_class_name
                            : (record.sys_class_name.value || record.sys_class_name.display_value || tableName);
                    }
                    debugLog("*SNOW TOOL BELT* Final actualClass:", actualClass);

                    // Try to get a meaningful display value, handling both string and object formats
                    const getDisplayValue = (field) => {
                        if (!field) return null;
                        return typeof field === 'string' ? field : (field.display_value || field.value);
                    };

                    const displayValue = getDisplayValue(record.sys_name) ||
                        getDisplayValue(record.number) ||
                        getDisplayValue(record.name) ||
                        getDisplayValue(record.short_description) ||
                        getDisplayValue(record.title) ||
                        getDisplayValue(record.sys_id) ||
                        sysId;

                    const directUrl = `https://${host}/${actualClass}.do?sys_id=${sysId}`;
                    debugLog("*SNOW TOOL BELT* Generated directUrl:", directUrl);
                    debugLog("*SNOW TOOL BELT* Using actualClass:", actualClass, "instead of table:", tableName);

                    return {
                        status: 200,
                        searchType: 'sysId',
                        searchValue: sysId,
                        sysId: sysId,
                        table: tableName,
                        actualClass: actualClass,
                        displayValue: displayValue,
                        directUrl: directUrl,
                        instance: host,
                        found: true
                    };
                }
            } else if (response.status === 404) {
                debugLog("*SNOW TOOL BELT* Record not found in table:", tableName, "- continuing to next table");
                // Continue to next table
            } else {
                debugLog("*SNOW TOOL BELT* Unexpected response status:", response.status, "for table:", tableName, "- continuing to next table");
            }
        } catch (error) {
            debugLog("*SNOW TOOL BELT* Error searching table", tableName, ":", error, "- continuing to next table");
            // Continue to next table
        }
        debugLog("*SNOW TOOL BELT* [SEARCH " + searchId + "] [END] Completed search in table:", tableName);
    }

    // If we get here, the sys_id was not found in any table
    debugLog("*SNOW TOOL BELT* [SEARCH " + searchId + "] Search completed - sys_id not found in any of the", tablesSearched, "tables searched out of", filteredTables.length, "total tables");
    return {
        status: 404,
        searchType: 'sysId',
        searchValue: sysId,
        sysId: sysId,
        table: "not_found",
        displayValue: "Record not found",
        instance: host,
        found: false,
        searchedTables: filteredTables.length
    };
}

/**
 * Search for sys_id with priority tables first, then all tables if needed
 * @param {string} sysId - The sys_id to search for
 * @param {string} host - The ServiceNow instance host
 * @param {string} token - Authentication token
 * @returns {Promise} Promise that resolves with search result
 */
async function searchSysIdWithPriority(sysId, host, token) {
    debugLog("*SNOW TOOL BELT* Starting priority sys_id search for:", sysId);

    // Priority tables to search first
    const priorityTables = [
        "sys_metadata",
        "task",
        "sn_jny_journey",
        "sys_flow_context",
        "sys_user",
        "sys_user_group",
        "sys_user_grmember",
        "sys_user_role",
        "sys_user_has_role",
        "sys_properties",
        "sysapproval_approver",
        "sysevent",
        "core_company"
    ];

    debugLog("*SNOW TOOL BELT* Searching priority tables first:", priorityTables.join(", "));

    // First, try priority tables only
    const priorityResult = await searchThroughTables(priorityTables, sysId, host, token);

    if (priorityResult.found) {
        debugLog("*SNOW TOOL BELT* Found in priority tables!");
        return priorityResult;
    }

    debugLog("*SNOW TOOL BELT* Not found in priority tables, querying sys_db_object for all tables...");

    // If not found in priority tables, get all table names and search
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');
    headers.append('Cache-Control', 'no-cache');
    headers.append('X-UserToken', token);

    try {
        const tableApiUrl = `${window.location.origin}/api/now/table/sys_db_object?sysparm_query=super_class=NULL^sys_update_name!=NULL^sys_class_name=sys_db_object^nameNOT LIKE00%5EORDERBYDESCsys_updated_on&sysparm_fields=name`;

        const response = await fetch(tableApiUrl, {
            credentials: "same-origin",
            headers: headers
        });

        if (response.ok && response.status === 200) {
            const data = await response.json();
            debugLog("*SNOW TOOL BELT* sys_db_object query result:", data);
            debugLog("*SNOW TOOL BELT* Found", data.result.length, "tables with empty super_class");

            const tableNames = data.result.map(record => record.name);
            debugLog("*SNOW TOOL BELT* Searching all", tableNames.length, "tables...");

            return await searchThroughTables(tableNames, sysId, host, token);
        } else {
            throw new Error(`sys_db_object API request failed with status: ${response.status}`);
        }
    } catch (error) {
        debugLog("*SNOW TOOL BELT* Error querying sys_db_object:", error);
        throw error;
    }
}

/**
 * Search for a record by ServiceNow number (e.g., INC0001234, REQ0005678)
 * First queries sys_number to find the table, then queries that table for the record
 * @param {string} numberValue - The number to search for (e.g., INC0001234)
 * @param {string} host - The ServiceNow instance host
 * @param {string} token - Authentication token
 * @returns {Promise} Promise that resolves with search results
 */
async function searchByNumber(numberValue, host, token) {
    debugLog("*SNOW TOOL BELT* Searching for number:", numberValue);

    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');
    headers.append('Cache-Control', 'no-cache');
    headers.append('X-UserToken', token);

    // Extract the prefix (letters) from the number
    const prefixMatch = numberValue.match(/^([A-Za-z]+)/);
    if (!prefixMatch) {
        return {
            status: 404,
            searchValue: numberValue,
            searchType: 'number',
            table: "none",
            displayValue: "Invalid number format",
            instance: host,
            found: false
        };
    }

    const prefix = prefixMatch[1].toUpperCase();
    debugLog("*SNOW TOOL BELT* Number prefix:", prefix);

    try {
        // Step 1: Query sys_number to find the table for this prefix
        // Note: Get all fields to see what's available, as the field name might vary
        const sysNumberUrl = `${window.location.origin}/api/now/table/sys_number?sysparm_query=prefix=${prefix}&sysparm_limit=1`;
        
        debugLog("*SNOW TOOL BELT* Querying sys_number for prefix:", prefix);
        const sysNumberResponse = await fetch(sysNumberUrl, {
            credentials: "same-origin",
            headers: headers
        });

        if (!sysNumberResponse.ok || sysNumberResponse.status !== 200) {
            debugLog("*SNOW TOOL BELT* sys_number query failed with status:", sysNumberResponse.status);
            return {
                status: 404,
                searchValue: numberValue,
                searchType: 'number',
                table: "none",
                displayValue: `No table found for prefix: ${prefix}`,
                instance: host,
                found: false
            };
        }

        const sysNumberData = await sysNumberResponse.json();
        debugLog("*SNOW TOOL BELT* sys_number result:", sysNumberData);

        if (!sysNumberData.result || sysNumberData.result.length === 0) {
            debugLog("*SNOW TOOL BELT* No table found for prefix:", prefix);
            return {
                status: 404,
                searchValue: numberValue,
                searchType: 'number',
                table: "none",
                displayValue: `No table found for prefix: ${prefix}`,
                instance: host,
                found: false
            };
        }

        // Get the table name from sys_number result
        // The field might be called 'table', 'category', or another name
        const sysNumberRecord = sysNumberData.result[0];
        debugLog("*SNOW TOOL BELT* Full sys_number record:", sysNumberRecord);
        
        let tableName;
        
        // Try different possible field names
        const possibleFields = ['table', 'category', 'number_table'];
        for (const fieldName of possibleFields) {
            const field = sysNumberRecord[fieldName];
            if (field) {
                if (typeof field === 'string') {
                    tableName = field;
                } else if (typeof field === 'object') {
                    tableName = field.value || field.display_value;
                }
                if (tableName) {
                    debugLog(`*SNOW TOOL BELT* Found table name in field '${fieldName}':`, tableName);
                    break;
                }
            }
        }
        
        if (!tableName) {
            debugLog("*SNOW TOOL BELT* Could not extract table name from sys_number result. Available fields:", Object.keys(sysNumberRecord));
            return {
                status: 404,
                searchValue: numberValue,
                searchType: 'number',
                table: "none",
                displayValue: `Could not determine table for prefix: ${prefix}. The sys_number record may not have a table reference.`,
                instance: host,
                found: false
            };
        }

        debugLog("*SNOW TOOL BELT* Found table for prefix:", tableName);

        // Step 2: Query the actual table for the record with this number
        const recordUrl = `${window.location.origin}/api/now/table/${tableName}?sysparm_query=number=${numberValue}&sysparm_fields=sys_id,number,short_description,state,sys_class_name,sys_updated_on&sysparm_limit=1`;
        
        debugLog("*SNOW TOOL BELT* Querying table:", tableName, "for number:", numberValue);
        const recordResponse = await fetch(recordUrl, {
            credentials: "same-origin",
            headers: headers
        });

        if (!recordResponse.ok || recordResponse.status !== 200) {
            debugLog("*SNOW TOOL BELT* Record query failed with status:", recordResponse.status);
            return {
                status: 404,
                searchValue: numberValue,
                searchType: 'number',
                table: tableName,
                displayValue: `Record not found in table: ${tableName}`,
                instance: host,
                found: false
            };
        }

        const recordData = await recordResponse.json();
        debugLog("*SNOW TOOL BELT* Record result:", recordData);

        if (!recordData.result || recordData.result.length === 0) {
            debugLog("*SNOW TOOL BELT* No record found with number:", numberValue);
            return {
                status: 404,
                searchValue: numberValue,
                searchType: 'number',
                table: tableName,
                displayValue: `Record not found: ${numberValue}`,
                instance: host,
                found: false
            };
        }

        // Extract record details
        const record = recordData.result[0];
        const actualClass = typeof record.sys_class_name === 'string'
            ? record.sys_class_name
            : (record.sys_class_name?.value || record.sys_class_name?.display_value || tableName);

        const shortDescription = typeof record.short_description === 'string'
            ? record.short_description
            : (record.short_description?.display_value || record.short_description?.value || '');

        debugLog("*SNOW TOOL BELT* Found record:", record.sys_id, "in table:", actualClass);

        return {
            status: 200,
            searchValue: numberValue,
            searchType: 'number',
            table: tableName,
            actualClass: actualClass,
            sys_id: record.sys_id,
            displayValue: numberValue,
            shortDescription: shortDescription,
            state: record.state,
            updated: record.sys_updated_on,
            directUrl: `https://${host}/${actualClass}.do?sys_id=${record.sys_id}`,
            instance: host,
            found: true,
            results: [{
                sys_id: record.sys_id,
                name: numberValue,
                table: tableName,
                sourceTable: tableName,
                actualClass: actualClass,
                directUrl: `https://${host}/${actualClass}.do?sys_id=${record.sys_id}`,
                description: `Number match in ${actualClass}`,
                updated: record.sys_updated_on,
                shortDescription: shortDescription,
                state: record.state
            }]
        };

    } catch (error) {
        debugLog("*SNOW TOOL BELT* Error in number search:", error);
        return {
            status: 500,
            searchValue: numberValue,
            searchType: 'number',
            table: "error",
            displayValue: "Error: " + error.message,
            instance: host,
            found: false
        };
    }
}

/**
 * Search for objects by name in sys_metadata and sys_flow tables
 * @param {string} objectName - The object name to search for
 * @param {string} host - The ServiceNow instance host
 * @param {string} token - Authentication token
 * @returns {Promise} Promise that resolves with search results
 */
async function searchByObjectName(searchValue, host, token, searchType = 'objectName') {
    debugLog("*SNOW TOOL BELT* Searching for:", searchValue, "Type:", searchType);

    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');
    headers.append('Cache-Control', 'no-cache');
    headers.append('X-UserToken', token);

    // Helper function to safely extract display name
    const getDisplayName = (nameField) => {
        if (!nameField) return null;
        if (typeof nameField === 'string') return nameField;
        return nameField.display_value || nameField.value || null;
    };

    // Helper function to safely extract class name
    const getClassName = (classField, fallback) => {
        if (!classField) return fallback;
        if (typeof classField === 'string') return classField;
        return classField.display_value || classField.value || fallback;
    };

    // Check if this is a "starts with" search (ends with *)
    const isStartsWithSearch = searchValue.endsWith('*');
    const cleanSearchValue = isStartsWithSearch ? searchValue.slice(0, -1) : searchValue;

    debugLog("*SNOW TOOL BELT* Search type:", isStartsWithSearch ? "starts with" : "exact match", "Clean value:", cleanSearchValue);

    // Define search tables in order
    const searchTables = [
        {
            table: 'sys_metadata',
            query: isStartsWithSearch ? `sys_nameSTARTSWITH${cleanSearchValue}` : `sys_name=${cleanSearchValue}`,
            fields: 'sys_id,name,sys_name,sys_class_name,sys_updated_on',
            nameField: 'sys_name',
            displayName: 'Object'
        },
        {
            table: 'task',
            query: isStartsWithSearch ? `numberSTARTSWITH${cleanSearchValue}` : `number=${cleanSearchValue}`,
            fields: 'sys_id,number,short_description,state,sys_class_name,sys_updated_on',
            nameField: 'number',
            displayName: 'Task'
        },
        {
            table: 'sys_user',
            query: isStartsWithSearch ? `user_nameSTARTSWITH${cleanSearchValue}` : `user_name=${cleanSearchValue}`,
            fields: 'sys_id,user_name,name,email,active',
            nameField: 'user_name',
            displayName: 'User'
        },
        {
            table: 'sys_user_group',
            query: isStartsWithSearch ? `nameSTARTSWITH${cleanSearchValue}` : `name=${cleanSearchValue}`,
            fields: 'sys_id,name,description,active',
            nameField: 'name',
            displayName: 'Group'
        }
    ];

    // For backward compatibility, if searchType is 'objectName', only search sys_metadata
    const tablesToSearch = searchType === 'multiSearch' ? searchTables : [searchTables[0]];

    for (const searchConfig of tablesToSearch) {
        try {
            // Get the configured max search results limit
            const maxResults = await new Promise((resolve) => {
                storageAPI.local.get("useSync", (result1) => {
                    const useSync = result1.useSync === "true" || result1.useSync === true;
                    const storageArea = useSync ? storageAPI.sync : storageAPI.local;
                    storageArea.get("maxSearchResults", (result) => {
                        resolve(result.maxSearchResults || 20);
                    });
                });
            });

            const apiUrl = `${window.location.origin}/api/now/table/${searchConfig.table}?sysparm_query=${searchConfig.query}&sysparm_fields=${searchConfig.fields}&sysparm_limit=${maxResults}`;

            debugLog(`*SNOW TOOL BELT* Searching ${searchConfig.table} for exact match`);

            const response = await fetch(apiUrl, {
                credentials: "same-origin",
                headers: headers
            });

            if (response.ok && response.status === 200) {
                const data = await response.json();
                debugLog(`*SNOW TOOL BELT* Found ${data.result.length} results in ${searchConfig.table}`);

                if (data.result.length > 0) {
                    const results = [];
                    for (const record of data.result) {
                        let displayName;
                        let actualClass = searchConfig.table;

                        // Extract display name and class based on table type
                        if (searchConfig.table === 'sys_metadata') {
                            displayName = getDisplayName(record.sys_name) || getDisplayName(record.name);

                            // Get the actual class name from sys_class_name field (same logic as sys_id search)
                            actualClass = searchConfig.table; // fallback
                            if (record.sys_class_name) {
                                debugLog("*SNOW TOOL BELT* sys_class_name field:", record.sys_class_name, "type:", typeof record.sys_class_name);

                                // Handle both string and object formats
                                actualClass = typeof record.sys_class_name === 'string'
                                    ? record.sys_class_name
                                    : (record.sys_class_name.value || record.sys_class_name.display_value || searchConfig.table);
                            }
                            debugLog("*SNOW TOOL BELT* Final actualClass for object search:", actualClass);
                        } else if (searchConfig.table === 'task') {
                            displayName = getDisplayName(record.number);

                            // Get the actual class name from sys_class_name field for tasks
                            actualClass = searchConfig.table; // fallback
                            if (record.sys_class_name) {
                                debugLog("*SNOW TOOL BELT* task sys_class_name field:", record.sys_class_name, "type:", typeof record.sys_class_name);

                                // Handle both string and object formats
                                actualClass = typeof record.sys_class_name === 'string'
                                    ? record.sys_class_name
                                    : (record.sys_class_name.value || record.sys_class_name.display_value || searchConfig.table);
                            }
                            debugLog("*SNOW TOOL BELT* Final actualClass for task search:", actualClass);
                        } else if (searchConfig.table === 'sys_user') {
                            displayName = getDisplayName(record.name) || getDisplayName(record.user_name);
                            actualClass = searchConfig.table;
                        } else {
                            displayName = getDisplayName(record.name);
                            actualClass = searchConfig.table;
                        }

                        // Only add records with valid names
                        if (displayName && displayName.trim() !== '') {
                            results.push({
                                sys_id: record.sys_id,
                                name: displayName,
                                username: searchConfig.table === 'sys_user' ? getDisplayName(record.user_name) : undefined,
                                table: searchConfig.table,
                                sourceTable: searchConfig.table,
                                actualClass: actualClass,
                                directUrl: `https://${host}/${actualClass}.do?sys_id=${record.sys_id}`,
                                description: `${searchConfig.displayName} ${isStartsWithSearch ? 'starts with' : 'exact'} match`,
                                updated: record.sys_updated_on,
                                email: searchConfig.table === 'sys_user' ? getDisplayName(record.email) : undefined,
                                active: record.active,
                                // Task-specific fields
                                shortDescription: searchConfig.table === 'task' ? getDisplayName(record.short_description) : undefined,
                                state: searchConfig.table === 'task' ? record.state : undefined
                            });
                        }
                    }

                    if (results.length > 0) {
                        // Sort results by actual class name, then alphabetically by name
                        results.sort((a, b) => {
                            // First sort by actual class name
                            if (a.actualClass !== b.actualClass) {
                                return a.actualClass.localeCompare(b.actualClass);
                            }
                            // Then sort alphabetically by name
                            return a.name.localeCompare(b.name);
                        });

                        return {
                            status: 200,
                            searchValue: searchValue,
                            searchType: searchType,
                            results: results,
                            instance: host,
                            found: true,
                            totalResults: results.length,
                            searchedTable: searchConfig.table,
                            isStartsWithSearch: isStartsWithSearch,
                            hitLimit: data.result.length === maxResults // Flag when we hit the API limit
                        };
                    }
                }
            }
        } catch (error) {
            debugLog(`*SNOW TOOL BELT* Error searching ${searchConfig.table}:`, error);
            // Continue to next table on error
        }
    }

    // No results found in any table
    return {
        status: 404,
        searchValue: searchValue,
        searchType: searchType,
        displayValue: "No matches found",
        instance: host,
        found: false
    };
}

(function () {
    console.log("*SNOW TOOL BELT* Content script loaded on:", window.location.href);
    console.log("*SNOW TOOL BELT* Browser:", typeof browser !== "undefined" ? "Firefox" : "Chrome");

    // Firefox-specific: Add a delay to ensure background script is ready
    const initializeExtension = () => {
        // ask background script if this tab must be considered as a ServiceNow instance, and get the favicon color
        try {
            runtimeAPI.sendMessage({ 
                "command": "isServiceNow",
                "hostname": window.location.hostname,
                "url": window.location.href
            }, function (response) {
                console.log("*SNOW TOOL BELT* isServiceNow response:", response);
                if (runtimeAPI.lastError) {
                    console.error("*SNOW TOOL BELT* Runtime error:", runtimeAPI.lastError);
                    // Firefox fallback: if background script fails, check if this looks like ServiceNow
                    if (window.location.hostname.includes("service-now.com")) {
                        console.log("*SNOW TOOL BELT* Fallback: Detected ServiceNow domain, initializing...");
                        initScript({ isServiceNow: true, favIconColor: "", hidden: false });
                    }
                    return;
                }
                if (response === undefined || response.isServiceNow === false) {
                    console.log("*SNOW TOOL BELT* Not a ServiceNow instance, stopping now");
                } else {
                    console.log("*SNOW TOOL BELT* ServiceNow instance detected, initializing...");
                    initScript(response);
                    
                    // Phase 1: Report initial tab state to background script
                    setTimeout(async () => {
                        const tabInfo = getTabInfo();
                        
                        // Fetch update set information if g_ck is available
                        let updateSetInfo = null;
                        if (context.g_ck) {
                            try {
                                const concourseUrl = window.location.origin + "/api/now/ui/concoursepicker/updateset";
                                const headers = new Headers();
                                headers.append('Content-Type', 'application/json');
                                headers.append('Accept', 'application/json');
                                headers.append('Cache-Control', 'no-cache');
                                headers.append('X-UserToken', context.g_ck);
                                
                                const response = await fetch(concourseUrl, { headers: headers });
                                if (response.ok && response.status === 200) {
                                    const text = await response.text();
                                    const parsed = JSON.parse(text).result;
                                    updateSetInfo = {
                                        updateSet: parsed.updateSet,
                                        current: parsed.current
                                    };
                                    console.log("*SNOW TOOL BELT* Phase 1: Fetched update set:", updateSetInfo.current?.name);
                                }
                            } catch (error) {
                                console.log("*SNOW TOOL BELT* Phase 1: Could not fetch update set:", error);
                            }
                        }
                        
                        console.log("*SNOW TOOL BELT* Phase 1: Reporting tab state to background:", tabInfo);
                        runtimeAPI.sendMessage({
                            command: "reportTabState",
                            tabInfo: {
                                type: tabInfo.type,
                                details: tabInfo.details,
                                tabs: tabInfo.tabs,
                                updateSet: updateSetInfo,
                                timestamp: Date.now()
                            }
                        }, (response) => {
                            if (response && response.success) {
                                console.log("*SNOW TOOL BELT* Phase 1: Tab state reported successfully");
                            } else {
                                console.log("*SNOW TOOL BELT* Phase 1: Failed to report tab state", response);
                            }
                        });
                    }, 1000); // Wait 1 second for page to stabilize

                    // Monitor update set changes
                    setupUpdateSetMonitoring();

                    // Defining how to react to messages coming from the background script or the browser action
                    runtimeAPI.onMessage.addListener(function (request, sender, sendResponse) {
                        debugLog("*SNOW TOOL BELT* received message: " + JSON.stringify(request));
                        let instanceName = window.location.hostname;
                        let host = window.location.host;
                        let statsUrl = new Request(window.location.origin + "/stats.do");

                        if (request.command === "ping") {
                            /**
                             * Simple ping to check if content script is responsive
                             */
                            sendResponse({ status: "ok" });
                        } else if (request.command === "updateFavicon") {
                            /**
                            *  change Favicon color
                            */
                            updateFavicon(request.color);
                        } else if (request.command === "getTabInfo") {
                            /**
                             *  retrieve content informations
                             */
                            let response = getTabInfo();
                            sendResponse(response);
                        } else if (request.command === "execute-fieldnames") {
                            /**
                             *  switch fieldnames/labels
                             */
                            sendResponse(true);
                            switchFieldNames();
                        } else if (request.command === "getUpdateSet") {
                            // console.log("*SNOW TOOL BELT* getting update set informations");
                            if (!context.g_ck) {
                                sendResponse({ "updateSet": "", "current": "", "status": 200 });
                                return false;
                            }
                            let concourseUrl = new Request(window.location.origin + "/api/now/ui/concoursepicker/updateset");
                            let headers = new Headers();
                            headers.append('Content-Type', 'application/json');
                            headers.append('Accept', 'application/json');
                            headers.append('Cache-Control', 'no-cache');
                            headers.append('X-UserToken', context.g_ck);

                            // fetch(concourseUrl, {headers: headers})
                            fetch(concourseUrl, { headers: headers })
                                .then(function (response) {
                                    if (response.ok && response.status === 200) {
                                        return response.text().then(function (txt) {
                                            try {
                                                let parsed = JSON.parse(txt).result;
                                                sendResponse({ "updateSet": parsed.updateSet, "current": parsed.current, "status": 200 });
                                            } catch (e) {
                                                // console.log("*SNOW TOOL BELT* there was an error while parsing concourse API response, stopping now: " + e);
                                                sendResponse({ "updateSet": "", "current": "", "status": 200 });
                                            }
                                        });
                                    } else {
                                        // there was an error while fetching xmlstats, stop here
                                        // console.log("*SNOW TOOL BELT* there was an error while fetching concourse API, stopping now: " + response.status);
                                        sendResponse({ "updateset": "", "current": "", "status": response.status });
                                    }
                                });
                            return true;
                        } else if (request.command === "scanNodes") {
                            /**
                            *  scanNodes
                            */
                            debugLog("*SNOW TOOL BELT* Using this tab to search for nodes");
                            let nodes = [];
                            fetch(statsUrl, { credentials: "same-origin" })
                                .then(function (response) {
                                    if (response.ok && response.status === 200) {
                                        return response.text().then(function (text) {
                                            if (text === undefined || !text) {
                                                return false;
                                            }
                                            let current = getNameFromStatsPage(text);
                                            // console.log("*SNOW TOOL BELT* current: " + current);

                                            let xmlStatsURL = new Request("https://" + host + "/xmlstats.do");
                                            fetch(xmlStatsURL, { credentials: "same-origin" })
                                                .then(function (response) {
                                                    if (response.ok && response.status === 200) {
                                                        return response.text().then(function (txt) {
                                                            let parser = new DOMParser();
                                                            let xmlDoc = parser.parseFromString(txt, "text/xml");
                                                            let nodesList = xmlDoc.querySelectorAll("node system_id");
                                                            debugLog("*SNOW TOOL BELT* nodesList: ", nodesList);
                                                            nodesList.forEach(function (node) {
                                                                if (node.textContent.includes(":")) nodes.push(node.textContent.split(":")[1]);
                                                            });
                                                            debugLog("*SNOW TOOL BELT* nodes: ", nodes);
                                                            sendResponse({ "nodes": nodes, "current": current, "status": 200 });
                                                        });
                                                    } else {
                                                        // there was an error while fetching xmlstats, stop here
                                                        debugLog("*SNOW TOOL BELT* there was an error while fetching xmlstats, stopping now: " + response.status);
                                                        sendResponse({ "nodes": [], "current": "", "status": response.status });
                                                    }
                                                })
                                                .catch(function (err) {
                                                    debugLog("*SNOW TOOL BELT* there was an error while fetching xmlstats, stopping now");
                                                    debugLog(err);
                                                    sendResponse({ "nodes": [], "current": "", "status": 500 });
                                                });
                                        });
                                    } else {
                                        // there was an error with this first fetch, stop here
                                        debugLog("*SNOW TOOL BELT* there was an error with the first fetch, stopping now: " + response.status);
                                        sendResponse({ "nodes": [], "current": "", "status": response.status });
                                    }
                                })
                                .catch(function (err) {
                                    debugLog("*SNOW TOOL BELT* there was an error with the first scan, stopping now");
                                    debugLog(err);
                                    sendResponse({ "nodes": [], "current": "", "status": 500 });
                                });
                            return true;
                        } else if (request.command === "searchObject") {
                            /**
                             * Search for objects by sys_id or name
                             */
                            debugLog("*SNOW TOOL BELT* Searching for object:", request.searchValue, "Type:", request.searchType);

                            // Check if we have the authentication token
                            if (!context.g_ck) {
                                debugLog("*SNOW TOOL BELT* No authentication token available");
                                sendResponse({
                                    status: 401,
                                    searchValue: request.searchValue,
                                    searchType: request.searchType,
                                    table: "error",
                                    displayValue: "Authentication token not available",
                                    instance: request.instance || window.location.hostname,
                                    found: false
                                });
                                return true;
                            }

                            // Search based on type
                            if (request.searchType === 'number') {
                                // Number search - search sys_number first, then the actual table
                                searchByNumber(request.searchValue, host, context.g_ck)
                                    .then(function (searchResult) {
                                        sendResponse(searchResult);
                                    })
                                    .catch(function (error) {
                                        debugLog("*SNOW TOOL BELT* Error in number search:", error);
                                        const errorResponse = {
                                            status: 500,
                                            searchValue: request.searchValue,
                                            searchType: request.searchType,
                                            table: "error",
                                            displayValue: "Error: " + error.message,
                                            instance: request.instance || window.location.hostname,
                                            found: false
                                        };
                                        sendResponse(errorResponse);
                                    });
                            } else if (request.searchType === 'objectName' || request.searchType === 'multiSearch') {
                                // Object/multi search - search sys_metadata and other tables
                                searchByObjectName(request.searchValue, host, context.g_ck, request.searchType)
                                    .then(function (searchResult) {
                                        sendResponse(searchResult);
                                    })
                                    .catch(function (error) {
                                        debugLog("*SNOW TOOL BELT* Error in object search:", error);
                                        const errorResponse = {
                                            status: 500,
                                            searchValue: request.searchValue,
                                            searchType: request.searchType,
                                            table: "error",
                                            displayValue: "Error: " + error.message,
                                            instance: request.instance || window.location.hostname,
                                            found: false
                                        };
                                        sendResponse(errorResponse);
                                    });
                            } else if (request.searchType === 'sysId') {
                                // sys_id search - first try priority tables, then all tables if needed
                                searchSysIdWithPriority(request.searchValue, host, context.g_ck)
                                    .then(function (searchResult) {
                                        sendResponse(searchResult);
                                    })
                                    .catch(function (error) {
                                        debugLog("*SNOW TOOL BELT* Error in sys_id search:", error);
                                        const errorResponse = {
                                            status: 500,
                                            searchValue: request.searchValue,
                                            searchType: request.searchType,
                                            table: "error",
                                            displayValue: "Error: " + error.message,
                                            instance: request.instance || window.location.hostname,
                                            found: false
                                        };
                                        sendResponse(errorResponse);
                                    });
                            } else {
                                sendResponse({
                                    status: 400,
                                    searchValue: request.searchValue,
                                    searchType: request.searchType,
                                    table: "error",
                                    displayValue: "Invalid search type",
                                    instance: request.instance || window.location.hostname,
                                    found: false
                                });
                            }

                            return true;
                        } else if (request.command === "switchNode") {
                            /**
                            *  switchNode
                            */
                            debugLog("*SNOW TOOL BELT* using this tab to switch to node " + request.node);
                            let targetNode = request.node.toString();
                            let maxTries = 100;
                            let tries = 0;
                            let tryAgain = function () {
                                fetch(statsUrl, { credentials: "same-origin" })
                                    .then(function (response) {
                                        if (response.ok && response.status === 200) {
                                            return response.text();
                                        } else {
                                            // there was an error with this first fetch, stop here
                                            debugLog("*SNOW TOOL BELT* there was an error while trying to switch nodes, stopping now");
                                            sendResponse({ "status": response.status });
                                        }
                                    })
                                    .then(function (text) {
                                        let current = getNameFromStatsPage(text);
                                        debugLog("*SNOW TOOL BELT* node name: " + current);
                                        if (current === targetNode) {
                                            sendResponse({ "status": 200, "current": current });
                                        } else if (tries < maxTries) {
                                            tries++;
                                            // send the removeCookie command to background script, then try again
                                            runtimeAPI.sendMessage({ "command": "removeCookie", "instance": instanceName }, tryAgain);
                                        } else {
                                            debugLog("*SNOW TOOL BELT* maximum number of tries reached without success");
                                            sendResponse({ "status": 500, "message": "Maximum number of tries reached", "current": current });
                                        }
                                    });
                            };

                            fetch(statsUrl, { credentials: "same-origin" })
                                .then(function (response) {
                                    if (response.ok && response.status === 200) {
                                        return response.text();
                                    } else {
                                        // there was an error with this first fetch, stop here
                                        debugLog("*SNOW TOOL BELT* there was an error while trying to switch nodes, stopping now");
                                        sendResponse({ "status": response.status });
                                    }
                                })
                                .then(function (text) {
                                    let current = getNameFromStatsPage(text);
                                    if (current === targetNode) {
                                        debugLog("*SNOW TOOL BELT* teeeheee we are already on target node");
                                        sendResponse({ "status": 200, "current": current });
                                    } else {
                                        // send the removeCookie command to background script, then try again
                                        runtimeAPI.sendMessage({ "command": "removeCookie", "instance": instanceName }, tryAgain);
                                    }
                                });
                            return true;
                        }
                    });
                }
            });
        } catch (error) {
            console.error("*SNOW TOOL BELT* Content script error:", error);
            // Firefox fallback: if there's an error, check if this looks like ServiceNow
            if (window.location.hostname.includes("service-now.com")) {
                debugLog("*SNOW TOOL BELT* Error fallback: Detected ServiceNow domain, initializing...");
                initScript({ isServiceNow: true, favIconColor: "", hidden: false });
            }
        }
    };

    // Firefox-specific: Add delay for background script readiness
    if (typeof browser !== "undefined") {
        // Firefox: wait a bit for background script to be ready
        setTimeout(initializeExtension, 100);
    } else {
        // Chrome: initialize immediately
        initializeExtension();
    }
})();

/**
 * Tool Belt Console - Doom-style console for quick access to extension features
 */
(function() {
    let consoleElement = null;
    let consoleInput = null;
    let consoleResults = null;
    let isConsoleOpen = false;
    let searchHistory = [];
    let historyIndex = -1;
    
    /**
     * Creates the console HTML structure
     */
    const createConsole = () => {
        const console = document.createElement('div');
        console.id = 'sntb-console';
        console.className = 'sntb-console';
        console.innerHTML = `
            <div class="sntb-console-header">
                <span class="sntb-console-title">▸ ServiceNow Tool Belt Console</span>
                <span class="sntb-console-hint">ESC to close | ↑↓ for history</span>
            </div>
            <div class="sntb-console-input-container">
                <span class="sntb-console-prompt">></span>
                <input type="text" class="sntb-console-input" placeholder='Type "h" or "help" for a list of available commands' autofocus />
            </div>
            <div class="sntb-console-results"></div>
        `;
        
        // Inject minimal CSS
        const style = document.createElement('style');
        style.textContent = `
            .sntb-console {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background: linear-gradient(0deg, #1a1a1a 0%, #0d0d0d 100%);
                border-top: 3px solid #00ff00;
                box-shadow: 0 -4px 20px rgba(0, 255, 0, 0.3);
                z-index: 999999;
                font-family: 'Courier New', monospace;
                color: #00ff00;
                padding: 0;
                opacity: 0.95;
                transform: translateY(calc(100% + 30px));
                transition: transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                pointer-events: none;
            }
            
            .sntb-console.open {
                transform: translateY(0);
                pointer-events: auto;
            }
            
            .sntb-console-header {
                background: #000;
                padding: 8px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-top: 1px solid #00ff00;
            }
            
            .sntb-console-title {
                font-weight: bold;
                font-size: 14px;
                letter-spacing: 2px;
            }
            
            .sntb-console-hint {
                font-size: 11px;
                color: #00aa00;
            }
            
            .sntb-console-input-container {
                padding: 12px 16px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .sntb-console-prompt {
                font-size: 18px;
                font-weight: bold;
                color: #00ff00;
            }
            
            .sntb-console-input {
                flex: 1;
                background: transparent;
                border: none;
                color: #00ff00;
                font-family: 'Courier New', monospace;
                font-size: 16px;
                outline: none;
                caret-color: #00ff00;
            }
            
            .sntb-console-input::placeholder {
                color: #006600;
            }
            
            .sntb-console-results {
                height: 400px;
                overflow-y: auto;
                padding: 0 16px 16px 16px;
            }
            
            .sntb-console-result-group {
                margin: 8px 0;
            }
            
            .sntb-console-group-header {
                padding: 8px 12px;
                background: rgba(0, 255, 0, 0.1);
                border-left: 3px solid #00ff00;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: all 0.2s;
            }
            
            .sntb-console-group-header:hover {
                background: rgba(0, 255, 0, 0.2);
            }
            
            .sntb-console-group-toggle {
                font-size: 12px;
                color: #00ff00;
                width: 16px;
            }
            
            .sntb-console-group-title {
                font-size: 14px;
                font-weight: bold;
                color: #00ff00;
                flex: 1;
            }
            
            .sntb-console-group-count {
                font-size: 12px;
                color: #00aa00;
            }
            
            .sntb-console-group-content {
                padding-left: 24px;
            }
            
            .sntb-console-result-item {
                padding: 8px 12px;
                margin: 4px 0;
                background: rgba(0, 255, 0, 0.05);
                border-left: 3px solid #00ff00;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .sntb-console-result-item.grouped {
                border-left: 2px solid #00aa00;
                background: rgba(0, 255, 0, 0.03);
            }
            
            .sntb-console-result-item:hover {
                background: rgba(0, 255, 0, 0.15);
                border-left-width: 6px;
                padding-left: 9px;
            }
            
            .sntb-console-result-item.grouped:hover {
                border-left-width: 4px;
                padding-left: 10px;
            }
            
            .sntb-console-result-name {
                font-size: 14px;
                font-weight: bold;
            }
            
            .sntb-console-result-class {
                font-size: 12px;
                color: #00aa00;
                margin-left: 8px;
            }
            
            .sntb-console-loading {
                text-align: left;
                padding: 12px;
                color: #00aa00;
                animation: sntb-blink 1s infinite;
            }
            
            @keyframes sntb-blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
            }
            
            .sntb-console-error {
                color: #ff0000;
                padding: 12px;
                text-align: left;
            }
            
            .sntb-console-results::-webkit-scrollbar {
                width: 8px;
            }
            
            .sntb-console-results::-webkit-scrollbar-track {
                background: #000;
            }
            
            .sntb-console-results::-webkit-scrollbar-thumb {
                background: #00ff00;
                border-radius: 4px;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(console);
        
        return console;
    };
    
    /**
     * Toggles the console visibility
     */
    const toggleConsole = () => {
        if (!consoleElement) {
            consoleElement = createConsole();
            consoleInput = consoleElement.querySelector('.sntb-console-input');
            consoleResults = consoleElement.querySelector('.sntb-console-results');
            
            // Setup event listeners
            setupConsoleListeners();
        }
        
        isConsoleOpen = !isConsoleOpen;
        
        if (isConsoleOpen) {
            consoleElement.classList.add('open');
            consoleInput.focus();
            // Don't clear input or results - preserve state when reopening
        } else {
            consoleElement.classList.remove('open');
        }
    };
    
    /**
     * Setup console event listeners
     */
    const setupConsoleListeners = () => {
        // ESC to close
        consoleInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Escape') {
                toggleConsole();
            } else if (e.key === 'Enter') {
                await performConsoleSearch();
                consoleInput.value = ''; // Clear input after execution
            } else if (e.key === 'Tab') {
                e.preventDefault();
                handleTabComplete();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (historyIndex < searchHistory.length - 1) {
                    historyIndex++;
                    consoleInput.value = searchHistory[historyIndex];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (historyIndex > 0) {
                    historyIndex--;
                    consoleInput.value = searchHistory[historyIndex];
                } else if (historyIndex === 0) {
                    historyIndex = -1;
                    consoleInput.value = '';
                }
            }
        });
    };
    
    /**
     * Handle tab completion for commands
     */
    const handleTabComplete = () => {
        const input = consoleInput.value.trim();
        if (!input) return;
        
        const parts = input.split(/\s+/);
        const commandPart = parts[0].toLowerCase();
        
        // Only autocomplete if we're still on the command part (no spaces after)
        if (parts.length === 1 || (parts.length === 2 && input.endsWith(' '))) {
            // Only complete to full command labels (exclude shortcuts like 's', 'h', 'v', 'n', 'bg', 'st')
            const fullCommands = ['help', 'search', 'versions', 'names', 'background', 'stats'];
            const matches = fullCommands.filter(cmd => cmd.startsWith(commandPart));
            
            if (matches.length === 1) {
                // Single match - complete it
                consoleInput.value = matches[0] + ' ';
            } else if (matches.length > 1) {
                // Multiple matches - show them
                let html = '<div style="padding: 12px; line-height: 1.8;">';
                html += '<div style="font-weight: bold; margin-bottom: 8px;">▸ MATCHING COMMANDS:</div>';
                matches.forEach(cmd => {
                    html += `<div style="color: #00ff00; margin-left: 16px;">${cmd}</div>`;
                });
                html += '</div>';
                consoleResults.innerHTML = html;
            }
        }
    };
    
    /**
     * Available console commands
     */
    const commands = {
        help: {
            description: 'Show available commands',
            usage: 'help | h',
            execute: () => {
                let html = '<div style="padding: 12px; line-height: 1.6;">';
                html += '<div style="font-weight: bold; margin-bottom: 8px;">▸ AVAILABLE COMMANDS:</div>';
                
                // Only show main commands (not shortcuts)
                const mainCommands = ['help', 'search', 'versions', 'names', 'background', 'stats'];
                mainCommands.forEach(cmd => {
                    const command = commands[cmd];
                    // Escape HTML entities manually to preserve <term> display
                    const escapeHtml = (str) => {
                        return str.replace(/&/g, '&amp;')
                                  .replace(/</g, '&lt;')
                                  .replace(/>/g, '&gt;')
                                  .replace(/"/g, '&quot;')
                                  .replace(/'/g, '&#039;');
                    };
                    const safeUsage = escapeHtml(command.usage);
                    const safeDescription = escapeHtml(command.description);
                    html += `
                        <div style="margin-bottom: 4px;">
                            <span style="color: #00ff00; font-weight: bold;">${safeUsage}</span>
                            <span style="color: #006600; margin-left: 16px;">${safeDescription}</span>
                        </div>
                    `;
                });
                
                html += '</div>';
                consoleResults.innerHTML = html;
            }
        },
        h: {
            description: 'Alias for help',
            usage: 'h',
            execute: () => {
                commands.help.execute();
            }
        },
        search: {
            description: 'Search for records by sys_id, number, or name',
            usage: 'search <term> | s <term>',
            execute: async (args) => {
                const searchTerm = args.join(' ').trim();
                if (!searchTerm) {
                    consoleResults.innerHTML = '<div class="sntb-console-error">✖ USAGE: search &lt;term&gt;</div>';
                    return;
                }
                
                // Show loading
                consoleResults.innerHTML = '<div class="sntb-console-loading">▸ SEARCHING...</div>';
                
                // Determine search type
                const searchType = determineSearchType(searchTerm);
                
                if (searchType.type === 'invalid') {
                    consoleResults.innerHTML = '<div class="sntb-console-error">✖ INVALID SEARCH TERM: ' + (searchType.error || 'Unknown error') + '</div>';
                    return;
                }
                
                // Perform search
                try {
                    const result = await performSearch(searchType.type, searchType.value);
                    displayConsoleResults(result);
                } catch (error) {
                    consoleResults.innerHTML = '<div class="sntb-console-error">✖ SEARCH FAILED: ' + error.message + '</div>';
                }
            }
        },
        s: {
            description: 'Alias for search',
            usage: 's <term>',
            execute: async (args) => {
                await commands.search.execute(args);
            }
        },
        versions: {
            description: 'View versions of current object',
            usage: 'versions | v',
            execute: () => {
                // Send command to background script to open versions
                runtimeAPI.sendMessage({ "command": "execute-openversions" }, (response) => {
                    if (runtimeAPI.lastError) {
                        consoleResults.innerHTML = '<div class="sntb-console-error">✖ FAILED TO OPEN VERSIONS: ' + runtimeAPI.lastError.message + '</div>';
                    } else {
                        consoleResults.innerHTML = '<div style="padding: 12px; color: #00ff00;">✓ Versions window opened</div>';
                    }
                });
            }
        },
        v: {
            description: 'Alias for versions',
            usage: 'v',
            execute: () => {
                commands.versions.execute();
            }
        },
        names: {
            description: 'Toggle field names between labels and technical names',
            usage: 'names | n',
            execute: () => {
                try {
                    const result = switchFieldNames();
                    
                    // Check if the function returned an error (workspace detection)
                    if (result && !result.success) {
                        consoleResults.innerHTML = `<div style="padding: 12px; color: #ffaa00;">${result.message}</div>`;
                        return;
                    }
                    
                    const isNowTechnical = document.body.getAttribute("data-sntb-technical") === "true";
                    const mode = isNowTechnical ? "technical names" : "labels";
                    consoleResults.innerHTML = `<div style="padding: 12px; color: #00ff00;">✓ Switched to ${mode}</div>`;
                } catch (error) {
                    consoleResults.innerHTML = '<div class="sntb-console-error">✖ FAILED TO SWITCH FIELD NAMES: ' + error.message + '</div>';
                }
            }
        },
        n: {
            description: 'Alias for names',
            usage: 'n',
            execute: () => {
                commands.names.execute();
            }
        },
        background: {
            description: 'Open background script editor',
            usage: 'background | bg',
            execute: () => {
                // Send command to background script to open background script editor
                runtimeAPI.sendMessage({ "command": "execute-backgroundscript" }, (response) => {
                    if (runtimeAPI.lastError) {
                        consoleResults.innerHTML = '<div class="sntb-console-error">✖ FAILED TO OPEN BACKGROUND SCRIPT: ' + runtimeAPI.lastError.message + '</div>';
                    } else {
                        consoleResults.innerHTML = '<div style="padding: 12px; color: #00ff00;">✓ Background script window opened</div>';
                    }
                });
            }
        },
        chuck: {
            description: 'Display Chuck face',
            usage: 'chuck',
            execute: () => {
                consoleResults.innerHTML = '<div style="font-family: \'Courier New\', monospace;font-size: 6px; color: #00ff00;">' + atob("PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCj09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09DQo9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQ0KPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0tKysrKz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCi0tLS0tLT09PT09PT09PT09PT09PS09PT09PT09PT09PT09PT09PT09PT09PSsrPSsqKipAQEAlJSUlLT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09DQotLS0tLS0tLT09PT09LS0tLS0tLS0tLS0tLS0tLS0tLS0tPT09PT09PSsqPSo9KyMrIyMjJSUjJSMlJSU9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS09PT09KyMlJSMlKiMqIyUjIyMjKiMlIyUlJSMqJSMjPSMjPSs9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0jKiUlJSMlIyojIyMlIyojJSMlJSUjJSUlJSMjI0AjKyMjIz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09DQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0rKiUlJSMlIyMjIyUlJSUjIyMjJSUjIyUjQEBAJSNAIyMjIyMrPT0tLT0tPS0tLS0tLS0tPT09LT09LS0tLS0tLS0tLT09PT09PT0tPQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKiojJSUjKyUjIyUjJSMjIyoqKioqIyMqIyMqIyMjKyUlJSMjJSUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tPSsqIyVAJSUjIyMjIyoqPSsrKysrKysqKis9KysqKiojIyVAQEAlPS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS09IyVAJSUjKiorKisrLS0tLS0tLS0tLS0tLS0tLT09KiMqIyMjJSUlPT09LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS09JSMjJSMqKz09PT0tLS06Ojo6Oi06Oi0tLS0tLS0tLS09KiMqJUAlQCUlKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLT0qIyMjKisrPT09LS0tOjo6Ojo6Ojo6Ojo6Ojo6LTo6LS0tLT0rKiMjJSUlJS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS09KiUlKys9PS0tLS06Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6Oi0tLS0tPSsqIyMjI0AjLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSUlKj09PT0tLS0tOjo6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6LS0tLS0tKysrIyUlIyMtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0jIz09PT09LS0tLTotOjo6Ojo6Ojo6Ojo6Ojo6Ojo6OjotLS0tLT09KyojIyUjLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qIysrPT09PT0tLS0tLS06LS0tLTo6Ojo6Ojo6Ojo6Ojo6OjotLS0tKys9PSojJS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIyorKz09PT0tLS0tLS06Oi0tLS06Ojo6Ojo6Ojo6Ojo6Ojo6LS0tLT09PSsrKiMtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSorKys9PT09LS0tLS0tOjotLS0tOjo6Ojo6Ojo6Ojo6LTo6Oi0tLS0tPT0rKyojKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0jKysrPT09PS0tLS0tLS0tLS0tLTotOjo6LS0tPT09Ky06LS0tLS0tLT0rKysqKj0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS09IysrKz09LS09LS0tLS0tLS0tLS09KyoqKiMqKisqKiojIyUlJSMjJUBAK0AlIyorLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSorKisqKiorKiojIyMqKz0tLS0tKyojQCMrKysrKysrKysqK0BAQCojIyMlQCUjPS09Ky0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSNAQEAlIysrKysqKisqQEBAQEBAQEAqKisqIyoqIyMjJSUqKysrQD09KysrKio9LT0tPS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tPSVAJSoqIyoqKiMjKiojIyMjQEArPUBAPT0rKis9LS0tLS09LS0tLT0tLS0tPT09LT06Oi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tQCoqKiorKioqKio9PSsrKyU9LS0tQCstLT09Kz09PSstOjo6LSs6PS0tPSs9PS0lPS09PS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSsjKioqPT0rKz09KysrPSslPTotLS0jKy0tLS09PS0tLS06OjoqLS0tLS09PT09Kz09LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tJSorKys9LS0tPT09PT1AKz06LS0tPSojLS0tLS0tLTo6LSs9LTo6LS0tPT09PS09LT0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0jKys9Kz0tLS09PT0lKistOjotLTo6LSolIyMjIyMrPS0tLS0tLS0tPS09Ky0rLTotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSstKioqIyMjIyMjIz0rLTo6Oi06LT0qPT09PSoqKz09PS0tLS0tLS0tLSstLS09LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS09PQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qKisrPT0rKiorKiojJSorKysqKys9PT09LT09PSsqIys9PS0tLS09LT09Oi09LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS09PT0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKiorKysqKisqKyorKyojIyMqKis9PS0tLS09PT09PT0rPS0tLTotPT09PT0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tPT09DQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSoqKysqIyMrKiorKysrKys9PT09PT09PT0rKysrKz09PT0tLS0tLT09PSs6LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS09PQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS09KysrPSsqKioqIyUlKiMqKys9Oj0gOiA6Oi0lPT09PS0tLS0tLS09PT0rLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tPT0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSoqKz0tLSsrKyVAKystOi46LS0tLi4tOi09LS0tLS0tLS0tLT09PT0rKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS09DQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKysrPS0tPT0rKysrKysrKys9PS0tLS0tLS06LS0tLS0tLS0tPSsrKystLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tPQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tOj0rKystLS09PSorKysrPT09PT09LS09PS0tLS0tLS0tLS0tPSsrKz0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLT0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tOiorKz0tPT09KisrKz09LS0tPS0tLS0tLS0tLS0tLT09KysqKz09Oi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS09DQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKioqPT09PT09PT09PS0tLS0tLS0tLS0tLS09PT0rKyorKz09PTotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS06IyoqKysrKys9PT09PT0tLS0tLS09PT0rPSsqKisrKz09PT0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tOiMjIyMqKioqKisrKyoqKisrKysrKysrKioqKysrPT09PT09LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qIyojIyMjIyMjIyMjIyMjIyMjIyoqKysrKys9PT09PT09PS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKioqKiMjIyMjIyMjIyMjIyMjKiorPT09Kz09PS09LS09PSslOi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSoqKioqKiMjIyMjIyoqKioqKis9PT0tPT09PS0tPT09PT0lJSU6LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLTojIyoqKioqKioqKioqPT0rKz09PS0tPT09PT0tPS09PT0lJSUjKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0lQEAqIyoqKysqKioqKz09LS0tLS0tPT09PT0tLS09PSMlJSUlIyMtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tOislJSVAQEArKisrKysqKiorPS0tLT09PS09PT0tLS0tIyUlJSUlJSUlIyUlJSo6LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLToqJSUlJSUlQEBAJUAqKysrKysrKysrKys9LS0tLS0tLT0jJSUlJSUlJSUlIyMlJSUlJSUlKjotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS06JSUlJSUlJSUlQCVAQEBAJSUjKys9Kys9PT09PS0tLS0tLSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUtLS0tLS0tLS0tLS0tLS0tLS0tLS0NCi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS06KiUlJSUlJSUlQCUlJSouKi1AQEBAJSUlKisrPT09PT09PT0jJSUlJSUlJSUjIyMlJSUlJSUlQCUlJSUlJSUlJSUlIzotLS0tLS0tLS0tLS0tLS0tDQotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tOiMlJSUlJSUlQCUjJSUlJS09ICMjIyoqIyo9QCUlIyorPT0rKyUlJSUlJToqLiUlIy4jIyUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlOi0tLS0tLS0tLS0tLQ0KLS0tLS0tLS0tLS0tLS0tLS0tLS0tLTojJSUlJSUlJSUlJSUlJSUlQCUgIyMuKiUlKi4jICMjJSMlJTolJUAlJSUlLiMgIyUjIyMjLiMlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlIzotLS0tLS0tLS0NCi0tLS0tLS0tLS0tLS0tLS0tLToqJSUlJSUlJSUlJSUlJSUlJSUlJSUqIyMjIyM6Lj0gJSUjKisjLTo6IysjJSUtJSAjIyMuLiM6Oi4uJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUrLS0tLS0tDQotLS0tLS0tLS0tLS0tLS0tJSUlJSUlJSUlJSUlJSUlJUAlJSUlQCVAJS4tIy46IC0jIysqIy4rLiUgKkA6QCs9LislLSojJSsuPSAlIyUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlKi0tLQ0KLS0tLS0tLS0tLS0tLSMlJSUlJSUlJSUlJSVAJSUlJUBAQCUlQEBAQEAlIy4rICUrLSVAKyMuJUBAQEAqKiM6PSUlJSUlJTojICUlJSsjJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSoNCi0tLS0tLS0tLTojJSUlJUAlJSUlJSUlJSUlJSUlJSVAJUBAQEBAQEBAKi0gKiMjIyMjOjo6KkBAQEBAQEBAQEBAJUAlPSUgJSU9JSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlDQotLS0tLS0tKiUlJUAlJSUlJSUlJSUlJUBAJSUlJSUlQCVAQEBAJUBAQEAgIyotIyUtJUBAQEBAJSUlJSUlQCVAQEBAQEBAIyUlJSUtLUAlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJQ0KLS0tLS0qJUBAJSUlJSUlJSUlJSUlJUBAJSUlJSUlQEAlQEBAQEBAQEBAQCVAQEBAQEBAQEBAQCUlJSUlJSUlJUBAQEBAQEBAQCVAOiVAJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUNCi0tLS0jJSVAQCUlJUAlJSUlJSUlJSVAJSUlJSUlJSUlJUBAQEBAQEBAQEBAQEBAQEBAQEBAQEAlJSUlJSUlJSVAJSUlQEBAJUBAJUBAJSUlJSUlJSUlJSUlJSUlJSUlJSUlJUAlJSUlJSUlJSUlJSUlDQotLS1AJUBAQCUlJSUlJSUlJSUlJSVAJSUlJSUlJSUlJSUlJUBAQCUlJSUlQEBAQEBAJUBAQEBAJSUlJSUlJSUlQCUlQEBAJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSVAJSUlJSUlJSUlJSUlJQ0KLS1AJUBAQCUlJSUlJSUlJSUlJUAlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSVAQEBAQEAlJSVAQCUlJSUlJSUlJUBAJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlQCUlQEAlJSUlJUAlJSUNCg==").replaceAll("\r\n","<br/>") + '</div>';
            }
        },
        bg: {
            description: 'Alias for background',
            usage: 'bg',
            execute: () => {
                commands.background.execute();
            }
        },
        stats: {
            description: 'Show instance statistics summary',
            usage: 'stats | st',
            execute: async () => {
                try {
                    consoleResults.innerHTML = '<div class="sntb-console-loading">▸ FETCHING STATS...</div>';
                    
                    const statsUrl = window.location.origin + '/stats.do';
                    const response = await fetch(statsUrl);
                    const text = await response.text();
                    
                    // Parse HTML and extract text content
                    // Parse the HTML first to get the db_connections span
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(text, 'text/html');
                    
                    // Replace <br> tags with newlines for text extraction
                    const textWithNewlines = text.replace(/<br\s*\/?>/gi, '\n');
                    const statsText = textWithNewlines.replace(/<[^>]+>/g, '');
                    
                    // Extract key metrics - looking for patterns like "Build name: Yokohama"
                    const nodeMatch = statsText.match(/Connected to cluster node:\s*([^\n]+)/);
                    const buildNameMatch = statsText.match(/Build name:\s*([^\n]+)/);
                    const buildDateMatch = statsText.match(/Build date:\s*([^\n]+)/);
                    const buildTagMatch = statsText.match(/Build tag:\s*([^\n]+)/);
                    const instanceNameMatch = statsText.match(/Instance name:\s*([^\n]+)/);
                    const midBuildstampMatch = statsText.match(/MID buildstamp:\s*([^\n]+)/);
                    const runLevelMatch = statsText.match(/Current Run Level:\s*([^\n]+)/);
                    const maxConcurrencyMatch = statsText.match(/Maximum session concurrency:\s*(\d+)/);
                    const loggedInMatch = statsText.match(/Logged in sessions:\s*(\d+)/);
                    const sessionTimeoutMatch = statsText.match(/Session timeout:\s*([^\n]+)/);
                    
                    const nodeName = nodeMatch ? nodeMatch[1].trim() : 'Unknown';
                    const buildName = buildNameMatch ? buildNameMatch[1].trim() : 'Unknown';
                    const buildDate = buildDateMatch ? buildDateMatch[1].trim() : 'Unknown';
                    const buildTag = buildTagMatch ? buildTagMatch[1].trim() : 'Unknown';
                    const instanceName = instanceNameMatch ? instanceNameMatch[1].trim() : 'Unknown';
                    const midBuildstamp = midBuildstampMatch ? midBuildstampMatch[1].trim() : 'Unknown';
                    const runLevel = runLevelMatch ? runLevelMatch[1].trim() : 'Unknown';
                    const maxConcurrency = maxConcurrencyMatch ? maxConcurrencyMatch[1].trim() : 'Unknown';
                    const loggedIn = loggedInMatch ? loggedInMatch[1].trim() : 'Unknown';
                    const sessionTimeout = sessionTimeoutMatch ? sessionTimeoutMatch[1].trim() : 'Unknown';
                    
                    // Extract db_connections span content for all prefixes
                    const dbConnectionsSpan = doc.getElementById('db_connections');
                    const dbPrefixes = [];
                    
                    if (dbConnectionsSpan) {
                        // Replace <br> with newlines in the span content
                        const dbHtml = dbConnectionsSpan.innerHTML.replace(/<br\s*\/?>/gi, '\n');
                        const dbText = dbHtml.replace(/<[^>]+>/g, '');
                        
                        // Extract all prefix sections (match "\nPrefix: <name>" followed by content until next "\nPrefix:" or end)
                        const prefixRegex = /\nPrefix:\s*([^\n]+)([\s\S]*?)(?=\nPrefix:|$)/g;
                        let match;
                        
                        while ((match = prefixRegex.exec(dbText)) !== null) {
                            const prefixName = match[1].trim();
                            const prefixText = match[2];
                            
                            const dbNameMatch = prefixText.match(/DB Name:\s*([^\n]+)/);
                            const dbStatusMatch = prefixText.match(/Status:\s*([^\n]+)/);
                            const dbBusyMatch = prefixText.match(/Busy:\s*(\d+)/);
                            const dbClosedMatch = prefixText.match(/Closed:\s*(\d+)/);
                            const dbAvailableMatch = prefixText.match(/Available:\s*(\d+)/);
                            const dbSharedMatch = prefixText.match(/Shared:\s*(\d+)/);
                            const dbSharedBusyMatch = prefixText.match(/SharedBusy:\s*(\d+)/);
                            const dbTotalMatch = prefixText.match(/Total:\s*(\d+)/);
                            const dbMaxMatch = prefixText.match(/Max:\s*(\d+)/);
                            
                            dbPrefixes.push({
                                prefix: prefixName,
                                dbName: dbNameMatch ? dbNameMatch[1].trim() : 'Unknown',
                                status: dbStatusMatch ? dbStatusMatch[1].trim() : 'Unknown',
                                busy: dbBusyMatch ? dbBusyMatch[1] : 'Unknown',
                                closed: dbClosedMatch ? dbClosedMatch[1] : 'Unknown',
                                available: dbAvailableMatch ? dbAvailableMatch[1] : 'Unknown',
                                shared: dbSharedMatch ? dbSharedMatch[1] : 'Unknown',
                                sharedBusy: dbSharedBusyMatch ? dbSharedBusyMatch[1] : 'Unknown',
                                total: dbTotalMatch ? dbTotalMatch[1] : 'Unknown',
                                max: dbMaxMatch ? dbMaxMatch[1] : 'Unknown'
                            });
                        }
                    }
                    
                    // Escape HTML to prevent rendering issues
                    const escapeHtml = (str) => {
                        return str.replace(/&/g, '&amp;')
                                  .replace(/</g, '&lt;')
                                  .replace(/>/g, '&gt;')
                                  .replace(/"/g, '&quot;')
                                  .replace(/'/g, '&#039;');
                    };
                    
                    let html = '<div style="padding: 12px; line-height: 1.8; font-size: 13px;">';
                    html += '<div style="font-weight: bold; margin-bottom: 12px; color: #00ff00;">▸ INSTANCE STATISTICS</div>';
                    html += `<div style="color: #00aa00; margin-bottom: 4px;">Connected to cluster node: <span style="color: #00ff00;">${escapeHtml(nodeName)}</span></div>`;
                    html += `<div style="color: #00aa00; margin-bottom: 4px;">Build name: <span style="color: #00ff00;">${escapeHtml(buildName)}</span></div>`;
                    html += `<div style="color: #00aa00; margin-bottom: 4px;">Build date: <span style="color: #00ff00;">${escapeHtml(buildDate)}</span></div>`;
                    html += `<div style="color: #00aa00; margin-bottom: 4px;">Build tag: <span style="color: #00ff00;">${escapeHtml(buildTag)}</span></div>`;
                    html += `<div style="color: #00aa00; margin-bottom: 4px;">Instance name: <span style="color: #00ff00;">${escapeHtml(instanceName)}</span></div>`;
                    html += `<div style="color: #00aa00; margin-bottom: 4px;">MID buildstamp: <span style="color: #00ff00;">${escapeHtml(midBuildstamp)}</span></div>`;
                    html += `<div style="color: #00aa00; margin-bottom: 4px;">Current Run Level: <span style="color: #00ff00;">${escapeHtml(runLevel)}</span></div>`;
                    html += `<div style="color: #00aa00; margin-bottom: 4px;">Maximum session concurrency: <span style="color: #00ff00;">${escapeHtml(maxConcurrency)}</span></div>`;
                    html += `<div style="color: #00aa00; margin-bottom: 4px;">Logged in sessions: <span style="color: #00ff00;">${escapeHtml(loggedIn)}</span></div>`;
                    html += `<div style="color: #00aa00; margin-bottom: 4px;">Session timeout: <span style="color: #00ff00;">${escapeHtml(sessionTimeout)}</span></div>`;
                    
                    html += '<div style="font-weight: bold; margin-top: 16px; margin-bottom: 8px; color: #00ff00;">▸ DATABASE CONNECTIONS</div>';
                    
                    // Display each database prefix in its own table
                    for (const prefix of dbPrefixes) {
                        html += `<div style="color: #00aa00; margin-top: 12px; margin-bottom: 4px; font-weight: bold;">Prefix: ${escapeHtml(prefix.prefix)}</div>`;
                        html += `<div style="color: #00aa00; margin-bottom: 4px; font-size: 11px;">DB Name: <span style="color: #00ff00;">${escapeHtml(prefix.dbName)}</span> | Status: <span style="color: #00ff00;">${escapeHtml(prefix.status)}</span></div>`;
                        
                        // Transposed horizontal table for database metrics
                        html += '<table style="border-collapse: collapse; margin-top: 4px; font-size: 11px; width: 100%;">';
                        html += '<tr style="background-color: #1a1a1a;">';
                        html += '<th style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">Busy</th>';
                        html += '<th style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">Closed</th>';
                        html += '<th style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">Available</th>';
                        html += '<th style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">Shared</th>';
                        html += '<th style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">SharedBusy</th>';
                        html += '<th style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">Total</th>';
                        html += '<th style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">Max</th>';
                        html += '</tr>';
                        html += '<tr>';
                        html += `<td style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">${escapeHtml(prefix.busy)}</td>`;
                        html += `<td style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">${escapeHtml(prefix.closed)}</td>`;
                        html += `<td style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">${escapeHtml(prefix.available)}</td>`;
                        html += `<td style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">${escapeHtml(prefix.shared)}</td>`;
                        html += `<td style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">${escapeHtml(prefix.sharedBusy)}</td>`;
                        html += `<td style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">${escapeHtml(prefix.total)}</td>`;
                        html += `<td style="border: 1px solid #00aa00; padding: 4px 8px; color: #00ff00; text-align: center;">${escapeHtml(prefix.max)}</td>`;
                        html += '</tr>';
                        html += '</table>';
                    }
                    
                    // Extract response times for both 5 and 60 minute windows
                    // Pattern: "X transactions, Y per minute, 90% faster than Z"
                    const extractTransactions = (text, type, window) => {
                        // Match the section header, then look for the specific minute line
                        // Each time window is on its own line
                        const regex = new RegExp(`${type}[\\s\\S]*?\\n${window} minute:\\s*[^\\(]+\\((\\d+)\\s+transactions,\\s+([\\d.]+)\\s+per minute,\\s+(\\d+)%\\s+faster than\\s+([^\\)]+)`);
                        const match = text.match(regex);
                        return match ? { count: match[1], perMin: match[2], fasterPercent: match[3], fasterThan: match[4] } : null;
                    };
                    
                    const responseTypes = [
                        { name: 'Server', pattern: 'Server Response Time' },
                        { name: 'Client', pattern: 'Client Response Time' },
                        { name: 'All Transactions', pattern: 'All Transactions Response Time' },
                        { name: 'User Initiated', pattern: 'User Initiated Response Time' },
                        { name: 'Background', pattern: 'Background Response Time' }
                    ];
                    
                    html += '<div style="font-weight: bold; margin-top: 16px; margin-bottom: 8px; color: #00ff00;">▸ RESPONSE TIMES</div>';
                    html += '<table style="border-collapse: collapse; margin-top: 8px; font-size: 11px; width: 100%;">';
                    html += '<tr style="background-color: #1a1a1a;">';
                    html += '<th style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: left;">Type</th>';
                    html += '<th style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: center;">5m count</th>';
                    html += '<th style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: center;">5m/min</th>';
                    html += '<th style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: center;">5m faster</th>';
                    html += '<th style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: center;">60m count</th>';
                    html += '<th style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: center;">60m/min</th>';
                    html += '<th style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: center;">60m faster</th>';
                    html += '</tr>';
                    
                    for (const type of responseTypes) {
                        const data5 = extractTransactions(statsText, type.pattern, '5');
                        const data60 = extractTransactions(statsText, type.pattern, '60');
                        
                        if (data5 || data60) {
                            html += '<tr>';
                            html += `<td style="border: 1px solid #00aa00; padding: 6px 8px; color: #00aa00;">${escapeHtml(type.name)}</td>`;
                            html += `<td style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: center;">${data5 ? escapeHtml(data5.count) : '-'}</td>`;
                            html += `<td style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: center;">${data5 ? escapeHtml(data5.perMin) : '-'}</td>`;
                            html += `<td style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: center; font-size: 10px;">${data5 ? escapeHtml(data5.fasterPercent) + '% (' + escapeHtml(data5.fasterThan) + ')' : '-'}</td>`;
                            html += `<td style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: center;">${data60 ? escapeHtml(data60.count) : '-'}</td>`;
                            html += `<td style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: center;">${data60 ? escapeHtml(data60.perMin) : '-'}</td>`;
                            html += `<td style="border: 1px solid #00aa00; padding: 6px 8px; color: #00ff00; text-align: center; font-size: 10px;">${data60 ? escapeHtml(data60.fasterPercent) + '% (' + escapeHtml(data60.fasterThan) + ')' : '-'}</td>`;
                            html += '</tr>';
                        }
                    }
                    
                    html += '</table>';
                    html += '</div>';
                    
                    consoleResults.innerHTML = html;
                } catch (error) {
                    consoleResults.innerHTML = '<div class="sntb-console-error">✖ Failed to fetch stats: ' + error.message + '</div>';
                }
            }
        },
        st: {
            description: 'Alias for stats',
            usage: 'st',
            execute: async () => {
                await commands.stats.execute();
            }
        }
    };
    
    /**
     * Parses and executes console command
     */
    const performConsoleSearch = async () => {
        const input = consoleInput.value.trim();
        if (!input) return;
        
        // Add to history
        searchHistory.unshift(input);
        if (searchHistory.length > 10) searchHistory.pop();
        historyIndex = -1;
        
        // Parse command and arguments
        const parts = input.split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        // Execute command
        if (commands[command]) {
            await commands[command].execute(args);
        } else {
            // Show error message and help
            const escapeHtml = (str) => {
                return str.replace(/&/g, '&amp;')
                          .replace(/</g, '&lt;')
                          .replace(/>/g, '&gt;')
                          .replace(/"/g, '&quot;')
                          .replace(/'/g, '&#039;');
            };
            
            let html = `
                <div class="sntb-console-error" style="margin-bottom: 12px;">
                    ✖ Unknown command: ${escapeHtml(command)}
                </div>
            `;
            
            // Add help content
            html += '<div style="padding: 12px; line-height: 1.6;">';
            html += '<div style="font-weight: bold; margin-bottom: 8px;">▸ AVAILABLE COMMANDS:</div>';
            
            const mainCommands = ['help', 'search', 'versions', 'names', 'background', 'stats'];
            mainCommands.forEach(cmd => {
                const cmdObj = commands[cmd];
                const safeUsage = escapeHtml(cmdObj.usage);
                const safeDescription = escapeHtml(cmdObj.description);
                html += `
                    <div style="margin-bottom: 4px;">
                        <span style="color: #00ff00; font-weight: bold;">${safeUsage}</span>
                        <span style="color: #006600; margin-left: 16px;">${safeDescription}</span>
                    </div>
                `;
            });
            
            html += '</div>';
            consoleResults.innerHTML = html;
        }
    };
    
    /**
     * Determine search type (same logic as popup)
     */
    const determineSearchType = (input) => {
        if (input.length === 32 && /^[a-fA-F0-9]{32}$/.test(input)) {
            return { type: 'sysId', value: input };
        } else if (/^[A-Za-z]+\d+$/.test(input)) {
            return { type: 'number', value: input };
        } else {
            const isStartsWith = input.endsWith('*');
            if (isStartsWith && input.slice(0, -1).length < 5) {
                return { type: 'invalid', error: 'Wildcard requires 5+ chars' };
            }
            return { type: 'multiSearch', value: input, isStartsWith };
        }
    };
    
    /**
     * Perform search using content script functions
     */
    const performSearch = async (searchType, searchValue) => {
        if (!context.g_ck) {
            throw new Error('Not authenticated');
        }
        
        const host = window.location.hostname;
        
        if (searchType === 'sysId') {
            return await searchSysIdWithPriority(searchValue, host, context.g_ck);
        } else if (searchType === 'number') {
            return await searchByNumber(searchValue, host, context.g_ck);
        } else {
            return await searchByObjectName(searchValue, host, context.g_ck, 'multiSearch');
        }
    };
    
    /**
     * Display search results in console
     */
    const displayConsoleResults = (result) => {
        if (!result) {
            consoleResults.innerHTML = '<div class="sntb-console-error">✖ NO RESULT RETURNED</div>';
            return;
        }
        
        // Handle different result structures
        let results = [];
        
        if (result.results && Array.isArray(result.results)) {
            // Multi-result format
            results = result.results;
        } else if (result.status === 200 && result.directUrl) {
            // Single result format (sys_id search)
            results = [{
                name: result.displayName || result.name || result.searchValue,
                displayName: result.displayName || result.name,
                actualClass: result.actualClass || result.table,
                table: result.table,
                directUrl: result.directUrl,
                value: result.searchValue
            }];
        }
        
        if (results.length === 0) {
            consoleResults.innerHTML = '<div class="sntb-console-error">✖ NO RESULTS FOUND</div>';
            return;
        }
        
        // Group results by actual class name
        const groupedResults = {};
        results.forEach(item => {
            const classKey = item.actualClass || item.table || 'unknown';
            if (!groupedResults[classKey]) {
                groupedResults[classKey] = [];
            }
            groupedResults[classKey].push(item);
        });
        
        // Sort class names alphabetically
        const classNames = Object.keys(groupedResults).sort();
        const hasMultipleClasses = classNames.length > 1;
        
        let html = '';
        
        if (hasMultipleClasses) {
            // Multiple classes - show grouped results with expand/collapse
            classNames.forEach(className => {
                const classResults = groupedResults[className];
                // Sort results within each class alphabetically by name
                classResults.sort((a, b) => {
                    const nameA = a.displayName || a.name || a.value || '';
                    const nameB = b.displayName || b.name || b.value || '';
                    return nameA.localeCompare(nameB);
                });
                
                const groupId = `console-group-${className.replace(/[^a-zA-Z0-9]/g, '-')}`;
                const isExpanded = classResults.length <= 3; // Auto-expand small groups
                const safeClassName = DOMPurify.sanitize(className);
                
                html += `
                    <div class="sntb-console-result-group">
                        <div class="sntb-console-group-header" data-group="${groupId}">
                            <span class="sntb-console-group-toggle">${isExpanded ? '▼' : '▶'}</span>
                            <span class="sntb-console-group-title">${safeClassName}</span>
                            <span class="sntb-console-group-count">(${classResults.length})</span>
                        </div>
                        <div class="sntb-console-group-content" id="${groupId}" style="display: ${isExpanded ? 'block' : 'none'};">
                `;
                
                classResults.forEach(item => {
                    const name = item.name || item.displayName || item.value || 'Unknown';
                    const url = item.directUrl || '#';
                    const safeName = DOMPurify.sanitize(name);
                    const safeUrl = DOMPurify.sanitize(url);
                    const safeClassName = DOMPurify.sanitize(className);
                    html += `
                        <div class="sntb-console-result-item grouped" data-url="${safeUrl}">
                            <span class="sntb-console-result-name">${safeName}</span>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            });
        } else {
            // Single class - show flat list
            const className = classNames[0];
            const classResults = groupedResults[className];
            // Sort results alphabetically by name
            classResults.sort((a, b) => {
                const nameA = a.displayName || a.name || a.value || '';
                const nameB = b.displayName || b.name || b.value || '';
                return nameA.localeCompare(nameB);
            });
            
            classResults.forEach(item => {
                const name = item.name || item.displayName || item.value || 'Unknown';
                const classToDisplay = item.actualClass || item.table || 'Unknown';
                const url = item.directUrl || '#';
                const safeName = DOMPurify.sanitize(name);
                const safeClass = DOMPurify.sanitize(classToDisplay);
                const safeUrl = DOMPurify.sanitize(url);
                html += `
                    <div class="sntb-console-result-item" data-url="${safeUrl}">
                        <span class="sntb-console-result-name">${safeName}</span>
                        <span class="sntb-console-result-class">[${safeClass}]</span>
                    </div>
                `;
            });
        }
        
        consoleResults.innerHTML = html;
        
        // Add click handlers for results
        consoleResults.querySelectorAll('.sntb-console-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const url = item.getAttribute('data-url');
                window.open(url, '_blank');
                // Don't close console - keep results visible for multiple clicks
            });
        });
        
        // Add click handlers for group headers (expand/collapse)
        consoleResults.querySelectorAll('.sntb-console-group-header').forEach(header => {
            header.addEventListener('click', () => {
                const groupId = header.getAttribute('data-group');
                const content = document.getElementById(groupId);
                const toggle = header.querySelector('.sntb-console-group-toggle');
                
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    toggle.textContent = '▼';
                } else {
                    content.style.display = 'none';
                    toggle.textContent = '▶';
                }
            });
        });
    };
    
    // Listen for toggle command from background
    runtimeAPI.onMessage.addListener((request, sender, sendResponse) => {
        if (request.command === 'toggleConsole') {
            toggleConsole();
            sendResponse({ success: true });
        }
    });
    
    console.log("*SNOW TOOL BELT* Console initialized (Ctrl+Shift+K)");
})();

