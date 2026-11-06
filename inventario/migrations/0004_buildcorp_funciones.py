# Migración de nuevas reglas y mantenimiento en BuildCorp.
import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [("inventario", "0003_prestamo")]

    operations = [
        migrations.AddField(
            model_name="herramienta",
            name="horas_uso",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="herramienta",
            name="fecha_proximo_mantenimiento",
            field=models.DateField(null=True, blank=True),
        ),
        migrations.AlterField(
            model_name="herramienta",
            name="estado",
            field=models.CharField(
                max_length=20, default="disponible",
                choices=[
                    ("disponible", "Disponible"),
                    ("en_uso", "En uso"),
                    ("mantenimiento", "Mantenimiento"),
                    ("baja", "Dado de baja"),
                ],
            ),
        ),
        migrations.AddField(
            model_name="contratista",
            name="suspendido",
            field=models.BooleanField(
                default=False, help_text="Bloqueo manual adicional."
            ),
        ),
        migrations.AddField(
            model_name="prestamo",
            name="firma_responsable",
            field=models.CharField(
                max_length=100, blank=True,
                help_text="Constancia de recepción: nombre escrito por el responsable (no firma criptográfica).",
            ),
        ),
        migrations.AlterModelOptions(
            name="prestamo",
            options={"ordering": ["-fecha_entrega", "-pk"]},
        ),
        migrations.AddConstraint(
            model_name="prestamo",
            constraint=models.UniqueConstraint(
                fields=("herramienta",),
                condition=Q(fecha_devolucion__isnull=True),
                name="un_prestamo_abierto_por_herramienta",
            ),
        ),
        migrations.CreateModel(
            name="Mantenimiento",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("tipo", models.CharField(
                    max_length=20,
                    choices=[("preventivo", "Preventivo"), ("correctivo", "Correctivo")],
                    default="preventivo"
                )),
                ("fecha_programada", models.DateField()),
                ("fecha_realizada", models.DateField(blank=True, null=True)),
                ("descripcion", models.TextField(blank=True)),
                ("herramienta", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    to="inventario.herramienta",
                )),
            ],
            options={"ordering": ["fecha_programada"]},
        ),
    ]
