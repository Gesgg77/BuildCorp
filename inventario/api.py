from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers, viewsets
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import SAFE_METHODS

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


class AdminEscrituraAutenticadoLectura:
    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsAuthenticated()]
        return [IsAdminUser()]


class HerramientaViewSet(AdminEscrituraAutenticadoLectura, viewsets.ModelViewSet):
    queryset = Herramienta.objects.all().order_by("codigo")
    serializer_class = HerramientaSerializer


class ContratistaViewSet(AdminEscrituraAutenticadoLectura, viewsets.ModelViewSet):
    queryset = Contratista.objects.all().order_by("nombre")
    serializer_class = ContratistaSerializer


class PrestamoViewSet(AdminEscrituraAutenticadoLectura, viewsets.ModelViewSet):
    queryset = Prestamo.objects.select_related("herramienta", "contratista").all()
    serializer_class = PrestamoSerializer


class MantenimientoViewSet(AdminEscrituraAutenticadoLectura, viewsets.ModelViewSet):
    queryset = Mantenimiento.objects.select_related("herramienta").all()
    serializer_class = MantenimientoSerializer
