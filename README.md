# Mailbuilder

A lightweight, Vercel-ready HTML email variant generator that runs entirely in the browser. Upload a zip that contains your base template and an `images/` directory, pick how many variants you need, preview them, and download each one or all at once.

## Features
- Client-side zip extraction (no files leave the browser)
- Inline images for accurate previews while keeping the original image folder in downloads
- Structural HTML shuffling (tables/divs/spacers/comments) to help defeat duplicate detection without changing the responsive layout
- Single-variant and bulk zip downloads with the original `images/` assets included

## Usage
1. Build a zip that contains one HTML file (e.g., `template.html`) and an `images/` folder with your assets.
2. Open `index.html` (or deploy to Vercel).
3. Upload the zip and choose how many variants (up to 10).
4. Preview each variant, copy the HTML, or download one/all variants as zip files.

## Deployment
The project is static and requires no build step. On Vercel, keep the included `vercel.json` to treat `index.html` as the entry point.
