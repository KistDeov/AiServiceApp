# AiServiceApp Build Utasítások

## Gyors Build (Ajánlott)

```bash
# Tisztítás
npm run clean

# Webpack build
npm run build

# Windows installer készítése
npm run make:win
```

## Alternatív Build (Ha problémák vannak)

```bash
# Egyszerű konfigurációval
npm run make:simple
```

## Teljes Build (Minden platform)

```bash
npm run make
```

## Hibaelhárítás

### Ha a build lassú vagy nem fejeződik be:

1. **Tisztítsd meg a cache-t:**
   ```bash
   npm run clean
   npm cache clean --force
   ```

2. **Próbáld az egyszerű konfigurációt:**
   ```bash
   npm run make:simple
   ```

3. **Ellenőrizd a Node.js verziót:**
   ```bash
   node --version
   ```
   (Ajánlott: Node.js 18+)

### Gyakori hibák:

- **"Cannot copy to subdirectory"**: Futtasd `npm run clean` parancsot
- **"Module not found"**: Futtasd `npm install` parancsot
- **Lassú build**: Használd `npm run make:win` helyett `npm run make`

## Build Output

A build eredménye a `out/` könyvtárban található:
- `out/aiserviceapp-win32-x64/` - A csomagolt alkalmazás
- `out/make/squirrel.windows/x64/` - A Windows installer

## Optimalizálások

- Csak Windows build: `npm run make:win`
- Cache használata: `.electron-cache/` könyvtár
- Felesleges fájlok kizárása: `ignore` szabályok a `forge.config.js`-ben 