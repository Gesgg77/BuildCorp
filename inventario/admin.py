from django.contrib import admin
from .models import Herramienta, Contratista, Prestamo

@admin.register(Herramienta)
class HerramientaAdmin(admin.ModelAdmin):
    list_display = ("codigo", "nombre", "estado")
    list_filter = ("estado",)
    search_fields = ("codigo", "nombre")


@admin.register(Contratista)
class ContratistaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "rut")
    search_fields = ("nombre", "rut")


@admin.register(Prestamo)
class PrestamoAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "herramienta",
        "contratista",
        "fecha_entrega",
        "fecha_limite",
        "fecha_devolucion",
    )

    list_filter = ("fecha_limite",)
    search_fields = (
        "herramienta__nombre",
        "contratista__nombre",
    )


