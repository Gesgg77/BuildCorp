from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models.deletion import ProtectedError
from rest_framework import serializers, viewsets
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Herramienta, Contratista, Prestamo, Mantenimiento


class ModeloValidadoMixin:
    """Aplica además las reglas de clean() del modelo al guardar desde API."""
    def create(self, validated_data):
        try:
            return super().create(validated_data)
        except DjangoValidationError as exc:
            raise DRFValidationError(getattr(exc, "message_dict", exc.messages))

    def update(self, instance, validated_data):
        try:
            return super().update(instance, validated_data)
        except DjangoValidationError as exc:
            raise DRFValidationError(getattr(exc, "message_dict", exc.messages))


class HerramientaSerializer(ModeloValidadoMixin, serializers.ModelSerializer):
    mantenimiento_vencido = serializers.BooleanField(read_only=True)

    class Meta:
        model = Herramienta
        fields = ["id", "codigo", "nombre", "estado", "horas_uso", "fecha_proximo_mantenimiento", "mantenimiento_vencido"]


class ContratistaSerializer(ModeloValidadoMixin, serializers.ModelSerializer):
    moroso = serializers.BooleanField(read_only=True)

    class Meta:
        model = Contratista
        fields = ["id", "nombre", "rut", "suspendido", "moroso"]


class PrestamoSerializer(ModeloValidadoMixin, serializers.ModelSerializer):
    atrasado = serializers.BooleanField(read_only=True)
    herramienta_nombre = serializers.CharField(source="herramienta.nombre", read_only=True)
    contratista_nombre = serializers.CharField(source="contratista.nombre", read_only=True)

    class Meta:
        model = Prestamo
        fields = [
            "id", "herramienta", "herramienta_nombre", "contratista",
            "contratista_nombre", "fecha_entrega", "fecha_limite",
            "fecha_devolucion", "firma_responsable", "atrasado"
        ]


class MantenimientoSerializer(ModeloValidadoMixin, serializers.ModelSerializer):
    vencido = serializers.BooleanField(read_only=True)

    class Meta:
        model = Mantenimiento
        fields = ["id", "herramienta", "tipo", "fecha_programada", "fecha_realizada", "descripcion", "vencido"]


class PermisosPorModelo(BasePermission):
    """Lee cualquier usuario autenticado; escribe staff con permiso por modelo."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        if not user.is_staff:
            return False
        operation = {
            "POST": "add", "PUT": "change",
            "PATCH": "change", "DELETE": "delete",
        }.get(request.method)
        if operation is None:
            return False
        model = view.get_queryset().model
        permission_name = f"{model._meta.app_label}.{operation}_{model._meta.model_name}"
        return user.has_perm(permission_name)


class AdminEscrituraAutenticadoLectura:
    permission_classes = [PermisosPorModelo]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "No se puede eliminar porque existen registros relacionados."},
                status=status.HTTP_409_CONFLICT,
            )


class HerramientaViewSet(AdminEscrituraAutenticadoLectura, viewsets.ModelViewSet):
    queryset = Herramienta.objects.all().order_by("codigo")
    serializer_class = HerramientaSerializer


class ContratistaViewSet(AdminEscrituraAutenticadoLectura, viewsets.ModelViewSet):
    queryset = Contratista.objects.all().order_by("nombre")
    serializer_class = ContratistaSerializer


class PrestamoViewSet(AdminEscrituraAutenticadoLectura, viewsets.ModelViewSet):
    queryset = Prestamo.objects.select_related("herramienta", "contratista").all()
    serializer_class = PrestamoSerializer

    def perform_destroy(self, instance):
        herramienta_id = instance.herramienta_id
        with transaction.atomic():
            instance.delete()
            if not Prestamo.objects.filter(
                herramienta_id=herramienta_id,
                fecha_devolucion__isnull=True,
            ).exists():
                Herramienta.objects.filter(
                    pk=herramienta_id, estado="en_uso"
                ).update(estado="disponible")


class MantenimientoViewSet(AdminEscrituraAutenticadoLectura, viewsets.ModelViewSet):
    queryset = Mantenimiento.objects.select_related("herramienta").all()
    serializer_class = MantenimientoSerializer
