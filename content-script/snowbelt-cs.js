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
            const childEl = el.querySelector("span a");
            if (childEl) {
                const currentText = childEl.innerText;
                const glideField = el.getAttribute("glide_field");
                const glideLabel = el.getAttribute("glide_label");

                debugLog(`*SNOW TOOL BELT* List element ${index + 1}:`, {
                    currentText,
                    glideField,
                    glideLabel,
                    element: el.outerHTML.substring(0, 100)
                });

                if (isCurrentlyTechnical && glideLabel) {
                    // Currently showing technical name, switch back to label
                    childEl.innerText = glideLabel;
                    debugLog(`*SNOW TOOL BELT* List: Restored "${glideLabel}" from technical name`);
                } else if (!isCurrentlyTechnical && glideField) {
                    // Currently showing label, switch to technical
                    childEl.innerText = glideField;
                    debugLog(`*SNOW TOOL BELT* List: Switched to technical "${glideField}"`);
                }
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
                const forAttr = el.getAttribute("for");

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
                    const technicalName = forAttr.replace("sys_display.", "").replace("select_0", "");

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
    debugLog("*SNOW TOOL BELT* Processing modern workspace elements...");

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
        context.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = "source-in";

        context.fillStyle = color;
        context.fillRect(0, 0, 256, 256);

        link.href = canvas.toDataURL();
        link.type = "image/x-icon";
    };
    img.src = faviconUrl;
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
    debugLog("*SNOW TOOL BELT* Content script loaded on:", window.location.href);
    debugLog("*SNOW TOOL BELT* Browser:", typeof browser !== "undefined" ? "Firefox" : "Chrome");

    // Firefox-specific: Add a delay to ensure background script is ready
    const initializeExtension = () => {
        // ask background script if this tab must be considered as a ServiceNow instance, and get the favicon color
        try {
            runtimeAPI.sendMessage({ "command": "isServiceNow" }, function (response) {
                debugLog("*SNOW TOOL BELT* isServiceNow response:", response);
                if (runtimeAPI.lastError) {
                    console.error("*SNOW TOOL BELT* Runtime error:", runtimeAPI.lastError);
                    // Firefox fallback: if background script fails, check if this looks like ServiceNow
                    if (window.location.hostname.includes("service-now.com")) {
                        debugLog("*SNOW TOOL BELT* Fallback: Detected ServiceNow domain, initializing...");
                        initScript({ isServiceNow: true, favIconColor: "", hidden: false });
                    }
                    return;
                }
                if (response === undefined || response.isServiceNow === false) {
                    debugLog("*SNOW TOOL BELT* Not a ServiceNow instance, stopping now");
                } else {
                    debugLog("*SNOW TOOL BELT* ServiceNow instance detected, initializing...");
                    initScript(response);

                    // Defining how to react to messages coming from the background script or the browser action
                    runtimeAPI.onMessage.addListener(function (request, sender, sendResponse) {
                        debugLog("*SNOW TOOL BELT* received message: " + JSON.stringify(request));
                        let instanceName = window.location.hostname;
                        let host = window.location.host;
                        let statsUrl = new Request(window.location.origin + "/stats.do");

                        if (request.command === "updateFavicon") {
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
                            if (request.searchType === 'objectName' || request.searchType === 'multiSearch') {
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

