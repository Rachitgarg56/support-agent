# Scrimba Project Style Guide 🎨

Follow these UI and code cleanliness criteria to ensure your project reviews pass criteria standards cleanly.

## 🧱 Component Layout Structure
* Store secondary components in an isolated `./components/` subdirectory.
* Name files using exact PascalCase syntax (e.g., `Navbar.jsx`, `MainContent.jsx`).
* Always sort your file imports systematically:
  1. React core hooks and native standard modules.
  2. External utility nodes or styles (`npm` packages).
  3. Local child components and assets.

## 🧪 CSS Architecture rules
* Prefer semantic utility variables over hardcoded magic values:
  ```css
  :root {
    --primary-purple: #6500e2;
    --dark-bg: #1e1e24;
  }