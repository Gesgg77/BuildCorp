from django.db import models, transaction
from django.db.models import Q
from django.core.exceptions import ValidationError
from django.utils import timezone


class Herramienta(models.Model):
    ESTADOS = [
        ("disponible", "Disponible"),
        ("en_uso", "En uso"),
        ("mantenimiento", "Mantenimiento"),
        ("baja", "Dado de baja"),
    ]
    codigo = models.CharField(max_length=30, unique=True)
    nombre = models.CharField(max_length=100)
    estado = models.CharField(max_length=20, choices=ESTADOS, default="disponible")
    horas_uso = models.PositiveIntegerField(default=0)
    fecha_proximo_mantenimiento = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.codigo} — {self.nombre}"

    @property
    def mantenimiento_vencido(self):
        return bool(
            self.fecha_proximo_mantenimiento
            and self.fecha_proximo_mantenimiento <= timezone.localdate()
        )


class Contratista(models.Model):
    nombre = models.CharField(max_length=100)
    rut = models.CharField(max_length=12, unique=True)
    suspendido = models.BooleanField(default=False, help_text="Bloqueo manual adicional.")

    def __str__(self):
        return self.nombre

    @property
    def moroso(self):
        return self.prestamo_set.filter(
            fecha_devolucion__isnull=True,
            fecha_limite__lt=timezone.localdate()
        ).exists()


class Prestamo(models.Model):
    herramienta = models.ForeignKey(Herramienta, on_delete=models.PROTECT)
    contratista = models.ForeignKey(Contratista, on_delete=models.PROTECT)
    fecha_entrega = models.DateField()
    fecha_limite = models.DateField()
    fecha_devolucion = models.DateField(null=True, blank=True)
    firma_responsable = models.CharField(
        max_length=100, blank=True,
        help_text="Constancia de recepción: nombre escrito por el responsable (no firma criptográfica)."
    )

    class Meta:
        ordering = ["-fecha_entrega", "-pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["herramienta"],
                condition=Q(fecha_devolucion__isnull=True),
                name="un_prestamo_abierto_por_herramienta",
            ),
        ]

    def __str__(self):
        return f"{self.herramienta} — {self.contratista}"

    @property
    def atrasado(self):
        return self.fecha_devolucion is None and self.fecha_limite < timezone.localdate()

    def clean(self):
        super().clean()
        errors = {}

        if self.fecha_entrega and self.fecha_limite and self.fecha_limite < self.fecha_entrega:
            errors["fecha_limite"] = "La fecha límite no puede preceder a la entrega."
        if self.fecha_devolucion and self.fecha_entrega and self.fecha_devolucion < self.fecha_entrega:
            errors["fecha_devolucion"] = "La devolución no puede preceder a la entrega."

        if self.herramienta_id and self.fecha_devolucion is None:
            ocupada = Prestamo.objects.filter(
                herramienta_id=self.herramienta_id,
                fecha_devolucion__isnull=True,
            ).exclude(pk=self.pk).exists()
            if ocupada:
                errors["herramienta"] = "Esta herramienta ya está prestada."
            elif self._state.adding and self.herramienta.estado != "disponible":
                errors["herramienta"] = "La herramienta no está disponible."

        if self.contratista_id and self.fecha_devolucion is None:
            if self.contratista.suspendido:
                errors["contratista"] = "El contratista está suspendido."
            elif Prestamo.objects.filter(
                contratista_id=self.contratista_id,
                fecha_devolucion__isnull=True,
                fecha_limite__lt=timezone.localdate(),
            ).exclude(pk=self.pk).exists():
                errors["contratista"] = "El contratista tiene devoluciones atrasadas."

        if self._state.adding and not self.firma_responsable.strip():
            errors["firma_responsable"] = "Registrar la constancia de recepción."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        with transaction.atomic():
            previous_tool_id = None
            if self.pk:
                previous_tool_id = Prestamo.objects.filter(pk=self.pk).values_list(
                    "herramienta_id", flat=True
                ).first()
            super().save(*args, **kwargs)
            if self.fecha_devolucion is None:
                Herramienta.objects.filter(pk=self.herramienta_id).update(estado="en_uso")
            else:
                Herramienta.objects.filter(
                    pk=self.herramienta_id, estado="en_uso"
                ).update(estado="disponible")
            if previous_tool_id and previous_tool_id != self.herramienta_id:
                if not Prestamo.objects.filter(
                    herramienta_id=previous_tool_id,
                    fecha_devolucion__isnull=True,
                ).exists():
                    Herramienta.objects.filter(
                        pk=previous_tool_id, estado="en_uso"
                    ).update(estado="disponible")


class Mantenimiento(models.Model):
    TIPOS = [("preventivo", "Preventivo"), ("correctivo", "Correctivo")]
    herramienta = models.ForeignKey(Herramienta, on_delete=models.PROTECT)
    tipo = models.CharField(max_length=20, choices=TIPOS, default="preventivo")
    fecha_programada = models.DateField()
    fecha_realizada = models.DateField(null=True, blank=True)
    descripcion = models.TextField(blank=True)

    class Meta:
        ordering = ["fecha_programada"]

    def __str__(self):
        return f"{self.herramienta} — {self.get_tipo_display()}"

    @property
    def vencido(self):
        return self.fecha_realizada is None and self.fecha_programada < timezone.localdate()

    def clean(self):
        super().clean()
        if self.fecha_realizada and self.fecha_realizada < self.fecha_programada:
            raise ValidationError({
                "fecha_realizada": "La realización no puede anteceder a la programación."
            })

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)
