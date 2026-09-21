# Native icon and splash

Source for store icons: `icon.png` (1024×1024 RGB, no alpha). Flattened from
`app/public/brand/korpasset-social-1024.png` onto `#F8F9FA` because App Store
rejects 1024 icons with transparency.

Regenerate iOS/Android mipmaps after changing `icon.png` or `splash.png`:

```bash
cd native
npm run assets
```
