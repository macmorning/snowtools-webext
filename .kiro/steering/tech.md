# Technology Stack

## Core Technologies

- **JavaScript**: Vanilla JavaScript (ES6+), no external frameworks or build tools
- **Web Extensions API**: Manifest V3 for cross-browser compatibility
- **Browser APIs**: Chrome Extensions API (tabs, storage, cookies)

## Code Quality

- **ESLint**: Standard configuration with custom rules
  - 4-space indentation
  - Double quotes for strings
  - Semicolons required
  - Console logging allowed

## Browser Compatibility

- **Manifest Files**: Separate manifests for different browsers
  - `manifest.json`: Base manifest
  - `manifest_ff.json`: Firefox-specific (uses `scripts` for background)
  - `manifest_chromium.json`: Chrome/Edge-specific (uses `service_worker` for background)

## Development Commands

```bash
# Linting
eslint .

# Testing
# Load as unpacked extension in browser developer mode
# Firefox: about:debugging -> This Firefox -> Load Temporary Add-on
# Chrome: chrome://extensions -> Developer mode -> Load unpacked
# Edge: edge://extensions -> Developer mode -> Load unpacked
```

## Dependencies

- **No external dependencies**: Pure vanilla JavaScript implementation
- **No build process**: Direct file loading, no compilation step required
- **ESLint only**: Single development dependency for code quality

## Architecture

- **Background Scripts**: Service worker pattern for Chromium, scripts for Firefox
- **Content Scripts**: Injected into web pages for DOM manipulation
- **Popup Interface**: HTML/JS dialog for main extension interface
- **Options Page**: Separate configuration interface