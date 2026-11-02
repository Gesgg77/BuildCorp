from django.contrib import admin
from django.utils import timezone
from .models import Herramienta, Contratista, Prestamo, Mantenimiento

admin.site.site_header = "BuildCorp · Administración"
admin.site.site_title = "BuildCorp"
admin.site.index_title = "Gestión de herramientas y préstamos"


@admin.register(Herramienta)
class HerramientaAdmin(admin.ModelAdmin):
    list_display = ("codigo", "nombre", "estado", "horas_uso", "fecha_proximo_mantenimiento", "mantenimiento_vencido")
    list_filter = ("estado", "fecha_proximo_mantenimiento")
    search_fields = ("codigo", "nombre")


@admin.register(Contratista)
class ContratistaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "rut", "suspendido", "moroso")
    list_filter = ("suspendido",)
    search_fields = ("nombre", "rut")


@admin.register(Prestamo)
class PrestamoAdmin(admin.ModelAdmin):
    list_display = ("id", "herramienta", "contratista", "fecha_entrega", "fecha_limite", "fecha_devolucion", "atrasado", "firma_responsable")
    list_filter = ("fecha_limite", "fecha_devolucion")
    search_fields = ("herramienta__nombre", "herramienta__codigo", "contratista__nombre", "contratista__rut")
    autocomplete_fields = ("herramienta", "contratista")
    readonly_fields = ("atrasado",)


@admin.register(Mantenimiento)
class MantenimientoAdmin(admin.ModelAdmin):
    list_display = ("herramienta", "tipo", "fecha_programada", "fecha_realizada", "vencido")
    list_filter = ("tipo", "fecha_programada", "fecha_realizada")
    search_fields = ("herramienta__codigo", "herramienta__nombre")
    autocomplete_fields = ("herramienta",)
