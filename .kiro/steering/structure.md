# Project Structure

## Root Files

- `manifest.json`: Base manifest file
- `manifest_ff.json`: Firefox-specific manifest
- `manifest_chromium.json`: Chrome/Edge-specific manifest
- `.eslintrc.json`: ESLint configuration
- `README.md`: Project documentation

## Directory Organization

### `/background/`
Background scripts and service workers
- `background.js`: Main background script with context management
- `content-scripts-register-polyfill.js`: Polyfill for content script registration

### `/content-script/`
Scripts injected into web pages
- `snowbelt-cs.js`: Main content script for ServiceNow integration
- `getSession.js`: Session management utilities
- `purify.js`: DOM sanitization utilities

### `/dialog/`
Extension popup interface
- `snowbelt.html`: Main popup HTML
- `snowbelt.js`: Popup functionality
- `autocomplete.js`: Autocomplete functionality
- `basicContext.js` & `basicContext.min.css`: Context menu components
- `tips.js`: User tips and help

### `/options/`
Extension configuration interface
- `options.html`: Options page HTML
- `options.js`: Options page functionality

### `/css/`
Stylesheets
- `snowbelt.css`: Main extension styles

### `/icons/`
Extension icons and UI assets
- Tool icons (48px, 128px variants)
- UI elements (arrows, bulbs, external links, etc.)

### `/docs/`
Documentation and GitHub Pages
- `index.md`: Documentation homepage
- `_config.yml`: Jekyll configuration

### `/dist/`
Build artifacts and packaged extensions

## File Naming Conventions

- Use kebab-case for HTML/CSS files
- Use camelCase for JavaScript files and functions
- Use descriptive names that indicate purpose
- Prefix content scripts with purpose (e.g., `snowbelt-cs.js`)

## Code Organization

- Each directory serves a specific extension component
- Background scripts handle cross-tab coordination
- Content scripts handle page-specific functionality
- Dialog scripts manage user interface
- Options scripts handle configuration