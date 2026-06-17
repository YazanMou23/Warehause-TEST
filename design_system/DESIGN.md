---
name: Industrial Precision System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0058be'
  on-secondary: '#ffffff'
  secondary-container: '#2170e4'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#271901'
  on-tertiary-container: '#98805d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#fcdeb5'
  tertiary-fixed-dim: '#dec29a'
  on-tertiary-fixed: '#271901'
  on-tertiary-fixed-variant: '#574425'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-margin: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

This design system is engineered for high-stakes operational environments where speed, accuracy, and scalability are paramount. It fuses the structural rigueur of industrial software with the refined usability of modern developer tools.

The aesthetic is **Corporate Modern with a technical edge**, prioritizing high information density and cognitive clarity. It utilizes a structured grid and clear visual hierarchy to ensure that logistics personnel can scan complex data sets and execute actions with zero friction.

**Key Attributes:**
- **Fast:** Reduced motion and instantaneous transitions.
- **Reliable:** Heavy emphasis on status persistence and clear feedback loops.
- **Precise:** Sharp edges, monospaced numerical data, and meticulous alignment.
- **Scalable:** A modular architecture designed to handle thousands of SKUs and real-time transit data.

## Colors

The palette is anchored by **Industrial Navy** (#0F172A) to provide a grounded, authoritative feel, while **Logistics Blue** (#3B82F6) serves as the primary action color. 

- **Primary Action:** Logistics Blue is used for primary buttons, active states, and progress indicators.
- **Functional Signaling:** Success Green, Alert Red, and Warning Orange are reserved strictly for status badges, error states, and critical inventory alerts. They must maintain a high contrast ratio against both light and dark backgrounds.
- **Neutral Scales:** Use a cool-toned gray scale (Slate) to differentiate background surfaces from content containers. 

For **Dark Mode**, the surface colors shift to a deep Slate palette (#020617), maintaining the same accent colors but adjusting text contrast to ensure AAA accessibility for late-night warehouse shifts.

## Typography

The system utilizes **Geist** for its exceptional legibility and technical aesthetic. For numerical data, SKU codes, and tracking numbers, **JetBrains Mono** is introduced to ensure character distinction (e.g., distinguishing '0' from 'O') which is critical in logistics.

- **Headlines:** Use Bold and Semi-Bold weights to create a strong visual anchor on dashboard views.
- **Data Density:** Body-sm (14px) is the workhorse for table data and sidebars, allowing for maximum information visibility without compromising readability.
- **Mono Usage:** Any field containing a Tracking ID, Serial Number, or Coordinates must use the `data-mono` style.

## Layout & Spacing

This design system uses a **Fluid-Fixed Hybrid Grid**. The main sidebar is fixed at 280px, while the content area utilizes a 12-column fluid grid.

- **Spacing Rhythm:** Based on a 4px baseline. Most components use 8px (stack-sm) or 16px (stack-md) padding.
- **Information Density:** For data-heavy tables, use "Compact" mode with 8px vertical cell padding. For standard forms, use 12px or 16px.
- **Breakpoints:**
  - **Mobile (<768px):** Single column, 16px margins, hidden sidebar (drawer).
  - **Tablet (768px - 1280px):** 12-column grid, 24px margins, collapsed icon-only sidebar.
  - **Desktop (>1280px):** 12-column grid, 32px margins, expanded sidebar.

## Elevation & Depth

To maintain a "High-Performance" feel, elevation is used sparingly to avoid visual clutter.

- **Tonal Layers:** The primary background is the lowest layer. Content areas use a white (or Slate-900 in dark mode) surface.
- **Low-Contrast Outlines:** Instead of heavy shadows, use 1px borders (#E2E8F0 in light, #1E293B in dark) to define containers.
- **Interactive Elevation:** Only apply subtle, crisp shadows (4px blur, 10% opacity) to active dropdowns, modals, and hovering "Draggable" inventory cards to indicate they are "lifted" from the grid.
- **State Differentiation:** Use "Pressed" states with a subtle inner shadow to provide tactile feedback for warehouse workers using touch interfaces.

## Shapes

The design system adopts a **Soft (0.25rem)** roundedness approach. This maintains an industrial, organized feel while appearing modern and accessible.

- **Standard Elements:** Buttons, Input fields, and Chips use a 4px (0.25rem) radius.
- **Containers:** Large dashboard cards and Modals use 8px (0.5rem) to softly frame large data sets.
- **Status Pills:** Status badges use a full pill-shape (999px) to distinguish them from interactive buttons.

## Components

### Buttons
- **Primary:** Solid Logistics Blue (#3B82F6). High-contrast white text.
- **Secondary:** Industrial Navy border with transparent background.
- **Sizes:** Standard (40px height) for desktop; Large (56px height) for warehouse "Touch Mode" to accommodate gloved hands or rapid tapping.

### Tables (Critical Component)
- **Header:** Sticky, Slate-50 background, uppercase `label-md` typography.
- **Rows:** Alternating zebra stripes for long-form data. 1px bottom border.
- **Cells:** Use `data-mono` for SKU/ID columns.

### Status Badges
- High-saturation background at 10-15% opacity with 100% opacity text of the same color. 
- Example: "In Transit" (Blue), "Delivered" (Green), "Delayed" (Red).

### Input Fields
- Clear labels above the field. 
- 1px Slate-300 border that thickens and turns Logistics Blue on focus.
- Error states must include both a red border and a 16px icon for accessibility.

### Cards
- No shadows. 1px border. 
- Title area separated by a subtle horizontal rule. 
- Integrated "Quick Actions" in the top right corner.
