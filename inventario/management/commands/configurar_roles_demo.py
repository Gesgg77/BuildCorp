"""Configura grupos de demostracion de BuildCorp (idempotente)."""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from inventario.models import Herramienta, Prestamo, Contratista, Mantenimiento


class Command(BaseCommand):
    help = "Crea los grupos Operador y Lector, con permisos por modelo."

    def handle(self, *args, **options):
        models = (Herramienta, Prestamo, Contratista, Mantenimiento)

        def perms_for(mapping):
            permissions = []
            for model, actions in mapping.items():
                content_type = ContentType.objects.get_for_model(model)
                for action in actions:
                    permissions.append(Permission.objects.get(
                        content_type=content_type,
                        codename=f"{action}_{model._meta.model_name}",
                    ))
            return permissions

        operator_access = {
            Herramienta: ("view", "add", "change"),
            Prestamo: ("view", "add", "change"),
            Contratista: ("view",),
            Mantenimiento: ("view", "add", "change"),
        }
        reader_access = {model: ("view",) for model in models}
        for name, mapping in (("Operador", operator_access), ("Lector", reader_access)):
            group, created = Group.objects.get_or_create(name=name)
            group.permissions.set(perms_for(mapping))
            self.stdout.write(self.style.SUCCESS(
                f"Grupo {name}: {'creado' if created else 'actualizado'}."
            ))
        self.stdout.write("Asigna usuarios a los grupos desde /admin/auth/user/.")
        self.stdout.write("El usuario Operador debe ser staff; Lector no debe ser staff.")
        self.stdout.write("El administrador principal conserva su cuenta superuser.")
