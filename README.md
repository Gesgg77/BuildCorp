# BuildCorp

Evaluación backend: sistema de alquiler de herramientas en Django 5.2 / PostgreSQL.

## Estado real
- Implementados: herramientas, contratistas, préstamos, administración Django, validación de préstamo duplicado y bloqueo básico por morosidad en el formulario del administrador.
- **Pendientes**: API REST, firma digital, mantenimiento preventivo, frontend de usuarios, automatización robusta de estados, pruebas y defensa completa. No presentar estas funciones como realizadas.

## Requisitos
- Python 3.11+; PostgreSQL
- Crear una base `buildcorp` con propietario `buildcorp_app`
- Usar Ubuntu/EC2 con PostgreSQL local para cumplir el enunciado.

## Instalación en Ubuntu (dentro del repo)
```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
```
Edita `.env` para configurar los datos reales. Genera una clave nueva ejecutando:
```bash
.venv/bin/python -c "import secrets; print(secrets.token_urlsafe(48))"
```
Copia el resultado a `DJANGO_SECRET_KEY` en `.env`; **nunca** lo subas a GitHub.

```bash
.venv/bin/python manage.py check
.venv/bin/python manage.py migrate
.venv/bin/python manage.py collectstatic --noinput
.venv/bin/python manage.py createsuperuser
```
El servidor de desarrollo `runserver` no debe usarse como servidor público. Para EC2 utilizar Gunicorn detrás de Nginx y configurar la IP pública en `DJANGO_ALLOWED_HOSTS`.

Ejemplo de ejecución local temporal de Gunicorn, solo en loopback:
```bash
.venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8000
```

## Seguridad
No publicar `.env`, ni archivos de claves SSH. La clave Django anterior quedó expuesta en el historial público: **no reutilizarla**. Mantener PostgreSQL sin puerto público 5432. Configurar HTTP/HTTPS mediante Nginx y cerrar debug antes de publicar.

## Evidencias
Archivo `prompts_ia.md` documenta asistencia de IA; agregar pruebas, capturas, comandos de despliegue e IP pública una vez verificados.
