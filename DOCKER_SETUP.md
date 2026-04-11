# HomeOn - Docker Setup en Mac Mini (VM Ubuntu)

## Requisitos previos

- VM Ubuntu Server con Docker y Docker Compose instalados
- La VM debe estar en la misma red LAN que los dispositivos (cámaras, Hue, MQTT)
- Cloudflare account con un dominio configurado

## Setup inicial (primera vez)

### 1. Clonar el repo en la VM

```bash
ssh tu-usuario@ip-de-la-vm
mkdir -p ~/homeon
cd ~/homeon
git clone https://github.com/tu-usuario/domotic-back.git
cd domotic-back
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Cambiar como mínimo:
- `DB_PASSWORD` → contraseña segura
- `JWT_SECRET` → `openssl rand -base64 32`
- `TAPO_USERNAME` / `TAPO_PASSWORD` → tus credenciales TP-Link
- `CLOUDFLARE_TUNNEL_TOKEN` → token del tunnel (ver paso 3)

### 3. Crear tunnel en Cloudflare

1. Ir a [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → Networks → Tunnels
2. Create a tunnel → nombre: `homeon`
3. Copiar el token y pegarlo en `.env` como `CLOUDFLARE_TUNNEL_TOKEN`
4. Configurar Public Hostname:
   - Subdomain: `api` (o el que quieras)
   - Domain: `tu-dominio.com`
   - Service: `http://localhost:3001`

### 4. Levantar todo

```bash
# Build y arrancar
make build
make up

# Verificar que todo esté corriendo
make status
make health

# Ver logs
make logs
```

### 5. Verificar conectividad a dispositivos

```bash
# Desde dentro de la VM (el backend usa host network)
# Debería poder alcanzar tus dispositivos:
ping 192.168.1.x   # IP de cámara Tapo
ping 192.168.1.x   # IP de Hue Bridge
```

### 6. Probar el backend

```bash
# Health check
curl http://localhost:3001/health

# Login (usuario default: admin / admin123)
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# Probar via tunnel (desde fuera de la red)
curl https://api.tu-dominio.com/health
```

## Comandos útiles

| Comando | Descripción |
|---------|-------------|
| `make up` | Levantar todo |
| `make down` | Parar todo |
| `make restart-backend` | Reiniciar solo el backend |
| `make logs` | Ver logs en tiempo real |
| `make logs-backend` | Solo logs del backend |
| `make health` | Verificar salud de todos los servicios |
| `make deploy` | Pull + rebuild + restart |
| `make db-shell` | Abrir psql |
| `make backup-db` | Backup de la DB |
| `make reset-db` | ⚠️ Destruir y recrear DB |

## Deploy desde GitHub

Push a `main` → GitHub Action hace SSH a la VM → `git pull` + `docker compose build` + restart.

### Configurar secrets en GitHub

Settings → Secrets → Actions:
- `VM_HOST`: IP pública o hostname de tu VM (puede ser el dominio con Cloudflare)
- `VM_USER`: usuario SSH
- `VM_SSH_KEY`: clave privada SSH
- `VM_SSH_PORT`: puerto SSH (default: 22)

## Red y conectividad

El backend usa `network_mode: host`, lo que significa que comparte la interfaz de red de la VM Ubuntu. Esto le permite:

- Conectarse a cámaras Tapo en `192.168.x.x` via HTTP/HTTPS
- Comunicarse con el Hue Bridge en su IP local
- Publicar mensajes MQTT al broker de la RPi
- Acceder al motor de IA local

PostgreSQL y Redis corren en containers bridge pero exponen sus puertos en `127.0.0.1`, accesibles desde el backend via host network.

## Troubleshooting

### El backend no llega a las cámaras
```bash
# Verificar que la VM tiene IP en la LAN
ip addr show
# Verificar que puede hacer ping a la cámara
ping 192.168.1.x
# Verificar que el container usa host network
docker inspect homeon-backend | grep NetworkMode
```

### Las tablas no se crearon
```bash
# Verificar que los SQL init corrieron
make db-shell
\dt   # listar tablas
```
Si la DB ya existía antes, el init SQL no se re-ejecuta. Hay que borrar el volumen:
```bash
make reset-db
make up
```

### El tunnel no conecta
```bash
make logs | grep cloudflared
# Verificar que el token es correcto en .env
```
