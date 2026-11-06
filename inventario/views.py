from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.utils import timezone
import json
from .models import Herramienta, Contratista, Prestamo, Mantenimiento


@login_required
def dashboard(request):
    hoy = timezone.localdate()
    atrasados = Prestamo.objects.filter(
        fecha_devolucion__isnull=True,
        fecha_limite__lt=hoy,
    ).select_related("herramienta", "contratista")
    pendientes_mantenimiento = Mantenimiento.objects.filter(
        fecha_realizada__isnull=True,
        fecha_programada__lte=hoy
    ).select_related("herramienta")
    proximos = Prestamo.objects.filter(
        fecha_devolucion__isnull=True
    ).select_related("herramienta", "contratista").order_by("fecha_limite")[:8]
    return render(request, "inventario/dashboard.html", {
        "herramientas": Herramienta.objects.count(),
        "disponibles": Herramienta.objects.filter(estado="disponible").count(),
        "prestados": Prestamo.objects.filter(fecha_devolucion__isnull=True).count(),
        "contratistas": Contratista.objects.count(),
        "atrasados": atrasados.count(),
        "atrasados_lista": list(atrasados[:6]),
        "mantenimientos": pendientes_mantenimiento.count(),
        "mantenimientos_lista": list(pendientes_mantenimiento[:6]),
        "proximos": proximos,
        "hoy": hoy,
    })


@login_required
def api_console(request):
    """Centro operativo con solicitudes autenticadas a la API JSON real."""
    models = {
        "herramientas": Herramienta,
        "prestamos": Prestamo,
        "contratistas": Contratista,
        "mantenimientos": Mantenimiento,
    }
    permissions = {}
    for name, model in models.items():
        label = f"{model._meta.app_label}."
        suffix = model._meta.model_name
        permissions[name] = {
            operation: request.user.is_staff and request.user.has_perm(
                label + operation + "_" + suffix
            )
            for operation in ("add", "change", "delete")
        }
    return render(request, "inventario/api_console.html", {
        "api_permissions_json": json.dumps(permissions),
    })
