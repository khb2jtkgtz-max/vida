# Sincronización Vida

## Cómo funciona

1. Los datos se guardan primero en `localStorage` (offline-first).
2. Con un código de sincronización activo, la app sube/baja un blob JSON
   `{ updatedAt, state }` a **MantleDB** (`https://mantledb.sh`), sin que
   tengas que crear cuenta Firebase/Google Cloud.
3. El código es un UUID; el namespace en la nube es `vida-<código>/state`.
4. Conflictos: **last-write-wins** según `updatedAt` del blob completo.
5. Auto-sync: debounce ~1.5s tras cambios, y también al recuperar foco / online.
6. Opcional: el servidor en `/workspace/vida-sync-server` ofrece `GET/PUT /api/sync/:id`
   y sirve la PWA; la app lo usa como respaldo si está disponible (mismo origen).

## Probar en dos dispositivos

1. Abre la PWA en el iPhone (Safari → Agregar a pantalla de inicio).
2. Toca **Sincronizar entre dispositivos** → **Crear código** → **Copiar**.
3. En el Mac abre la misma URL → Sincronizar → pega el código → **Conectar**.
4. Crea un hábito en un lado; en el otro toca la app o “Sincronizar ahora”.

## Hosting

Sirve `vida-app` por HTTPS (o usa `vida-sync-server`). Sync en la nube
funciona aunque el host cambie, mientras MantleDB esté accesible.
