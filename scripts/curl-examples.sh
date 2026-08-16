#!/usr/bin/env bash
# Ejemplos de curl para aureon-auth-back, en el mismo orden y con los mismos
# casos de uso que postman/aureon-auth-back.postman_collection.json.
#
# Uso:
#   bash scripts/curl-examples.sh            -> corre el flujo completo de punta a punta
#   bash scripts/curl-examples.sh health     -> corre solo una seccion (ver nombres al final del archivo)
#
# Requiere: el servicio corriendo en BASE_URL (por defecto http://localhost:3001)
# y node en PATH (se usa para parsear las respuestas JSON, no hay jq instalado
# en este equipo).

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
PLATFORM_BOOTSTRAP_KEY="${PLATFORM_BOOTSTRAP_KEY:-secreto-de-plataforma-para-pruebas-locales}"
TENANT_CODE="${TENANT_CODE:-curl-demo}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@curl-demo.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Password123!}"

ACCESS_TOKEN=""
REFRESH_TOKEN=""
TENANT_ID=""
USUARIO_ADMIN_ID=""
MODULO_ID=""
PERMISO_ID=""
ROL_ID=""
MEMBRESIA_ID=""

# Extrae un campo de un JSON (soporta paths anidados: "usuario.tenantId").
json_get() {
  local json="$1" path="$2"
  node -e '
    const data = JSON.parse(process.argv[1] || "{}");
    const value = process.argv[2].split(".").reduce((cur, key) => (cur == null ? undefined : cur[key]), data);
    if (value !== undefined) process.stdout.write(String(value));
  ' "$json" "$path"
}

seccion() { echo; echo "==================== $1 ===================="; }

# ---------------------------------------------------------------------------
seccion "Health check"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" "$BASE_URL/health"

# ---------------------------------------------------------------------------
seccion "Crear tenant (bootstrap, protegido por X-Platform-Bootstrap-Key)"
RESP=$(curl -s -X POST "$BASE_URL/tenants" \
  -H "Content-Type: application/json" \
  -H "X-Platform-Bootstrap-Key: $PLATFORM_BOOTSTRAP_KEY" \
  -d "{
    \"codigoTenant\": \"$TENANT_CODE\",
    \"nombreTenant\": \"Curl Demo\",
    \"emailAdmin\": \"$ADMIN_EMAIL\",
    \"passwordAdmin\": \"$ADMIN_PASSWORD\",
    \"primerNombreAdmin\": \"Ana\",
    \"apellidoAdmin\": \"Admin\"
  }")
echo "$RESP"
TENANT_ID=$(json_get "$RESP" "tenant.id")
USUARIO_ADMIN_ID=$(json_get "$RESP" "usuarioAdminId")
echo "tenantId=$TENANT_ID  usuarioAdminId=$USUARIO_ADMIN_ID"

# ---------------------------------------------------------------------------
seccion "Listar tenants"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" "$BASE_URL/tenants?pagina=1&tamanioPagina=20" \
  -H "X-Platform-Bootstrap-Key: $PLATFORM_BOOTSTRAP_KEY"

# ---------------------------------------------------------------------------
seccion "Registrar usuario (auto-registro publico, rol por defecto = cliente)"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"nuevo.usuario@$TENANT_CODE.com\",
    \"password\": \"Password123!\",
    \"tenantCode\": \"$TENANT_CODE\",
    \"firstName\": \"Nuevo\",
    \"lastName\": \"Usuario\"
  }"

# ---------------------------------------------------------------------------
seccion "Login (sin tenantCode desde 2026-08-15; ver LoginResponse.tenants)"
RESP=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$ADMIN_EMAIL\",
    \"password\": \"$ADMIN_PASSWORD\"
  }")
echo "$RESP"
ACCESS_TOKEN=$(json_get "$RESP" "token")
REFRESH_TOKEN=$(json_get "$RESP" "refreshToken")
TENANT_ID=$(json_get "$RESP" "user.tenantId")
echo "accessToken=${ACCESS_TOKEN:0:20}...  refreshToken=${REFRESH_TOKEN:0:20}..."

# ---------------------------------------------------------------------------
seccion "Perfil propio (/auth/me)"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# ---------------------------------------------------------------------------
seccion "Refrescar token (rota el refresh token)"
RESP=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")
echo "$RESP"
ACCESS_TOKEN=$(json_get "$RESP" "token")
REFRESH_TOKEN=$(json_get "$RESP" "refreshToken")

# ---------------------------------------------------------------------------
seccion "RBAC - Crear modulo (bootstrap, catalogo GLOBAL)"
RESP=$(curl -s -X POST "$BASE_URL/modulos" \
  -H "Content-Type: application/json" \
  -H "X-Platform-Bootstrap-Key: $PLATFORM_BOOTSTRAP_KEY" \
  -d '{
    "codigo": "reportes",
    "nombre": "Reportes",
    "descripcion": "Modulo de reportes y analitica"
  }')
echo "$RESP"
MODULO_ID=$(json_get "$RESP" "id")
echo "moduloId=$MODULO_ID (vacio si el codigo 'reportes' ya existia de una corrida anterior)"

# ---------------------------------------------------------------------------
seccion "RBAC - Listar catalogo de modulos (admin)"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" "$BASE_URL/modulos" -H "Authorization: Bearer $ACCESS_TOKEN"

