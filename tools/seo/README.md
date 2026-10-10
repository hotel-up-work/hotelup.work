# Social images

The 29 page-specific JPEG cards in `src/assets/seo/` are 1200 × 630 pixels.
Every prerendered page uses a card through `data.meta.image` in `src/app/app.routes.ts`.
Hotel-specific `/proposal/:slug` pages share the proposal card. The default image
and initial HTML metadata use the home card. Existing indexing rules still apply.

These are code-native branded graphics, rendered with Windows System.Drawing,
not AI-generated photographs or screenshots of real hotel data. The palette follows
the landing page; the illustrations represent each page's function.

To change card copy or illustration types, edit `social-images.json`, then regenerate
on Windows from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/seo/generate-social-images.ps1
```

Commit the generated JPEGs. The production build copies them to `/seo/` without
requiring the renderer, network access, or extra dependencies. For a new route,
add its card and set the matching route's `data.meta.image`.

After `npm run build`, verify every card and hotel proposal's built metadata:

```sh
node tools/seo/verify-social-images.mjs
```
