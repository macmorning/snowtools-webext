/* https://github.com/fregante/content-scripts-register-polyfill @ v2.1.0 */

(function () {
	'use strict';

	function NestedProxy(target) {
		return new Proxy(target, {
			get(target, prop) {
				if (typeof target[prop] !== 'function') {
					return new NestedProxy(target[prop]);
				}
				return (...arguments_) =>
					new Promise((resolve, reject) => {
						target[prop](...arguments_, result => {
							if (chrome.runtime.lastError) {
								reject(new Error(chrome.runtime.lastError.message));
							} else {
								resolve(result);
							}
						});
					});
			}
		});
	}
	const chromeP =
		typeof window === 'object' &&
		(window.browser || new NestedProxy(window.chrome));

	const patternValidationRegex = /^(https?|wss?|file|ftp|\*):\/\/(\*|\*\.[^*/]+|[^*/]+)\/.*$|^file:\/\/\/.*$|^resource:\/\/(\*|\*\.[^*/]+|[^*/]+)\/.*$|^about:/;
	const isFirefox = typeof navigator === 'object' && navigator.userAgent.includes('Firefox/');
	function getRawRegex(matchPattern) {
	    if (!patternValidationRegex.test(matchPattern)) {
	        throw new Error(matchPattern + ' is an invalid pattern, it must match ' + String(patternValidationRegex));
	    }
	    let [, protocol, host, pathname] = matchPattern.split(/(^[^:]+:[/][/])([^/]+)?/);
	    protocol = protocol
	        .replace('*', isFirefox ? '(https?|wss?)' : 'https?')
	        .replace(/[/]/g, '[/]');
	    host = (host !== null && host !== void 0 ? host : '')
	        .replace(/^[*][.]/, '([^/]+.)*')
	        .replace(/^[*]$/, '[^/]+')
	        .replace(/[.]/g, '[.]')
	        .replace(/[*]$/g, '[^.]+');
	    pathname = pathname
	        .replace(/[/]/g, '[/]')
	        .replace(/[.]/g, '[.]')
	        .replace(/[*]/g, '.*');
	    return '^' + protocol + host + '(' + pathname + ')?$';
	}
	function patternToRegex(...matchPatterns) {
	    if (matchPatterns.includes('<all_urls>')) {
	        return /^(https?|file|ftp):[/]+/;
	    }
	    return new RegExp(matchPatterns.map(getRawRegex).join('|'));
	}

	async function isOriginPermitted(url) {
	    return chromeP.permissions.contains({
	        origins: [new URL(url).origin + '/*']
	    });
	}
	async function wasPreviouslyLoaded(tabId, loadCheck) {
	    const result = await chromeP.tabs.executeScript(tabId, {
	        code: loadCheck,
	        runAt: 'document_start'
	    });
	    return result === null || result === void 0 ? void 0 : result[0];
	}
	if (typeof chrome === 'object' && !chrome.contentScripts) {
	    chrome.contentScripts = {
	        async register(contentScriptOptions, callback) {
	            const { js = [], css = [], allFrames, matchAboutBlank, matches, runAt } = contentScriptOptions;
	            const loadCheck = `document[${JSON.stringify(JSON.stringify({ js, css }))}]`;
	            const matchesRegex = patternToRegex(...matches);
	            const listener = async (tabId, _,
	            { url }) => {
	                if (!url ||
	                    !matchesRegex.test(url) ||
	                    !await isOriginPermitted(url) ||
	                    await wasPreviouslyLoaded(tabId, loadCheck)
	                ) {
	                    return;
	                }
	                for (const file of css) {
	                    chrome.tabs.insertCSS(tabId, {
	                        ...file,
	                        matchAboutBlank,
	                        allFrames,
	                        runAt: runAt !== null && runAt !== void 0 ? runAt : 'document_start'
	                    });
	                }
	                for (const file of js) {
	                    chrome.tabs.executeScript(tabId, {
	                        ...file,
	                        matchAboutBlank,
	                        allFrames,
	                        runAt
	                    });
	                }
	                chrome.tabs.executeScript(tabId, {
	                    code: `${loadCheck} = true`,
	                    runAt: 'document_start',
	                    allFrames
	                });
	            };
	            chrome.tabs.onUpdated.addListener(listener);
	            const registeredContentScript = {
	                async unregister() {
	                    chromeP.tabs.onUpdated.removeListener(listener);
	                }
	            };
	            if (typeof callback === 'function') {
	                callback(registeredContentScript);
	            }
	            return Promise.resolve(registeredContentScript);
	        }
	    };
	}

}());
