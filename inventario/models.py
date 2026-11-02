from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone

class Herramienta(models.Model):
    codigo = models.CharField(max_length=30, unique=True)
    nombre = models.CharField(max_length=100)
    estado = models.CharField(
        max_length=20,
        choices=[
            ("disponible", "Disponible"),
            ("en_uso", "En uso"),
            ("baja", "Dado de baja"),
        ],
            default="disponible"
    )

    def __str__(self):
        return self.nombre

class Contratista(models.Model):
    nombre = models.CharField(max_length=100)
    rut = models.CharField(max_length=12, unique=True)

    def __str__(self):
        return self.nombre

class Prestamo(models.Model):
    herramienta = models.ForeignKey(
        Herramienta,
        on_delete=models.PROTECT
    )

    contratista = models.ForeignKey(
        Contratista,
        on_delete=models.PROTECT
    )

    fecha_entrega = models.DateField()
    fecha_limite = models.DateField()
    fecha_devolucion = models.DateField(
        null=True,
        blank=True
    )

    def __str__(self):
        return f"{self.herramienta.nombre} - {self.contratista.nombre}"
    

    def clean(self):
        super().clean()

        if self.herramienta_id and self.fecha_devolucion is None:
            ocupada = Prestamo.objects.filter(
                herramienta_id=self.herramienta_id,
                fecha_devolucion__isnull=True
            ).exclude(pk=self.pk).exists()

            if ocupada:
                raise ValidationError({
                    "herramienta": "Esta herramienta ya está prestada."
                })


        if self.contratista_id and self.fecha_devolucion is None:
            moroso = Prestamo.objects.filter(
                contratista_id=self.contratista_id,
                fecha_devolucion__isnull=True,
                fecha_limite__lt=timezone.localdate()
            ).exclude(pk=self.pk).exists()

            if moroso:
                raise ValidationError({
                    "contratista": "Tiene devoluciones atrasadas."
                })