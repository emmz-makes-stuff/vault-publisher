/**
 * The one hand-written stylesheet, per `design.md` §2 — no framework, no
 * CSS build step, no bundler. `writeSite` (`writer.ts`) writes this string
 * to `/styles.css` in the output directory; `page.ts` links it there,
 * root-absolute, from every page regardless of nesting depth.
 *
 * Light theme only, and deliberately so: `site-navigation`'s "readable on
 * a phone" requirement has a scenario where the reader's device prefers
 * dark mode and the site must still present its light theme. That rules
 * out a `prefers-color-scheme: dark` block here — there must never be one
 * — and it means every colour below is set explicitly rather than left to
 * inherit from a default that a dark-mode browser would otherwise supply.
 * `color-scheme: light` tells the browser not to darken what it renders
 * itself (form controls, scrollbars) even on a dark-mode device; the GFM
 * task lists this pipeline emits (`pipeline.ts`) render `disabled`
 * `<input type="checkbox">` elements that would otherwise pick up the
 * UA's dark styling despite every other colour on the page staying light.
 *
 * The explorer (`explorer.ts`) is `<details>`/`<summary>` with no script
 * anywhere; nothing in this stylesheet requires or references one either.
 */
export const STYLESHEET = `:root {
  color-scheme: light;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  max-width: 100%;
  overflow-x: hidden;
}

body {
  background: #ffffff;
  color: #1a1a1a;
  font-family:
    -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

a {
  color: #1656a8;
}

a:visited {
  color: #4d3a9e;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  line-height: 1.25;
  color: #111111;
}

code,
pre {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  background: #f4f4f4;
  color: #1a1a1a;
}

code {
  padding: 0.1em 0.35em;
  border-radius: 0.25em;
}

pre {
  padding: 0.75em 1em;
  border-radius: 0.35em;
  overflow-x: auto;
  max-width: 100%;
}

pre code {
  padding: 0;
  background: none;
}

img {
  max-width: 100%;
}

blockquote {
  margin: 1em 0;
  padding: 0.6em 1em;
  border-left: 0.3em solid #cccccc;
  background: #fafafa;
  color: #333333;
}

/* Obsidian-style callouts (callouts.ts): one class per recognised type,
   layered on top of the plain blockquote rule above. */
.callout {
  border-left-width: 0.3em;
  border-left-style: solid;
}

.callout-title {
  margin: 0 0 0.35em 0;
  font-weight: 700;
}

.callout-note,
.callout-info {
  border-left-color: #3b82c4;
  background: #eaf3fb;
}

.callout-abstract,
.callout-tip,
.callout-success {
  border-left-color: #2f9e5c;
  background: #e9f7ef;
}

.callout-quote {
  border-left-color: #8b8b8b;
  background: #f4f4f4;
}

.callout-warning {
  border-left-color: #c98a1a;
  background: #fbf1e0;
}

.callout-important,
.callout-danger {
  border-left-color: #c4382f;
  background: #fbeae8;
}

/* Tables — including the frontmatter table (frontmatter.ts) — scroll
   inside themselves on a narrow viewport rather than the page body ever
   scrolling: display: block turns the table element itself into the
   scroll container overflow-x applies to, so no extra wrapper markup is
   needed. */
table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  margin: 1em 0;
}

th,
td {
  border: 1px solid #d8d8d8;
  padding: 0.4em 0.7em;
  text-align: left;
}

th {
  background: #f4f4f4;
}

.frontmatter-table {
  font-size: 0.9em;
}

ul.contains-task-list {
  list-style: none;
  padding-left: 0.25em;
}

.task-list-item input[type="checkbox"] {
  margin-right: 0.5em;
}

/* Layout — the explorer to the left of the page content on a wide
   viewport; below the mobile breakpoint the explorer stacks above the
   content instead, still reachable through details/summary alone with no
   script and no markup change. */
.layout {
  display: flex;
  align-items: flex-start;
  gap: 1.5em;
  max-width: 70em;
  margin: 0 auto;
  padding: 1.5em;
}

.explorer {
  flex: 0 0 16em;
  font-size: 0.95em;
}

.explorer ul {
  list-style: none;
  margin: 0;
  padding-left: 1em;
}

.explorer > ul {
  padding-left: 0;
}

.explorer summary {
  cursor: pointer;
  font-weight: 600;
}

.content {
  flex: 1 1 0;
  min-width: 0;
}

@media (max-width: 40em) {
  .layout {
    flex-direction: column;
    padding: 1em;
    gap: 1em;
  }

  .explorer {
    flex-basis: auto;
    width: 100%;
  }
}
`;
