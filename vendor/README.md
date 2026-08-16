# vendor/

`@aureon/redis-client` vive en `azure/aureon-redis-client` (repo hermano, fuera de este). Antes
se consumia via `file:../aureon-redis-client`, pero eso rompe cualquier build que solo clone
este repo (Railway, CI) — la carpeta hermana no existe fuera de la maquina de desarrollo.

Mientras no se decida un registro real (Azure Artifacts u otro), se vendoriza aqui un tarball
compilado de la libreria, committeado dentro de este mismo repo. `package.json` apunta a
`file:vendor/aureon-redis-client-<version>.tgz` — un path relativo DENTRO del repo, que si
resuelve en un checkout limpio.

## Como actualizar cuando cambie la libreria

```bash
cd ../../aureon-redis-client   # o la ruta local a azure/aureon-redis-client
npm run build
npm pack                        # genera aureon-redis-client-<version>.tgz
cp aureon-redis-client-<version>.tgz ../aureon-auth-back/vendor/
```

Despues, en este repo: actualizar la version en el `file:` de `package.json` (dependencies) y
correr `npm install`. Borrar el `.tgz` viejo de `vendor/` si cambio de version.
