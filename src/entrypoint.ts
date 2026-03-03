/**
 * Application entrypoint.
 *
 * Imports polyfills, applies the Web Awesome theme to the document,
 * then loads the main app shell component which bootstraps everything else.
 *
 * Import order matters: the theme must be applied before WA components
 * render so that CSS custom property tokens are available.
 */
import "urlpattern-polyfill";
import "./styles/apply-theme.js";
import "./components/app-shell.js";
