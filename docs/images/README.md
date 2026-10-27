# Neutral screenshots

`demo-mobile.png` (390×844) and `demo-desktop.png` (1280×900) are Chromium captures of the served neutral build. They were generated with reduced motion and visually reviewed for layout and private information on 2026-10-27. README embeds both captures.

Run `npm run screenshots` after installing the development browser tooling. The generator builds only the committed neutral sample in an isolated temporary directory, serves it over loopback HTTP, and captures the real page. It cannot select private config or a production hostname. Inspect regenerated images before committing them; the source audit does not inspect pixels.