# ---------------------------------------------------------------------------
seccion "RBAC - Listar modulos activos del tenant (admin)"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" "$BASE_URL/rbac/modulos-tenant" -H "Authorization: Bearer $ACCESS_TOKEN"

# ---------------------------------------------------------------------------
if [ -n "$MODULO_ID" ]; then
  seccion "RBAC - Activar modulo para el tenant (admin)"
  curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$BASE_URL/rbac/modulos-tenant/$MODULO_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN"
fi

# ---------------------------------------------------------------------------
seccion "RBAC - Listar roles del tenant (admin)"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" "$BASE_URL/rbac/roles" -H "Authorization: Bearer $ACCESS_TOKEN"

# ---------------------------------------------------------------------------
seccion "RBAC - Crear rol (admin)"
RESP=$(curl -s -X POST "$BASE_URL/rbac/roles" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "codigo": "gerente",
    "nombre": "Gerente",
    "descripcion": "Rol intermedio con permisos de solo lectura"
  }')
echo "$RESP"
ROL_ID=$(json_get "$RESP" "id")

# ---------------------------------------------------------------------------
seccion "RBAC - Listar catalogo de permisos (admin)"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" "$BASE_URL/rbac/permisos" -H "Authorization: Bearer $ACCESS_TOKEN"

# ---------------------------------------------------------------------------
if [ -n "$MODULO_ID" ]; then
  seccion "RBAC - Crear permiso bajo el modulo (admin, codigo unico global)"
  RESP=$(curl -s -X POST "$BASE_URL/rbac/permisos" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d "{
      \"moduloId\": \"$MODULO_ID\",
      \"codigo\": \"reportes:ver\",
      \"nombre\": \"Ver reportes\"
    }")
  echo "$RESP"
  PERMISO_ID=$(json_get "$RESP" "id")
fi

# ---------------------------------------------------------------------------
if [ -n "$ROL_ID" ] && [ -n "$PERMISO_ID" ]; then
  seccion "RBAC - Asignar permiso a rol (admin)"
  curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$BASE_URL/rbac/roles/$ROL_ID/permisos" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d "{\"permisoId\": \"$PERMISO_ID\"}"
fi

# ---------------------------------------------------------------------------
if [ -n "$PERMISO_ID" ]; then
  seccion "RBAC - Asignar permiso directo a usuario (ALLOW)"
  curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$BASE_URL/rbac/permisos/usuarios/$USUARIO_ADMIN_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d "{\"permisoId\": \"$PERMISO_ID\", \"effect\": \"ALLOW\", \"razon\": \"Prueba manual con curl\"}"

  seccion "RBAC - Quitar permiso directo a usuario"
  curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X DELETE "$BASE_URL/rbac/permisos/usuarios/$USUARIO_ADMIN_ID/$PERMISO_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN"
fi

# ---------------------------------------------------------------------------
seccion "RBAC - Listar membresias del tenant (admin)"
RESP=$(curl -s "$BASE_URL/rbac/membresias?pagina=1&tamanioPagina=20" -H "Authorization: Bearer $ACCESS_TOKEN")
echo "$RESP"
MEMBRESIA_ID=$(json_get "$RESP" "data.0.id")

if [ -n "$MEMBRESIA_ID" ]; then
  seccion "RBAC - Obtener membresia por id (admin)"
  curl -s -w "\nHTTP_STATUS:%{http_code}\n" "$BASE_URL/rbac/membresias/$MEMBRESIA_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN"

  # Descomentar para probar (cambia de rol / desactiva la membresia del admin logueado):
  # seccion "RBAC - Actualizar membresia (cambiar rol)"
  # curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X PATCH "$BASE_URL/rbac/membresias/$MEMBRESIA_ID" \
  #   -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS_TOKEN" \
  #   -d "{\"rolId\": \"$ROL_ID\"}"
  #
  # seccion "RBAC - Desactivar membresia (baja logica)"
  # curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X DELETE "$BASE_URL/rbac/membresias/$MEMBRESIA_ID" \
  #   -H "Authorization: Bearer $ACCESS_TOKEN"
fi

# ---------------------------------------------------------------------------
seccion "Self-service - Solicitar reset de password"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$BASE_URL/auth/password/olvide" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$ADMIN_EMAIL\"}"
echo "El token real solo aparece en el log de auditoria del servidor (nunca en la respuesta HTTP)."
echo "Copialo de ahi y pegalo abajo para probar 'restablecer':"
echo 'curl -s -X POST '"$BASE_URL"'/auth/password/restablecer -H "Content-Type: application/json" -d '"'"'{"token":"<pegar-aqui>","nuevaPassword":"NuevaPassword123!"}'"'"

# ---------------------------------------------------------------------------
seccion "Self-service - Reenviar verificacion de email (usuario logueado)"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$BASE_URL/auth/email/reenviar-verificacion" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# ---------------------------------------------------------------------------
seccion "Self-service - Iniciar configuracion MFA (usuario logueado, solo plumbing)"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$BASE_URL/auth/mfa/iniciar-configuracion" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# ---------------------------------------------------------------------------
seccion "Logout (idempotente)"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$BASE_URL/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"

echo
echo "Listo. Variables finales: TENANT_ID=$TENANT_ID USUARIO_ADMIN_ID=$USUARIO_ADMIN_ID MODULO_ID=$MODULO_ID PERMISO_ID=$PERMISO_ID ROL_ID=$ROL_ID MEMBRESIA_ID=$MEMBRESIA_ID"
